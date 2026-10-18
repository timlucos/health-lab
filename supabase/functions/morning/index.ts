// Утренняя сводка: совет на день от ИИ и пуш на телефон (Web Push, ключи VAPID хранятся только в базе).
// Вечером — напоминание, что не записано; в воскресенье — недельный разбор; при заряде часов ≤ 20% — «поставьте на зарядку».
// Расписание (pg_cron, health.push_tick) зовёт с x-health-key; из приложения — с JWT владельца: подписка, проверка, «прислать сейчас».
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

/** Расход на ИИ и остаток на счёте (через coach-ai: ключ ИИ живёт только там). */
type Money = { week_rub?: number; month_rub?: number; balance_rub?: number | null; balance_miss?: string | null };
async function money(): Promise<Money | null> {
  try {
    const r = await fetch(`${URL_}/functions/v1/coach-ai`, { method: "POST", headers: { ...svcHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ kind: "balance" }) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
const rubs = (v: number) => `${(Math.round(v * 10) / 10).toLocaleString("ru-RU")} ₽`;
const LOW_BALANCE = 100;

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
  const dev = (await rpc(svc, "hl_devices", {}).catch(() => null))?.list?.[0];
  const low = dev?.battery != null && dev.battery <= 30 ? `Заряд часов ${dev.battery}%, поставьте на зарядку. ` : "";
  const m = await money();
  const poor = m?.balance_rub != null && m.balance_rub < LOW_BALANCE ? `На счёте ИИ ${rubs(m.balance_rub)}, пора пополнить. ` : "";
  const text = low + poor + plain;
  const body = text ? (text.length > 220 ? text.slice(0, 217) + "…" : text) : "Откройте «Сегодня»: план и совет на день.";
  return { sent: await send(title, body, "/"), advice: !!plain, ai };
}

/** Вечернее напоминание без ИИ: что не записано за день и сколько не хватает белка. Нечего сказать — не шлём. */
async function evening() {
  const day = moscowDay();
  const [food, plan, goal] = await Promise.all([
    rpc(svc, "hl_food_day", { d: day }).catch(() => null),
    rpc(svc, "hl_plan", { d: day }).catch(() => null),
    rpc(svc, "hl_goal", {}).catch(() => null),
  ]);
  const lines: string[] = [];
  const p = plan?.plan;
  if (p && (p.status === "planned" || p.status === "in_progress") && !(plan.sets ?? []).some((s: { reps: number }) => s.reps > 0)) lines.push(`Тренировка «${p.title}» не отмечена. Если была — внесите подходы, если нет — перенесите.`);
  const entries = food?.entries ?? [];
  const w = goal?.details?.start_weight_kg;
  if (!entries.length) lines.push("Еда за сегодня не записана: без неё тренер не видит белок и калории.");
  else if (w) {
    const prot = Math.round(entries.reduce((a: number, e: { protein: number | null }) => a + (e.protein ?? 0), 0));
    const need = Math.round(w * 1.8);
    if (prot < need * 0.85) lines.push(`Белок ${prot} из ~${need} г: добавьте творог, яйца или протеин до сна.`);
  }
  if (!lines.length) return { sent: 0, skipped: "nothing" };
  return { sent: await send("Вечерняя проверка", lines.join(" "), entries.length ? "/coach" : "/food") };
}

/** Заряд часов на исходе: напоминание поставить на зарядку (раз в день, решает health.push_tick). */
async function battery() {
  const dev = (await rpc(svc, "hl_devices", {}))?.list?.[0];
  if (!dev || dev.battery == null || dev.battery > 20) return { sent: 0, skipped: "ok" };
  return { sent: await send(`Заряд часов ${dev.battery}%`, `${dev.name ?? "Часы"} скоро сядут. Поставьте на зарядку, чтобы не потерять ночной сон и пульс.`, "/") };
}

/** Воскресный недельный разбор (Claude) и пуш со ссылкой на него. */
async function weekly() {
  const r = await fetch(`${URL_}/functions/v1/coach-ai`, {
    method: "POST",
    headers: { ...svcHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "weekly", day: moscowDay() }),
  });
  const j = await r.json().catch(() => null);
  const plain = String(j?.answer ?? "").replace(/[#*_`>]/g, "").replace(/^\s*[-•]\s*/gm, "").replace(/\n+/g, " ").trim();
  const m = await money();
  const cash = m ? `ИИ за неделю: ${rubs(m.week_rub ?? 0)}${m.balance_rub != null ? `, на счёте ${rubs(m.balance_rub)}` : ""}. ` : "";
  const main = r.ok && plain ? plain : "Разбор не получился, подробности в «Разборах».";
  const body = (cash + main).length > 230 ? (cash + main).slice(0, 227) + "…" : cash + main;
  return { sent: await send("Итоги недели", body, "/coach/reports?k=weekly"), ok: r.ok, money: m };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({}));
  try {
    const key = req.headers.get("x-health-key");
    if (key) {
      if (!(await rpc(svc, "hl_admin_ok", { k: key }))) return json({ error: "forbidden" }, 403);
      if (body.kind === "money") return json(await money()); // проверка без отправки
      return json(body.kind === "evening" ? await evening() : body.kind === "weekly" ? await weekly() : body.kind === "battery" ? await battery() : await morning());
    }
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    await rpc(auth, "hl_push_info", {}); // только владелец
    if (body.action === "vapid") return json({ public_key: (await vapid()).public });
    if (body.action === "test") return json({ sent: await send("Здоровье Лаб", "Уведомления работают. Утренняя сводка придёт в назначенное время.", "/") });
    if (body.action === "now") return json(await morning());
    return json({ error: "bad_action" }, 400);
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403 || /42501|forbidden/.test(String(e))) return json({ error: "forbidden", detail: String(e).slice(0, 200) }, 403);
    return json({ error: "server", detail: String(e).slice(0, 300) }, 500);
  }
});
