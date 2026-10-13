"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type Day = {
  day: string;
  steps: number | null;
  distance_km: number | null;
  active_kcal: number | null;
  azm: number | null;
  active_min_light: number | null;
  active_min_moderate: number | null;
  active_min_vigorous: number | null;
  sedentary_min: number | null;
  hr_zone_light_min: number | null;
  hr_zone_moderate_min: number | null;
  hr_zone_vigorous_min: number | null;
  hr_zone_peak_min: number | null;
  hr_avg: number | null;
  hr_min: number | null;
  hr_max: number | null;
  resting_hr: number | null;
  hrv_ms: number | null;
  hrv_deep_ms: number | null;
  nonrem_hr: number | null;
  spo2_avg: number | null;
  spo2_low: number | null;
  resp_rate: number | null;
  skin_temp_delta_c: number | null;
  sleep_start: string | null;
  sleep_end: string | null;
  sleep_min: number | null;
  sleep_awake_min: number | null;
  sleep_deep_min: number | null;
  sleep_rem_min: number | null;
  sleep_light_min: number | null;
  sleep_efficiency: number | null;
  workouts: number | null;
  workout_min: number | null;
  workout_kcal: number | null;
  trimp: number | null;
};

export type Load = { day: string; trimp: number | null; acute: number | null; chronic: number | null; acwr: number | null; readiness: number | null };
export type Baseline = { day: string; metric: string; value: number | null; base_avg: number | null; base_sd: number | null; base_n: number; z: number | null };

export type Summary = { tz: string; days: Day[]; load: Load[]; baseline: Baseline[]; sync: string | null };

/** [секунды эпохи, длительность в секундах, стадия] */
export type Stage = [number, number, string];
export type DayDetail = {
  date: string;
  summary: Day | null;
  /** [секунды эпохи, средний, мин, макс] по минутам */
  hr: [number, number, number | null, number | null][];
  steps: [number, number][];
  sleep: { start: string; end: string; main: boolean; stages: Stage[] }[];
  workouts: { start_ts: string; activity: string; duration_s: number; calories: number | null; distance_m: number | null; avg_hr: number | null; steps: number | null }[];
};

export class ApiError extends Error {
  constructor(message: string, public code: "forbidden" | "network" | "other") {
    super(message);
  }
}

const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 5 * 60_000;

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const key = fn + JSON.stringify(args);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data as T;
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const code = error.code === "42501" || /forbidden|permission/i.test(error.message) ? "forbidden" : /fetch|network/i.test(error.message) ? "network" : "other";
    throw new ApiError(error.message, code);
  }
  cache.set(key, { at: Date.now(), data });
  return data as T;
}

export function clearCache() {
  cache.clear();
}

type State<T> = { data: T | null; error: ApiError | null; loading: boolean };

export function useRpc<T>(fn: string, args: Record<string, unknown> | null): State<T> & { reload: () => void } {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  const key = args ? JSON.stringify(args) : null;
  useEffect(() => {
    if (!key) return;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    rpc<T>(fn, JSON.parse(key))
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((e) => live && setState({ data: null, error: e instanceof ApiError ? e : new ApiError(String(e), "other"), loading: false }));
    return () => {
      live = false;
    };
  }, [fn, key, nonce]);
  return {
    ...state,
    reload: () => {
      cache.clear();
      setNonce((n) => n + 1);
    },
  };
}

export const useSummary = (days: number) => useRpc<Summary>("hl_summary", { days });
export const useDay = (date: string | null) => useRpc<DayDetail>("hl_day", date ? { d: date } : null);

// ---------- даты и числа ----------

export const TZ_FALLBACK = "Etc/GMT-3";

export function localToday(tz = TZ_FALLBACK): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function addDays(day: string, n: number): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const dayFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const dayShort = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "long", timeZone: "UTC" });
const weekdayShort = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" });

const asDate = (day: string) => new Date(day + "T12:00:00Z");
export const fmtDay = (day: string) => dayFmt.format(asDate(day));
export const fmtDayShort = (day: string) => dayShort.format(asDate(day)).replace(".", "");
export const fmtWeekday = (day: string) => weekday.format(asDate(day));
export const fmtWeekdayShort = (day: string) => weekdayShort.format(asDate(day));

export function fmtTime(ts: string | number, tz = TZ_FALLBACK): string {
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(d);
}

/** Минуты от полуночи по местному времени. */
export function minutesOfDay(ts: string | number, tz = TZ_FALLBACK): number {
  const [h, m] = fmtTime(ts, tz).split(":").map(Number);
  return h * 60 + m;
}

