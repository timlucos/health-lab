// ИИ-тренер: разбор тренировки, недельный отчёт и вопросы.
// Любой OpenAI-совместимый провайдер (ProxyAPI, VseGPT, AITunnel, OpenAI): секреты AI_API_KEY, AI_BASE_URL, AI_MODEL.
// Доступ только владельцу: каждый запрос к данным идёт с его JWT, функции БД сами проверяют владельца.

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const KEY = Deno.env.get("AI_API_KEY") ?? "";
const BASE = (Deno.env.get("AI_BASE_URL") ?? "https://api.proxyapi.ru/v1").replace(/\/$/, "");
const MODEL = Deno.env.get("AI_MODEL") ?? "anthropic/claude-sonnet-5";
// Необязательная дешёвая модель для чата и совета на день (например deepseek-v4-pro).
const LIGHT = Deno.env.get("AI_MODEL_LIGHT") ?? "";

// Цены ProxyAPI, ₽ за 1 млн токенов (вход, выход), октябрь 2026. Для подсчёта расхода в приложении.
const PRICE: [RegExp, number, number][] = [
  [/claude-sonnet/, 600, 3030],
  [/claude-haiku/, 200, 1000],
  [/gpt-6-astra/, 1580, 7900],
  [/gpt-5\.4-mini/, 230, 1370],
  [/deepseek-v4-pro/, 180, 550],
  [/deepseek-v4-flash/, 20, 40],
  [/gemini-3\.\d-flash/, 455, 2275],
];
function cost(model: string, tin: number, tout: number): number | null {
  const p = PRICE.find(([re]) => re.test(model));
  return p ? Math.round(((tin * p[1] + tout * p[2]) / 1e6) * 100) / 100 : null;
}

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
Смотри на данные часов (готовность, ВСР, пульс покоя, сон, нагрузка ACWR), подходы и веса, самочувствие и замеры, питание за неделю (food_week).
Не ставь диагнозов; при боли в суставе, груди, одышке или головокружении советуй врача.
Цифры бери только из данных, не выдумывай. Если данных не хватает (нет веса, нет тренировок), прямо скажи, что внести.
Пиши термины по-русски: «вариабельность пульса (ВСР)», «нагрузка недели к обычной» в процентах (acwr 1,1 = 110%), «быстрый сон» вместо REM, «кислород» вместо SpO2. Без англицизмов.`;

const FORMAT: Record<string, string> = {
  workout: "Формат: Markdown, разделы «Итог», «Что хорошо», «Что подтянуть», «Дальше» (конкретные веса и подходы на следующую тренировку). До 200 слов.",
  weekly: "Формат: Markdown, разделы «Итог недели», «Прогресс», «Что подтянуть», «План на следующую неделю». До 250 слов.",
  daily: "Формат: Markdown, без заголовка, 3–5 пунктов: тренироваться сегодня или нет и как (с учётом плана), питание и белок, вода, сон (во сколько лечь). До 90 слов.",
  health: "Формат: Markdown, разделы «Итог», «Сон», «Сердце и восстановление» (ВСР, пульс покоя, кислород, температура, дыхание), «Нагрузка и активность», «Тело» (вес, замеры), «Что тревожит» (если ничего — так и скажи), «Что улучшить» (3–5 конкретных шагов). Сравнивай последнюю неделю с предыдущими, называй тренды цифрами. До 380 слов.",
  chat: "Формат: Markdown, отвечай по сути вопроса, коротко; если просят план — давай конкретный план с весами, подходами, днями. До 250 слов, если не просят подробнее.",
};

// Компактный JSON: без пустых полей, числа округлены — меньше токенов, дешевле запрос.
function compact(o: unknown) {
  return JSON.stringify(o, (_k, v) => {
    if (v === null || v === "" || (Array.isArray(v) && !v.length)) return undefined;
    if (typeof v === "number") return Math.round(v * 10) / 10;
    return v;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  let body: { kind?: string; day?: string; question?: string; history?: { role: string; content: string }[]; text?: string; image?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const day = /^\d{4}-\d{2}-\d{2}$/.test(body.day ?? "") ? body.day! : new Date().toISOString().slice(0, 10);
  if (body.kind === "barcode") return barcode(auth, String(body.code ?? ""));
  if (body.kind === "food" || body.kind === "label") return food(auth, body.kind, day, body.text, body.image);
  const kind = ["weekly", "chat", "daily", "health"].includes(body.kind ?? "") ? body.kind! : "workout";

  try {
    // Проверка владельца и сбор данных одним махом: любая функция вернёт 403 чужому.
    const [summary, progress, plan, workouts, review, goal, foodDay] = await Promise.all([
      rpc(auth, "hl_summary", { days: kind === "health" ? 42 : kind === "weekly" ? 35 : 14 }),
      rpc(auth, "hl_progress", { weeks: 8 }),
      rpc(auth, "hl_plan", { d: day }),
      rpc(auth, "hl_workouts", { lim: 14 }),
      rpc(auth, "hl_review", { d: day }),
      rpc(auth, "hl_goal", {}),
      rpc(auth, "hl_food_day", { d: day }),
    ]);
    if (!KEY) return json({ error: "no_key" }, 503);

    const nDays = kind === "daily" ? 7 : kind === "health" ? 42 : 14;
    const days = (summary?.days ?? []).slice(-nDays).map((x: Record<string, unknown>) => ({
      d: x.day, sleep: x.sleep_min, deep: x.sleep_deep_min, rem: x.sleep_rem_min, awake: x.sleep_awake_min, bed: x.sleep_start, hrv: x.hrv_ms, rhr: x.resting_hr,
      spo2: x.spo2_avg, resp: x.resp_rate, steps: x.steps, azm: x.azm, kcal: x.active_kcal, temp: x.skin_temp_delta_c, cardio_load: x.trimp,
    }));
    const load = (summary?.load ?? []).slice(-nDays).map((x: Record<string, unknown>) => ({ d: x.day, ready: x.readiness, acwr: x.acwr }));
    const names: Record<string, string> = Object.fromEntries(Object.entries(plan?.exercises ?? {}).map(([k, v]) => [k, (v as { name_ru?: string; name: string }).name_ru ?? (v as { name: string }).name]));
    const full = kind !== "daily";
    const data = {
      today: day,
      goal: goal ? { title: goal.title, until: goal.end_day, ...goal.details } : null,
      plan: plan?.plan ? { title: plan.plan.title, items: plan.plan.plan.map((i: { exercise_id: string; sets: number; reps: string }) => ({ ex: names[i.exercise_id] ?? i.exercise_id, sets: i.sets, reps: i.reps })) } : null,
      sets: (plan?.sets ?? []).map((s: { exercise_id: string; set_no: number; reps: number; weight_kg: number | null }) => ({ ex: names[s.exercise_id] ?? s.exercise_id, n: s.set_no, reps: s.reps, kg: s.weight_kg })),
      last_weights: kind === "workout" ? plan?.last : undefined,
      feeling_1_5: review,
      workouts: (workouts ?? []).slice(0, full ? 14 : 3).map((w: Record<string, unknown>) => ({ d: w.day, t: w.title, st: w.status, sets: w.sets, kg: w.volume_kg })),
      weeks: full ? progress?.weeks : undefined,
      body: progress?.checkins?.slice(full ? -8 : -1),
      feeling_history: full ? progress?.reviews?.slice(-8) : undefined,
      e1rm: full ? Object.fromEntries(Object.entries(progress?.lifts ?? {}).map(([k, v]) => [progress?.names?.[k] ?? names[k] ?? k, (v as unknown[]).slice(-6)])) : undefined,
      food_week: foodDay?.week,
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
      ...(kind === "chat" ? (body.history ?? []).slice(-4).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 1500) })) : []),
      { role: "user", content: `${task}\n\nДанные (JSON):\n${compact(data)}` },
    ];

    const model = LIGHT && (kind === "chat" || kind === "daily") ? LIGHT : MODEL;
    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, max_tokens: kind === "health" ? 1600 : kind === "daily" ? 500 : 1100, temperature: 0.4 }),
    });
    const out = await r.json().catch(() => null);
    if (!r.ok) return json({ error: "ai_failed", status: r.status, detail: out?.error?.message ?? null }, 502);
    const answer: string = out?.choices?.[0]?.message?.content ?? "";
    if (!answer) return json({ error: "ai_empty" }, 502);
    const tin = Number(out?.usage?.prompt_tokens ?? 0), tout = Number(out?.usage?.completion_tokens ?? 0);
    const rub = cost(model, tin, tout);
    await rpc(auth, "hl_ai_log", { kind, d: day, model, question: kind === "chat" ? String(body.question ?? "").slice(0, 2000) : null, answer, tokens_in: tin || null, tokens_out: tout || null, cost_rub: rub });
    return json({ answer, model, cost_rub: rub });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403 || /42501|forbidden/.test(String(e))) return json({ error: "forbidden" }, 403);
    return json({ error: "server", detail: String(e).slice(0, 300) }, 500);
  }
});

// ---------- питание ----------

const err = (e: unknown) => {
  const status = (e as { status?: number }).status;
  if (status === 401 || status === 403 || /42501|forbidden/.test(String(e))) return json({ error: "forbidden" }, 403);
  return json({ error: "server", detail: String(e).slice(0, 300) }, 500);
};

/** Штрихкод: сначала свои продукты, затем Open Food Facts (база ODbL). Найденное сохраняем к себе. */
async function barcode(auth: string, code: string) {
  if (!/^\d{8,14}$/.test(code)) return json({ error: "bad_code" }, 400);
  try {
    const own = await rpc(auth, "hl_food_product_get", { code });
    if (own) return json({ product: own, from: "own" });
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_ru,brands,nutriments,serving_quantity`, {
      headers: { "User-Agent": "HealthLab/1.0 (personal nutrition diary)" },
    });
    const j = r.ok ? await r.json().catch(() => null) : null;
    const p = j?.product;
    const n = p?.nutriments ?? {};
    const kcal = n["energy-kcal_100g"] ?? (n["energy_100g"] != null ? n["energy_100g"] / 4.184 : null);
    if (!p || kcal == null) return json({ product: null, from: "none" });
    const saved = await rpc(auth, "hl_food_product_save", {
      r: { barcode: code, name: p.product_name_ru || p.product_name || "Продукт " + code, brand: p.brands ?? null, kcal, protein: n.proteins_100g ?? null,
        fat: n.fat_100g ?? null, carbs: n.carbohydrates_100g ?? null, portion_g: p.serving_quantity ?? null, source: "off" },
    });
    return json({ product: saved, from: "off" });
  } catch (e) {
    return err(e);
  }
}

