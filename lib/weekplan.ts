// Рацион на неделю из своей базы рецептов — без ИИ: бесплатно, мгновенно и не падает (просьба 13.10).
// Схема: 2 завтрака по очереди, обед впрок двумя партиями (пн–ср и чт–вс), 3 ужина, перекусы.
// Порции обеда и ужина масштабируются, чтобы попасть в дневную норму калорий; белок в каждом приёме из рецептов.
import type { Meal, MealPlanBody, PlanRecipe, Recipe } from "./data";
import { WEEK } from "./mealplan";

export type WeekPrefs = { meals: number; dislikes: string; have: string[]; cook: string; seed?: number };

const PANTRY = new Set(["специи", "соль", "вода"]);

// Примерные цены, ₽ за кг (шт для яиц): Москва, «Пятёрочка», осень 2026 — оценка, не данные магазина.
const PRICE: Record<string, number> = {
  яйца: 11, творог: 520, курица: 480, индейка: 650, говядина: 900, свинина: 520, фарш: 520, рыба: 450, тунец: 1300, лосось: 1800, минтай: 380, креветки: 1100,
  кефир: 110, йогурт: 350, молоко: 95, сыр: 900, моцарелла: 1100, сметана: 330, гречка: 110, рис: 120, овсянка: 100, макароны: 150, булгур: 200, картофель: 50,
  хлеб: 180, лаваш: 300, фасоль: 220, нут: 250, чечевица: 220, горох: 120, помидоры: 280, огурцы: 220, перец: 400, лук: 50, морковь: 50, капуста: 45, брокколи: 450,
  кабачок: 150, грибы: 400, шпинат: 900, зелень: 800, чеснок: 450, банан: 150, яблоко: 160, ягоды: 600, орехи: 1200, "арахисовая паста": 700, мёд: 700,
  протеин: 2500, масло: 180, авокадо: 900, кукуруза: 300, редис: 300, лимон: 300, мука: 70, "томатная паста": 400, "соевый соус": 500, сахар: 90,
};
const AISLE: [string, string[]][] = [
  ["Мясо и птица", ["курица", "индейка", "говядина", "свинина", "фарш"]],
  ["Рыба и морепродукты", ["рыба", "тунец", "лосось", "минтай", "креветки"]],
  ["Молочное и яйца", ["яйца", "творог", "кефир", "йогурт", "молоко", "сыр", "моцарелла", "сметана"]],
  ["Крупы, макароны, бобовые", ["гречка", "рис", "овсянка", "макароны", "булгур", "фасоль", "нут", "чечевица", "горох", "мука"]],
  ["Овощи и зелень", ["картофель", "помидоры", "огурцы", "перец", "лук", "морковь", "капуста", "брокколи", "кабачок", "грибы", "шпинат", "зелень", "чеснок", "редис", "авокадо", "кукуруза"]],
  ["Фрукты и ягоды", ["банан", "яблоко", "ягоды", "лимон"]],
  ["Хлеб", ["хлеб", "лаваш"]],
];
const aisleOf = (k: string) => AISLE.find(([, ks]) => ks.includes(k))?.[0] ?? "Бакалея";