export const num = (n: number | null | undefined, digits = 0) =>
  n == null || Number.isNaN(n) ? "—" : Number(n).toLocaleString("ru-RU", { maximumFractionDigits: digits, minimumFractionDigits: digits });

export function hm(min: number | null | undefined): { h: number; m: number } | null {
  if (min == null) return null;
  const r = Math.round(min);
  return { h: Math.floor(r / 60), m: r % 60 };
}

export const hmText = (min: number | null | undefined) => {
  const v = hm(min);
  return v ? `${v.h} ч ${String(v.m).padStart(2, "0")} мин` : "—";
};

export function mean(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => x != null && !Number.isNaN(x));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

/** Последний день, где поле не пустое. */
export function lastWith<T>(rows: T[], pick: (r: T) => unknown): T | undefined {
  for (let i = rows.length - 1; i >= 0; i--) if (pick(rows[i]) != null) return rows[i];
  return undefined;
}

export const SPANS = [
  { key: "w", label: "Н", days: 7 },
  { key: "m", label: "М", days: 30 },
  { key: "3m", label: "3М", days: 90 },
  { key: "6m", label: "6М", days: 180 },
  { key: "y", label: "Г", days: 365 },
] as const;

// ---------- тренер ----------

export type Exercise = {
  id: string;
  name: string;
  name_ru: string | null;
  category: string | null;
  level: string | null;
  force: string | null;
  mechanic: string | null;
  equipment: string | null;
  primary_muscles: string[];
  secondary_muscles: string[];
  instructions?: string[];
  instructions_ru?: string[] | null;
  images: string[];
};

export const useExercises = (q: string, muscle: string, equip: string) =>
  useRpc<Exercise[]>("hl_exercises", { q, muscle, equip, lim: 120 });
export const useExercise = (id: string | null) => useRpc<Exercise | null>("hl_exercise", id ? { ex_id: id } : null);

export const MUSCLES: Record<string, string> = {
  chest: "Грудь", lats: "Широчайшие", "middle back": "Середина спины", "lower back": "Поясница", traps: "Трапеции",
  shoulders: "Плечи", biceps: "Бицепс", triceps: "Трицепс", forearms: "Предплечья", abdominals: "Пресс",
  quadriceps: "Квадрицепс", hamstrings: "Бицепс бедра", glutes: "Ягодицы", calves: "Икры",
  adductors: "Приводящие", abductors: "Отводящие", neck: "Шея",
};

export const EQUIPMENT: Record<string, string> = {
  barbell: "Штанга", dumbbell: "Гантели", cable: "Блок", machine: "Тренажёр", "body only": "Свой вес",
  kettlebells: "Гири", "e-z curl bar": "EZ-гриф", bands: "Резинки", "medicine ball": "Медбол",
  "exercise ball": "Фитбол", "foam roll": "Ролик", other: "Другое",
};

export const LEVELS: Record<string, string> = { beginner: "новичок", intermediate: "средний", expert: "опытный" };

// ---------- тренер: зал, план, подходы ----------

/** Запись в БД: без кэша, после неё кэш чтений сбрасывается. */
export async function mutate<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  cache.clear();
  if (error) throw new ApiError(error.message, error.code === "42501" ? "forbidden" : /fetch|network/i.test(error.message) ? "network" : "other");
  return data as T;
}

export type GymItem = { id: number; name: string; kind: string | null; photo_path: string | null; notes: string | null; active: boolean };
export type Gym = { kinds: string[]; items: GymItem[] };
export type PlanRow = { id: number; day: string; title: string; focus: string | null; readiness: number | null; acwr: number | null; status: "planned" | "in_progress" | "done" | "skipped"; rationale: string | null;
  plan: { exercise_id: string; sets: number; reps: string; rest_s: number; minutes?: number; note?: string }[] };
export type SetRow = { id: number; plan_id: number | null; day: string; exercise_id: string; set_no: number; reps: number; weight_kg: number | null; rpe: number | null };
export type PlanDay = {
  plan: PlanRow | null;
  exercises: Record<string, { name: string; name_ru: string | null; images: string[]; equipment: string | null; primary_muscles: string[] }>;
  sets: SetRow[];
  last: Record<string, { day: string; weight_kg: number | null; reps: number | null }>;
};
export type WorkoutRow = { day: string; id: number; title: string; focus: string | null; status: string; readiness: number | null; sets: number; volume_kg: number };

