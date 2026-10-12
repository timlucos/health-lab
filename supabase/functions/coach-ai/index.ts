// ИИ-тренер: разбор тренировки, недельный отчёт и вопросы.
// Любой OpenAI-совместимый провайдер (ProxyAPI, VseGPT, AITunnel, OpenAI): секреты AI_API_KEY, AI_BASE_URL, AI_MODEL.
// Доступ только владельцу: каждый запрос к данным идёт с его JWT, функции БД сами проверяют владельца.

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const KEY = Deno.env.get("AI_API_KEY") ?? "";
const BASE = (Deno.env.get("AI_BASE_URL") ?? "https://api.proxyapi.ru/v1").replace(/\/$/, "");
const MODEL = Deno.env.get("AI_MODEL") ?? "anthropic/claude-sonnet-5";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function rpc(auth: string, fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: ANON, Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  const text = await r.text();
  if (!r.ok) throw Object.assign(new Error(text), { status: r.status });
  return text ? JSON.parse(text) : null;
}

const SYSTEM = `Ты персональный тренер и спортивный врач. Пиши только по-русски, на «вы», коротко и по делу.
Клиент: средний опыт, цель — мышечная масса и выносливость за 6 месяцев (до апреля 2027), зал DDX Fitness (Technogym, Matrix), принимает креатин моногидрат. Его анкета и цели — в поле goal данных: рост, вес на старте и цель по весу, приоритеты, ограничения, питание. Считай калории и белок от его веса и цели (профицит 200–300 ккал для набора), сверяй темп набора с целью (0,25–0,5% веса в неделю).
Опирайся на современные данные: 10–20 рабочих подходов на мышцу в неделю, 0–3 повтора в запасе, прогрессия нагрузки, сон 7–9 ч, белок 1,6–2,2 г/кг, креатин 3–5 г в день ежедневно (вода в мышцах даёт +1–2 кг в первые недели — это не жир).
Смотри на данные часов (готовность, ВСР, пульс покоя, сон, нагрузка ACWR), подходы и веса, самочувствие и замеры.
Не ставь диагнозов; при боли в суставе, груди, одышке или головокружении советуй врача.
Цифры бери только из данных, не выдумывай. Если данных не хватает (нет веса, нет тренировок), прямо скажи, что внести.
Пиши термины по-русски: «вариабельность пульса (ВСР)», «нагрузка недели к обычной» в процентах (acwr 1,1 = 110%), «быстрый сон» вместо REM, «кислород» вместо SpO2. Без англицизмов.`;

const FORMAT: Record<string, string> = {
  workout: "Формат: Markdown, разделы «Итог», «Что хорошо», «Что подтянуть», «Дальше» (конкретные веса и подходы на следующую тренировку). До 250 слов.",
  weekly: "Формат: Markdown, разделы «Итог недели», «Прогресс», «Что подтянуть», «План на следующую неделю». До 300 слов.",
  daily: "Формат: Markdown, без заголовка, 3–5 пунктов: тренироваться сегодня или нет и как (с учётом плана), питание и белок, вода, сон (во сколько лечь). До 120 слов.",
  health: "Формат: Markdown, разделы «Итог», «Сон», «Сердце и восстановление» (ВСР, пульс покоя, кислород, температура, дыхание), «Нагрузка и активность», «Тело» (вес, замеры), «Что тревожит» (если ничего — так и скажи), «Что улучшить» (3–5 конкретных шагов). Сравнивай последнюю неделю с предыдущими, называй тренды цифрами. До 450 слов.",
  chat: "Формат: Markdown, отвечай по сути вопроса, коротко; если просят план — давай конкретный план с весами, подходами, днями. До 350 слов.",
};

