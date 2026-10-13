import { useEffect, useState } from "react";
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

/** Что из рациона уже записано сегодня (хранится на устройстве) и защита от двойного нажатия «Съел». */
export function useAte(day: string) {
  const store = `hl-ate-${day}`;
  const [st, setSt] = useState<Record<string, "busy" | "done">>({});
  useEffect(() => {
    try { setSt(JSON.parse(localStorage.getItem(store) ?? "{}")); } catch { setSt({}); }
  }, [store]);
  async function eat(meal: Meal, r: PlanRecipe, portions: number) {
    const k = `${meal}-${r.id}`;
    if (st[k]) return;
    setSt((x) => ({ ...x, [k]: "busy" }));
    try {
      await logRecipe(day, meal, r, portions);
      setSt((x) => {
        const next = { ...x, [k]: "done" as const };
        try { localStorage.setItem(store, JSON.stringify(Object.fromEntries(Object.entries(next).filter(([, v]) => v === "done")))); } catch {}
        return next;
      });
    } catch (e) {
      setSt((x) => { const { [k]: _, ...rest } = x; return rest; });
      throw e;
    }
  }
  return { state: (meal: string, id: string) => st[`${meal}-${id}`], eat };
}