export const useGym = () => useRpc<Gym>("hl_gym", {});
export const usePlan = (d: string | null) => useRpc<PlanDay>("hl_plan", d ? { d } : null);
export const useWorkouts = (lim = 30) => useRpc<WorkoutRow[]>("hl_workouts", { lim });
export type ExHistory = { day: string; sets: { n: number; reps: number; kg: number | null }[]; top_kg: number | null; e1rm: number | null };
export const useExerciseHistory = (id: string | null, lim = 12) => useRpc<ExHistory[]>("hl_exercise_history", id ? { ex_id: id, lim } : null);

// ---------- самочувствие, замеры, ИИ ----------

export type Review = { day: string; plan_id: number | null; energy: number | null; fatigue: number | null; sleep_quality: number | null; soreness: number | null; mood: number | null;
  progress_feel: "better" | "same" | "worse" | null; pain: string | null; note: string | null };
export type Checkin = { day: string; weight_kg: number | null; waist_cm: number | null; chest_cm: number | null; arm_cm: number | null; hip_cm: number | null; thigh_cm: number | null; body_fat_pct: number | null; note: string | null };
export type AiReport = { id: number; kind: "workout" | "weekly" | "chat" | "daily" | "health" | "food" | "mealplan" | "nutrition"; day: string; model: string | null; question: string | null; answer: string; created_at: string; cost_rub?: number | null; tokens_in?: number | null; tokens_out?: number | null };
export type Progress = {
  checkins: Checkin[];
  reviews: Review[];
  weeks: { week: string; workouts: number; sets: number; volume_kg: number }[];
  lifts: Record<string, { day: string; e1rm: number }[]>;
  names: Record<string, string>;
  reports: AiReport[];
};

export type Goal = { id: number; title: string; start_day: string; end_day: string; details: GoalDetails };
export type GoalDetails = {
  focus?: string[]; place?: string; experience?: string;
  sex?: "m" | "f"; age?: number; height_cm?: number; start_weight_kg?: number; target_weight_kg?: number; target_waist_cm?: number;
  workouts_per_week?: number; session_min?: number; priorities?: string; cardio_goal?: string; limits?: string; nutrition?: string; creatine_g?: number;
};
export const useGoal = () => useRpc<Goal | null>("hl_goal", {});

export const useProgress = (weeks = 26) => useRpc<Progress>("hl_progress", { weeks });
export const useReview = (d: string | null) => useRpc<Review | null>("hl_review", d ? { d } : null);
export const useAiReports = (k: string | null, lim = 30) => useRpc<AiReport[]>("hl_ai_reports", { k, lim });

export class AiError extends Error {
  constructor(public code: "no_key" | "forbidden" | "ai_failed" | "network" | "other", message: string) {
    super(message);
  }
}

/** Запрос к ИИ-тренеру (Edge Function coach-ai). Ключ ИИ хранится только на сервере. */
async function invokeAi<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("coach-ai", { body });
  cache.clear();
  if (error) {
    let payload: { error?: string; detail?: string } | null = null;
    try {
      payload = await (error as { context?: Response }).context?.json();
    } catch {}
    const code = payload?.error;
    if (code === "no_key") throw new AiError("no_key", "Ключ ИИ ещё не подключён.");
    if (code === "forbidden") throw new AiError("forbidden", "Нет доступа.");
    if (code === "ai_failed") throw new AiError("ai_failed", payload?.detail ? `Сервис ИИ ответил ошибкой: ${payload.detail}` : "Сервис ИИ ответил ошибкой. Проверьте баланс и ключ.");
    if (code === "ai_empty") throw new AiError("ai_failed", "ИИ не понял запрос. Попробуйте ещё раз или опишите словами.");
    if (/fetch|network|Failed to send/i.test(error.message)) throw new AiError("network", "Нет связи с сервером ИИ.");
    throw new AiError("other", payload?.detail ?? error.message);
  }
  return data as T;
}

/** Запрос к ИИ-тренеру (Edge Function coach-ai). Ключ ИИ хранится только на сервере. */
export async function askCoach(body: { kind: "workout" | "weekly" | "chat" | "daily" | "health" | "nutrition"; day: string; question?: string; history?: { role: string; content: string }[] }): Promise<string> {
  return (await invokeAi<{ answer: string }>(body)).answer;
}

// ---------- питание ----------