function compact(o: unknown) {
  return JSON.stringify(o, (_k, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  let body: { kind?: string; day?: string; question?: string; history?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const kind = ["weekly", "chat", "daily", "health"].includes(body.kind ?? "") ? body.kind! : "workout";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(body.day ?? "") ? body.day! : new Date().toISOString().slice(0, 10);

  try {
    // Проверка владельца и сбор данных одним махом: любая функция вернёт 403 чужому.
    const [summary, progress, plan, workouts, review, goal] = await Promise.all([
      rpc(auth, "hl_summary", { days: kind === "health" ? 42 : kind === "weekly" ? 35 : 14 }),
      rpc(auth, "hl_progress", { weeks: 8 }),
      rpc(auth, "hl_plan", { d: day }),
      rpc(auth, "hl_workouts", { lim: 14 }),
      rpc(auth, "hl_review", { d: day }),
      rpc(auth, "hl_goal", {}),
    ]);
    if (!KEY) return json({ error: "no_key" }, 503);

    const days = (summary?.days ?? []).map((x: Record<string, unknown>) => ({
      d: x.day, sleep: x.sleep_min, deep: x.sleep_deep_min, rem: x.sleep_rem_min, awake: x.sleep_awake_min, bed: x.sleep_start, hrv: x.hrv_ms, rhr: x.resting_hr,
      spo2: x.spo2_avg, resp: x.resp_rate, steps: x.steps, azm: x.azm, kcal: x.active_kcal, temp: x.skin_temp_delta_c, cardio_load: x.trimp,
    }));
    const load = (summary?.load ?? []).map((x: Record<string, unknown>) => ({ d: x.day, ready: x.readiness, acwr: x.acwr }));
    const names: Record<string, string> = Object.fromEntries(Object.entries(plan?.exercises ?? {}).map(([k, v]) => [k, (v as { name_ru?: string; name: string }).name_ru ?? (v as { name: string }).name]));
    const data = {
      today: day,
      goal: goal ? { title: goal.title, until: goal.end_day, ...goal.details } : null,
      plan: plan?.plan ? { title: plan.plan.title, items: plan.plan.plan.map((i: { exercise_id: string; sets: number; reps: string }) => ({ ex: names[i.exercise_id] ?? i.exercise_id, sets: i.sets, reps: i.reps })) } : null,
      sets: (plan?.sets ?? []).map((s: { exercise_id: string; set_no: number; reps: number; weight_kg: number | null }) => ({ ex: names[s.exercise_id] ?? s.exercise_id, n: s.set_no, reps: s.reps, kg: s.weight_kg })),
      last_weights: plan?.last ?? {},
      feeling_1_5: review,
      workouts: workouts,
      weeks: progress?.weeks,
      body: progress?.checkins,
      feeling_history: progress?.reviews,
      e1rm: Object.fromEntries(Object.entries(progress?.lifts ?? {}).map(([k, v]) => [progress?.names?.[k] ?? names[k] ?? k, v])),
      watch_days: days,
      readiness: load,
    };

    const task =
      kind === "health"
        ? "Сделай глубокий разбор здоровья за последние недели по данным часов, замерам и самочувствию."
        : kind === "daily"
          ? "Дай совет на сегодня: по готовности, сну и нагрузке, с учётом плана тренировки на сегодня (если он есть)."
          : kind === "weekly"
        ? "Сделай недельный отчёт: динамика веса и замеров, объём тренировок по неделям, прогресс в силовых (e1RM), восстановление по часам и самочувствию. Что скорректировать на следующей неделе."
        : kind === "chat"
          ? `Ответь на вопрос клиента, опираясь на данные. Вопрос: ${String(body.question ?? "").slice(0, 2000)}`
          : "Разбери сегодняшнюю тренировку: выполнение плана, веса и повторы против прошлого раза, самочувствие, готовность по часам. Что сделать на следующей тренировке и для восстановления.";

    const messages = [
      { role: "system", content: `${SYSTEM}\n${FORMAT[kind]}` },
      ...(kind === "chat" ? (body.history ?? []).slice(-8).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 4000) })) : []),
      { role: "user", content: `${task}\n\nДанные (JSON):\n${compact(data)}` },
    ];

    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: kind === "health" ? 2000 : 1400, temperature: 0.4 }),
    });
    const out = await r.json().catch(() => null);
    if (!r.ok) return json({ error: "ai_failed", status: r.status, detail: out?.error?.message ?? null }, 502);
    const answer: string = out?.choices?.[0]?.message?.content ?? "";
    if (!answer) return json({ error: "ai_empty" }, 502);
    await rpc(auth, "hl_ai_report_save", { kind, d: day, model: MODEL, question: kind === "chat" ? String(body.question ?? "").slice(0, 2000) : null, answer });
    return json({ answer, model: MODEL });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403 || /42501|forbidden/.test(String(e))) return json({ error: "forbidden" }, 403);
    return json({ error: "server", detail: String(e).slice(0, 300) }, 500);
  }
});
