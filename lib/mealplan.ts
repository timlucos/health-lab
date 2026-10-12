import { mutate, type Meal, type MealPlanBody, type PlanRecipe } from "./data";

export const WEEK = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"] as const;

/** «пн»…«вс» для даты YYYY-MM-DD. */
export function weekdayKey(day: string): string {
  const i = new Date(day + "T12:00:00").getDay();
  return WEEK[(i + 6) % 7];
}

export function planDay(plan: MealPlanBody, key: string) {
  return plan.days.find((d) => d.d.toLowerCase().slice(0, 2) === key) ?? null;
}

export function recipeOf(plan: MealPlanBody, id: string): PlanRecipe | undefined {
  return plan.recipes.find((r) => r.id === id);
}

/** КБЖУ дня по рациону. */
export function dayTotals(plan: MealPlanBody, key: string) {
  const d = planDay(plan, key);
  const z = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  for (const [, id, n] of d?.meals ?? []) {
    const r = recipeOf(plan, id);
    if (!r) continue;
    z.kcal += r.kcal * n;
    z.protein += r.protein * n;
    z.fat += r.fat * n;
    z.carbs += r.carbs * n;
  }
  return z;
}

/** Записать блюдо из рациона в дневник питания. */
export async function logRecipe(day: string, meal: Meal, r: PlanRecipe, portions: number) {
  await mutate("hl_food_add", {
    d: day,
    meal,
    items: [{ name: r.name, grams: Math.round((r.portion_g ?? 300) * portions), kcal: r.kcal * portions, protein: r.protein * portions, fat: r.fat * portions, carbs: r.carbs * portions, source: "plan" }],
  });
}

export const photoLink = (name: string) => `https://yandex.ru/images/search?text=${encodeURIComponent(name + " рецепт")}`;