export type FoodEntry = { id: number; day: string; meal: Meal; name: string; grams: number; kcal: number | null; protein: number | null; fat: number | null; carbs: number | null; product_id: number | null; source: string };
export type Meal = "breakfast" | "lunch" | "dinner" | "snack";
export type FoodDay = {
  entries: FoodEntry[];
  week: { day: string; kcal: number; protein: number; fat: number; carbs: number }[];
  recent: { name: string; grams: number; kcal: number | null; protein: number | null; fat: number | null; carbs: number | null; product_id: number | null }[];
};
export type Product = { id: number; barcode: string | null; name: string; brand: string | null; kcal: number | null; protein: number | null; fat: number | null; carbs: number | null; portion_g: number | null; source: string };
export type FoodGuess = { name: string; grams: number; kcal_100: number; protein_100: number; fat_100: number; carbs_100: number; confidence?: string };

export const useFoodDay = (d: string | null) => useRpc<FoodDay>("hl_food_day", d ? { d } : null);
export const useProducts = (q: string) => useRpc<Product[]>("hl_food_products", { q, lim: 30 });

export const recognizeFood = (day: string, text: string, image?: string) =>
  invokeAi<{ result: { items?: FoodGuess[]; note?: string }; cost_rub: number | null }>({ kind: "food", day, text, image });
export const recognizeLabel = (day: string, image: string) =>
  invokeAi<{ result: { name?: string; brand?: string; kcal?: number; protein?: number; fat?: number; carbs?: number; portion_g?: number | null }; cost_rub: number | null }>({ kind: "label", day, image });
export const lookupBarcode = (code: string) => invokeAi<{ product: Product | null; from: "own" | "off" | "none" }>({ kind: "barcode", code });
// ---------- рецепты и напитки ----------

export type Ingredient = { name: string; qty: string; g: number; key: string };
export type Recipe = {
  slug: string; name: string; emoji: string | null; meals: Meal[]; time_min: number | null; servings: number; portion_g: number | null;
  kcal: number; protein: number; fat: number; carbs: number; ingredients: Ingredient[]; steps: string[]; tags: string[]; tip: string | null; fav: boolean; cooked: number;
};
export const useRecipes = () => useRpc<Recipe[]>("hl_recipes", {});
export const recognizeFridge = (day: string, text: string, image?: string) =>
  invokeAi<{ result: { products?: { key: string; name: string }[]; note?: string }; cost_rub: number | null }>({ kind: "fridge", day, text, image });

export type DrinkKind = "water" | "coffee" | "tea" | "protein" | "juice" | "soda" | "milk" | "alcohol" | "other";
export type Drink = { id: number; day: string; kind: DrinkKind; ml: number; kcal: number; at: string };
export type Drinks = { list: Drink[]; week: { day: string; water_ml: number | null; total_ml: number; coffee: number; kcal: number | null }[] };
export const useDrinks = (d: string | null) => useRpc<Drinks>("hl_drinks", d ? { d } : null);

export const useAiSpend = () => useRpc<{ month_rub: number; month_n: number; avg_rub: number | null }>("hl_ai_spend", {});

// ---------- недельный рацион ----------

export type PlanMealRef = [Meal, string, number];
export type PlanRecipe = {
  id: string; name: string; emoji?: string; meal?: Meal; portions: number; portion_g?: number;
  kcal: number; protein: number; fat: number; carbs: number; time_min?: number; keeps?: string;
  ingredients: [string, string][]; steps: string[];
};
export type MealPlanBody = {
  title: string; summary?: string; per_day?: { kcal: number; protein: number; fat: number; carbs: number }; budget_rub?: number;
  cook: { when: string; min?: number; makes?: string[]; steps: string[] }[];
  recipes: PlanRecipe[];
  days: { d: string; meals: PlanMealRef[] }[];
  shop: { name: string; qty: string; rub?: number; aisle?: string }[];
  tips?: string[];
};
export type MealPlanRow = { id: number; week_start: string; status: "pending" | "ready" | "error"; prefs: Record<string, string>; plan: MealPlanBody | null; error: string | null; model: string | null; cost_rub: number | null; created_at: string };
export type MealPlanState = { plan: MealPlanRow | null; list: { id: number; week_start: string; status: string; created_at: string; cost_rub: number | null; title: string | null }[] };
export const useMealPlan = (id: number | null = null) => useRpc<MealPlanState>("hl_meal_plan", { pid: id });
export const startMealPlan = (day: string, prefs: Record<string, string>, targets: Record<string, number> | null) =>
  invokeAi<{ id: number; status: string }>({ kind: "mealplan", day, prefs, targets });

export type Device = { name: string; type: string | null; battery: number | null; status: "High" | "Medium" | "Low" | "Empty" | null; last_sync: string | null };
export type Devices = { list: Device[]; checked_at: string | null; drain_per_hour: number | null };
export const useDevices = () => useRpc<Devices>("hl_devices", {});