/** Детерминированный «случайный» генератор: одно и то же зерно — тот же рацион. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const words = (s: string) => s.toLowerCase().split(/[,;\n]+/).map((x) => x.trim()).filter((x) => x.length > 2);

export function buildWeekPlan(all: Recipe[], t: { kcal: number; protein: number }, p: WeekPrefs): MealPlanBody {
  const rand = rng(p.seed ?? Date.now());
  const bad = words(p.dislikes);
  const have = new Set(p.have);
  const ok = all.filter((r) => !bad.some((w) => r.name.toLowerCase().includes(w.slice(0, -1)) || r.ingredients.some((i) => i.name.toLowerCase().includes(w.slice(0, -1)) || i.key.includes(w.slice(0, -1)))));

  // Оценка: калорийность ближе к доле дневной нормы для этого приёма, белка не меньше 25 г (перекус — 15 г),
  // совпадение с тем, что дома, избранное, немного случайности для разнообразия.
  const score = (r: Recipe, kcalGoal: number, minP: number) => {
    const need = r.ingredients.filter((i) => !PANTRY.has(i.key)).map((i) => i.key);
    const hv = need.length ? need.filter((k) => have.has(k)).length / need.length : 0;
    return -Math.abs(r.kcal - kcalGoal) / 120 + (r.protein >= minP ? 2 : -3) + hv * 3 + r.cooked * 0.3 + (r.fav ? 2 : 0) + rand() * 2.5;
  };
  const pick = (pred: (r: Recipe) => boolean, n: number, used: Set<string>, share: number, minP = 25) => {
    const goal = t.kcal * share;
    const xs = ok.filter((r) => pred(r) && !used.has(r.slug)).sort((a, b) => score(b, goal, minP) - score(a, goal, minP)).slice(0, n);
    xs.forEach((r) => used.add(r.slug));
    return xs;
  };
  const used = new Set<string>();
  const sn = p.meals >= 5 ? 0.2 : p.meals === 4 ? 0.12 : 0;
  const breakfasts = pick((r) => r.meals.includes("breakfast"), 2, used, 0.25);
  const prep = pick((r) => (r.meals.includes("lunch") || r.meals.includes("dinner")) && (r.tags.includes("впрок") || r.tags.includes("в контейнер")), 2, used, (1 - 0.25 - sn) / 2);
  const dinners = pick((r) => r.meals.includes("dinner") || r.meals.includes("lunch"), 3, used, (1 - 0.25 - sn) / 2);
  const snacks = p.meals >= 4 ? pick((r) => r.meals.includes("snack"), 2, used, p.meals >= 5 ? 0.1 : 0.12, 15) : [];
  if (!breakfasts.length || !prep.length || !dinners.length) throw new Error("В базе мало рецептов под ваши ограничения. Уберите часть исключений.");

  // Дни: слоты и базовые порции.
  const days = WEEK.map((d, i) => {
    const meals: [Meal, Recipe, number][] = [
      ["breakfast", breakfasts[i % breakfasts.length], 1],
      ["lunch", prep[i < 3 ? 0 : prep.length - 1], 1],
      ["dinner", dinners[i % dinners.length], 1],
    ];
    if (snacks.length) meals.push(["snack", snacks[i % snacks.length], 1]);
    if (p.meals >= 5 && snacks.length) meals.push(["snack", snacks[(i + 1) % snacks.length], 1]);
    // Масштаб обеда и ужина под норму калорий, шаг 0,25 порции.
    const fixed = meals.filter(([m]) => m === "breakfast" || m === "snack").reduce((a, [, r, n]) => a + r.kcal * n, 0);
    const flex = meals.filter(([m]) => m === "lunch" || m === "dinner").reduce((a, [, r]) => a + r.kcal, 0);
    const k = Math.min(2, Math.max(0.75, Math.round(((t.kcal - fixed) / Math.max(flex, 1)) * 4) / 4));
    return { d, meals: meals.map(([m, r, n]) => [m, r, m === "lunch" || m === "dinner" ? k : n] as [Meal, Recipe, number]) };
  });

  // Сколько порций каждого блюда на неделю.
  const portions = new Map<string, number>();
  for (const d of days) for (const [, r, n] of d.meals) portions.set(r.slug, (portions.get(r.slug) ?? 0) + n);
  const chosen = [...new Map(days.flatMap((d) => d.meals.map(([, r]) => [r.slug, r] as const))).values()];

  const qty = (key: string, g: number) => {
    if (key === "яйца") return `${Math.ceil(g / 55)} шт`;
    return g >= 1000 ? `${(Math.ceil(g / 100) / 10).toLocaleString("ru-RU")} кг` : `${Math.ceil(g / 10) * 10} г`;
  };

  const recipes: PlanRecipe[] = chosen.map((r) => {
    const n = portions.get(r.slug) ?? 1;
    const f = n / Math.max(r.servings, 1);
    return {
      id: r.slug, name: r.name, emoji: r.emoji ?? undefined, meal: r.meals[0], portions: Math.round(n * 100) / 100, portion_g: r.portion_g ?? undefined,
      kcal: r.kcal, protein: r.protein, fat: r.fat, carbs: r.carbs, time_min: r.time_min ?? undefined,
      keeps: r.tags.includes("впрок") ? "готовое — в холодильнике до 3 дней, остальное в морозилку" : "лучше готовить в день еды",
      ingredients: r.ingredients.map((i) => [i.name, i.g && !PANTRY.has(i.key) ? qty(i.key, i.g * f) : i.qty] as [string, string]),
      steps: r.steps,
    };
  });

  // Покупки: суммируем по продукту, отмечаем, что уже есть дома.
  const shopMap = new Map<string, { name: string; key: string; g: number }>();
  for (const r of chosen) {
    const f = (portions.get(r.slug) ?? 1) / Math.max(r.servings, 1);
    for (const i of r.ingredients) {
      if (PANTRY.has(i.key) || !i.g) continue;
      const id = i.key === "специи" ? i.name : i.key;
      const x = shopMap.get(id) ?? { name: i.name.replace(/\s*\(.*?\)/, ""), key: i.key, g: 0 };
      x.g += i.g * f;
      shopMap.set(id, x);
    }
  }
  const shop = [...shopMap.values()].map((x) => ({
    home: have.has(x.key),
    name: have.has(x.key) ? `${x.name} (есть дома?)` : x.name, qty: qty(x.key, x.g), aisle: aisleOf(x.key),
    rub: PRICE[x.key] ? Math.round(((x.key === "яйца" ? Math.ceil(x.g / 55) : x.g / 1000) * PRICE[x.key]) / 10) * 10 : undefined,
  })).sort((a, b) => a.aisle.localeCompare(b.aisle, "ru"));
  const budget = shop.reduce((a, x) => a + (x.home ? 0 : x.rub ?? 0), 0);

  // Готовка впрок: две сессии.
  const [s1, s2] = p.cook.split(/\s+и\s+|,/).map((x) => x.trim()).filter(Boolean);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const prepA = prep[0], prepB = prep[prep.length - 1];
  const portionsIn = (r: Recipe, from: number, to: number) => days.slice(from, to).reduce((a, d) => a + d.meals.filter(([, x]) => x.slug === r.slug).reduce((b, [, , n]) => b + n, 0), 0);
  const cook: MealPlanBody["cook"] = [
    { when: cap(s1 || "воскресенье"), min: (prepA.time_min ?? 40) + 15, makes: [prepA.slug], steps: [`Приготовьте «${prepA.name}» на ${fmt(portionsIn(prepA, 0, 3))} порц. (обеды пн–ср).`, "Разложите по контейнерам сразу после остывания, уберите в холодильник.", ...(prepA === prepB ? ["Половину порций уберите в морозилку на чт–вс."] : [])] },
    ...(prepA !== prepB ? [{ when: cap(s2 || "среда"), min: (prepB.time_min ?? 40) + 15, makes: [prepB.slug], steps: [`Приготовьте «${prepB.name}» на ${fmt(portionsIn(prepB, 3, 7))} порц. (обеды чт–вс).`, "Разложите по контейнерам, уберите в холодильник."] }] : []),
    { when: "Каждый день", min: 20, makes: [...breakfasts, ...dinners].map((r) => r.slug), steps: ["Завтрак и ужин — по рецептам дня, они быстрые.", "Ужины, помеченные «впрок», можно готовить на 2 дня сразу."] },
  ];

  const perDay = days.reduce((a, d) => {
    for (const [, r, n] of d.meals) { a.kcal += r.kcal * n; a.protein += r.protein * n; a.fat += r.fat * n; a.carbs += r.carbs * n; }
    return a;
  }, { kcal: 0, protein: 0, fat: 0, carbs: 0 });
  for (const k of Object.keys(perDay) as (keyof typeof perDay)[]) perDay[k] = Math.round(perDay[k] / 7);

  return {
    title: `Рацион на неделю: ${perDay.kcal} ккал, белок ${perDay.protein} г`,
    summary: `Собран из проверенной базы рецептов под вашу норму (${t.kcal} ккал, белок ${t.protein} г). Обед готовится впрок ${prepA === prepB ? "одной партией" : "двумя партиями"}, завтраки и ужины чередуются.`,
    per_day: perDay, budget_rub: budget,
    cook,
    recipes,
    days: days.map((d) => ({ d: d.d, meals: d.meals.map(([m, r, n]) => [m, r.slug, n]) })),
    shop: shop.map(({ home: _, ...x }) => x),
    tips: [
      perDay.protein < t.protein * 0.9 ? `Белка выходит ${perDay.protein} г из ${t.protein}: добавьте протеиновый коктейль или творог перекусом.`
        : perDay.protein > t.protein * 1.3 ? `Белка ${perDay.protein} г — с запасом к норме ${t.protein} г. Это безопасно; если тяжело съедать, уменьшите порцию мяса и добавьте гарнир.`
        : "Белок в норме: держите его в каждом приёме пищи.",
      "Креатин 3–5 г каждый день, в любое время; воды не меньше 2,5 л.",
      "Если вес за 2 недели не растёт на 0,3–0,6 кг — добавьте 200 ккал (например, порцию каши или горсть орехов).",
    ],
  };
}

const fmt = (n: number) => (Math.round(n * 4) / 4).toLocaleString("ru-RU");
