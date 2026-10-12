// Норма калорий и БЖУ для набора мышц.
// Калории: формула Миффлина — Сан Жеора × 1,55 (4 тренировки в неделю), +250 ккал на набор
// (Iraki 2019: небольшой профицит, 0,25–0,5% веса в неделю). Белок 1,8 г/кг (Morton 2018: польза до ~1,6 г/кг, верх 2,2),
// жиры 0,9 г/кг, остальное углеводы.

import type { GoalDetails } from "./data";

export type Targets = { kcal: number; protein: number; fat: number; carbs: number; exact: boolean; why: string };

export function targets(g: GoalDetails | undefined, weightKg: number | null): Targets | null {
  const w = weightKg ?? g?.start_weight_kg ?? null;
  if (!w) return null;
  const gain = g?.target_weight_kg != null ? Math.sign(g.target_weight_kg - w) : 1;
  const exact = !!(g?.age && g?.height_cm && g?.sex);
  const bmr = exact ? 10 * w + 6.25 * g!.height_cm! - 5 * g!.age! + (g!.sex === "f" ? -161 : 5) : 24 * w;
  const kcal = Math.round((bmr * 1.55 + (gain > 0 ? 250 : gain < 0 ? -400 : 0)) / 10) * 10;
  const protein = Math.round(w * 1.8);
  const fat = Math.round(w * 0.9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const why = `${exact ? "По росту, весу и возрасту" : "Примерно по весу (укажите рост, возраст и пол в «Цели» для точности)"}, 4 тренировки в неделю${gain > 0 ? ", +250 ккал на набор" : gain < 0 ? ", −400 ккал на снижение" : ""}. Белок 1,8 г на кг.`;
  return { kcal, protein, fat, carbs, exact, why };
}

export const MEALS = [
  { key: "breakfast", label: "Завтрак" },
  { key: "lunch", label: "Обед" },
  { key: "dinner", label: "Ужин" },
  { key: "snack", label: "Перекус" },
] as const;

/** Приём пищи по времени суток. */
export function mealNow(): "breakfast" | "lunch" | "dinner" | "snack" {
  const h = new Date().getHours();
  return h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 21 ? "dinner" : "snack";
}

/** Сжать фото до 1024 px по длинной стороне: меньше токенов и трафика. */
export async function shrinkImage(file: File, max = 1024): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}