const FOOD_SYSTEM = `Ты диетолог. Определи еду и оцени вес порций в граммах. Значения КБЖУ давай на 100 г для типичного российского варианта блюда или продукта (как в таблицах Скурихина и на упаковках в российских магазинах).
Если есть подсказка пользователя (названия, граммы) — она важнее фото. Порции оценивай по тарелке (обычно 24–26 см), приборам, ладони. Соусы и масло учитывай отдельной строкой, если их видно или они обычно есть в блюде.
Ответ — только JSON без пояснений:
{"items":[{"name":"Гречка отварная","grams":200,"kcal_100":110,"protein_100":4.2,"fat_100":1.1,"carbs_100":21.3,"confidence":"high|medium|low"}],"note":"короткий совет по этому приёму пищи, до 25 слов"}`;

const LABEL_SYSTEM = `Это фото этикетки продукта из российского магазина. Найди название, бренд и пищевую ценность НА 100 г (если указано на порцию — пересчитай на 100 г). Масса упаковки или порции в граммах, если видна.
Ответ — только JSON: {"name":"…","brand":"…","kcal":0,"protein":0,"fat":0,"carbs":0,"portion_g":null}`;

/** Фото тарелки или текст «гречка 200 г, курица 150 г» → список продуктов с граммами и КБЖУ; фото этикетки → продукт. */
async function food(auth: string, kind: "food" | "label", day: string, text?: string, image?: string) {
  try {
    await rpc(auth, "hl_goal", {}); // проверка владельца до траты токенов
    if (!KEY) return json({ error: "no_key" }, 503);
    const img = image && /^data:image\/(jpeg|png|webp);base64,/.test(image) && image.length < 2_800_000 ? image : null;
    const hint = String(text ?? "").slice(0, 800);
    if (!img && !hint) return json({ error: "empty" }, 400);
    const content: unknown[] = [{ type: "text", text: kind === "label" ? "Распознай этикетку." : `Что съедено? ${hint ? "Подсказка: " + hint : "Подсказки нет."}` }];
    if (img) content.push({ type: "image_url", image_url: { url: img } });
    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, temperature: 0.2, messages: [{ role: "system", content: kind === "label" ? LABEL_SYSTEM : FOOD_SYSTEM }, { role: "user", content }] }),
    });
    const out = await r.json().catch(() => null);
    if (!r.ok) return json({ error: "ai_failed", status: r.status, detail: out?.error?.message ?? null }, 502);
    const raw: string = out?.choices?.[0]?.message?.content ?? "";
    const m = raw.match(/\{[\s\S]*\}/);
    let parsed: unknown = null;
    try {
      parsed = m ? JSON.parse(m[0]) : null;
    } catch {
      parsed = null;
    }
    const tin = Number(out?.usage?.prompt_tokens ?? 0), tout = Number(out?.usage?.completion_tokens ?? 0);
    const rub = cost(MODEL, tin, tout);
    await rpc(auth, "hl_ai_log", { kind: "food", d: day, model: MODEL, question: kind === "label" ? "этикетка" : hint || "фото", answer: raw.slice(0, 4000), tokens_in: tin || null, tokens_out: tout || null, cost_rub: rub });
    if (!parsed) return json({ error: "ai_empty" }, 502);
    return json({ result: parsed, cost_rub: rub });
  } catch (e) {
    return err(e);
  }
}
