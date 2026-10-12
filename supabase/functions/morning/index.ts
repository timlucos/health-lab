// Утренняя сводка: совет на день от ИИ и пуш на телефон (Web Push, ключи VAPID хранятся только в базе).
// Расписание (pg_cron) зовёт с x-health-key; из приложения — с JWT владельца: подписка, проверка, «прислать сейчас».
import webpush from "npm:web-push@3.6.7";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITE = "https://health-lab-one.vercel.app";
const svc = `Bearer ${SERVICE}`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Серверный ключ: старый (JWT) идёт и в apikey, и в Authorization; новый (sb_secret_…) — только в apikey.
const svcHeaders = (): Record<string, string> => (SERVICE.startsWith("eyJ") ? { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } : { apikey: SERVICE });

async function rpc(auth: string, fn: string, args: Record<string, unknown>) {
  const h = auth === svc ? svcHeaders() : { apikey: ANON, Authorization: auth };
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  const text = await r.text();
  if (!r.ok) throw Object.assign(new Error(text), { status: r.status });
  return text ? JSON.parse(text) : null;
}
const moscowDay = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);

/** Ключи VAPID: создаём один раз и храним в базе, наружу отдаём только открытый. */
async function vapid(): Promise<{ public: string; private: string }> {
  const t = await rpc(svc, "hl_push_targets", {});
  if (t?.vapid?.public) return t.vapid;
  const k = webpush.generateVAPIDKeys();
  await rpc(svc, "hl_vapid_set", { v: { public: k.publicKey, private: k.privateKey } });
  return (await rpc(svc, "hl_push_targets", {})).vapid;
}

async function send(title: string, body: string, url = "/") {
  const v = await vapid();
  webpush.setVapidDetails(SITE, v.public, v.private);
  const { subs } = await rpc(svc, "hl_push_targets", {});
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(s, JSON.stringify({ title, body, url }), { TTL: 6 * 3600, urgency: "normal" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await rpc(svc, "hl_push_dead", { ep: s.endpoint }).catch(() => {});
    }
  }
  return sent;
}

/** Совет на день (DeepSeek через coach-ai) и пуш с готовностью и сном. */
async function morning() {
  const day = moscowDay();
  const sum = await rpc(svc, "hl_summary", { days: 3 }).catch(() => null);
  const last = sum?.load?.at(-1);
  const sleep = sum?.days?.at(-1)?.sleep_min;
  let advice = "";
  let ai: unknown = null;
  try {
    const r = await fetch(`${URL_}/functions/v1/coach-ai`, {
      method: "POST",
      headers: { ...svcHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "daily", day }),
    });
    const j = await r.json().catch(() => null);
    advice = r.ok ? (j?.answer ?? "") : "";
    if (!r.ok) ai = { status: r.status, error: j?.error ?? j?.msg ?? null, detail: String(j?.detail ?? j?.message ?? "").slice(0, 200) };
  } catch (e) {
    ai = { error: String(e).slice(0, 200) };
  }
  const plain = advice.replace(/[#*_`>]/g, "").replace(/^\s*[-•]\s*/gm, "").replace(/\n+/g, " ").trim();
  const head = [last?.readiness != null ? `готовность ${Math.round(last.readiness)}` : null, sleep ? `сон ${Math.floor(sleep / 60)} ч ${Math.round(sleep % 60)} мин` : null].filter(Boolean).join(" · ");
  const title = head ? `Доброе утро: ${head}` : "Доброе утро";
  const body = plain ? (plain.length > 220 ? plain.slice(0, 217) + "…" : plain) : "Откройте «Сегодня»: план и совет на день.";
  return { sent: await send(title, body, "/"), advice: !!plain, ai };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({}));
  try {
    const key = req.headers.get("x-health-key");
    if (key) {
      if (!(await rpc(svc, "hl_admin_ok", { k: key }))) return json({ error: "forbidden" }, 403);
      return json(await morning());
    }
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    await rpc(auth, "hl_push_info", {}); // только владелец
    if (body.action === "vapid") return json({ public_key: (await vapid()).public });
    if (body.action === "test") return json({ sent: await send("Здоровье Лаб", "Уведомления работают. Утренняя сводка придёт в 7:40.", "/") });
    if (body.action === "now") return json(await morning());
    return json({ error: "bad_action" }, 400);
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403 || /42501|forbidden/.test(String(e))) return json({ error: "forbidden", detail: String(e).slice(0, 200) }, 403);
    return json({ error: "server", detail: String(e).slice(0, 300) }, 500);
  }
});
