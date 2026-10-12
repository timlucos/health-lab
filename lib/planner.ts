// План тренировки на день по правилам, без ИИ.
// Цель владельца: мышечная масса и выносливость, зал, средний опыт.
// Ротация: жим → тяга → ноги → выносливость. Готовность меняет объём, снаряды зала — выбор упражнений.

export type Focus = "push" | "pull" | "legs" | "cardio" | "recovery";

export type PlanItem = {
  exercise_id: string;
  sets: number;
  reps: string; // «6–8», «10–12», «30 с»
  rest_s: number;
  minutes?: number; // для кардио
  note?: string;
};

export type Plan = { title: string; focus: Focus; items: PlanItem[]; rationale: string };

export type Equip = "barbell" | "dumbbell" | "cable" | "machine" | "kettlebells" | "e-z curl bar" | "other" | "body only";

// Что умеет зал. «body only» есть всегда.
export const GYM_KINDS: { key: Equip; label: string; hint: string }[] = [
  { key: "barbell", label: "Штанга", hint: "стойка, скамья" },
  { key: "dumbbell", label: "Гантели", hint: "и скамья" },
  { key: "cable", label: "Блоки", hint: "кроссовер, тяги" },
  { key: "machine", label: "Тренажёры", hint: "жим ногами, Смит, кардио" },
  { key: "kettlebells", label: "Гири", hint: "" },
  { key: "e-z curl bar", label: "EZ-гриф", hint: "изогнутый гриф" },
  { key: "other", label: "Тумба, гиперэкстензия", hint: "" },
];
export const FULL_GYM: Equip[] = ["barbell", "dumbbell", "cable", "machine", "kettlebells", "e-z curl bar", "other"];

/** Залы DDX Fitness: Technogym и Matrix, свободные веса, блоки, кардио. EZ-гриф не подтверждён. */
export const DDX_GYM: Equip[] = ["barbell", "dumbbell", "cable", "machine", "kettlebells", "other"];

// Упражнения из каталога со снарядом. Порядок в слоте — по предпочтению.
const EQ: Record<string, Equip> = {
  "Barbell_Bench_Press_-_Medium_Grip": "barbell", "Standing_Military_Press": "barbell", "Bent_Over_Barbell_Row": "barbell", "Barbell_Squat": "barbell", "Romanian_Deadlift": "barbell", "Barbell_Curl": "barbell",
  "Dumbbell_Bench_Press": "dumbbell", "Incline_Dumbbell_Press": "dumbbell", "Dumbbell_Shoulder_Press": "dumbbell", "Side_Lateral_Raise": "dumbbell", "Dumbbell_Flyes": "dumbbell", "One-Arm_Dumbbell_Row": "dumbbell", "Dumbbell_Bicep_Curl": "dumbbell", "Hammer_Curls": "dumbbell", "Dumbbell_Lunges": "dumbbell",
  "Cable_Crossover": "cable", "Triceps_Pushdown": "cable", "Wide-Grip_Lat_Pulldown": "cable", "Seated_Cable_Rows": "cable", "Face_Pull": "cable", "Cable_Crunch": "cable",
  "Machine_Shoulder_Military_Press": "machine", "Leg_Press": "machine", "Hack_Squat": "machine", "Smith_Machine_Squat": "machine", "Lying_Leg_Curls": "machine", "Leg_Extensions": "machine", "Standing_Calf_Raises": "machine", "Seated_Calf_Raise": "machine",
  "Rowing_Stationary": "machine", "Bicycling_Stationary": "machine", "Running_Treadmill": "machine", "Elliptical_Trainer": "machine",
  "Goblet_Squat": "kettlebells", "One-Arm_Kettlebell_Swings": "kettlebells",
  "Lying_Triceps_Press": "e-z curl bar",
  "Leverage_Chest_Press": "machine", "Leverage_Incline_Chest_Press": "machine", "Machine_Bench_Press": "machine", "Butterfly": "machine", "Reverse_Machine_Flyes": "machine",
  "Leverage_Shoulder_Press": "machine", "Machine_Triceps_Extension": "machine", "Dip_Machine": "machine", "Leverage_Iso_Row": "machine", "Leverage_High_Row": "machine",
  "Lying_T-Bar_Row": "machine", "Machine_Bicep_Curl": "machine", "Machine_Preacher_Curls": "machine", "Seated_Leg_Curl": "machine", "Thigh_Abductor": "machine", "Thigh_Adductor": "machine",
  "Ab_Crunch_Machine": "machine", "Stairmaster": "machine", "Recumbent_Bike": "machine", "Smith_Machine_Incline_Bench_Press": "machine",
  "Barbell_Hip_Thrust": "barbell", "T-Bar_Row_with_Handle": "barbell", "Preacher_Curl": "barbell", "Close-Grip_Front_Lat_Pulldown": "cable", "Straight-Arm_Pulldown": "cable", "Cable_Chest_Press": "cable",
  "Hyperextensions_Back_Extensions": "other", "Front_Box_Jump": "other",
  "Pushups": "body only", "Pullups": "body only", "Chin-Up": "body only", "Dips_-_Triceps_Version": "body only", "Bodyweight_Squat": "body only", "Hanging_Leg_Raise": "body only", "Plank": "body only", "Crunches": "body only", "Russian_Twist": "body only", "Mountain_Climbers": "body only",
};

type Slot = { opts: string[]; sets: number; reps: string; rest_s: number; minutes?: number; note?: string; main?: boolean };

const BASE = { sets: 4, reps: "6–8", rest_s: 120, main: true };
const ACC = { sets: 3, reps: "10–12", rest_s: 75 };

const TEMPLATES: Record<Exclude<Focus, "recovery">, { title: string; slots: Slot[] }> = {
  push: {
    title: "Жим: грудь, плечи, трицепс",
    slots: [
      { opts: ["Barbell_Bench_Press_-_Medium_Grip", "Dumbbell_Bench_Press", "Leverage_Chest_Press", "Pushups"], ...BASE },
      { opts: ["Incline_Dumbbell_Press", "Leverage_Incline_Chest_Press", "Smith_Machine_Incline_Bench_Press", "Pushups"], ...ACC, reps: "8–10" },
      { opts: ["Standing_Military_Press", "Dumbbell_Shoulder_Press", "Leverage_Shoulder_Press", "Machine_Shoulder_Military_Press", "Pushups"], ...ACC, reps: "8–10" },
      { opts: ["Butterfly", "Cable_Crossover", "Dumbbell_Flyes"], ...ACC, reps: "12–15", rest_s: 60 },
      { opts: ["Side_Lateral_Raise", "Cable_Crossover"], ...ACC, reps: "12–15", rest_s: 60 },
      { opts: ["Triceps_Pushdown", "Machine_Triceps_Extension", "Dip_Machine", "Lying_Triceps_Press", "Dips_-_Triceps_Version"], ...ACC },
    ],
  },
  pull: {
    title: "Тяга: спина и бицепс",
    slots: [
      { opts: ["Pullups", "Wide-Grip_Lat_Pulldown", "Leverage_High_Row", "Chin-Up"], ...BASE, reps: "6–10" },
      { opts: ["Bent_Over_Barbell_Row", "Lying_T-Bar_Row", "T-Bar_Row_with_Handle", "One-Arm_Dumbbell_Row", "Seated_Cable_Rows"], ...BASE, sets: 3, reps: "8–10" },
      { opts: ["Seated_Cable_Rows", "Leverage_Iso_Row", "Close-Grip_Front_Lat_Pulldown", "One-Arm_Dumbbell_Row"], ...ACC },
      { opts: ["Face_Pull", "Reverse_Machine_Flyes", "Side_Lateral_Raise"], ...ACC, reps: "15", rest_s: 60 },
      { opts: ["Barbell_Curl", "Machine_Bicep_Curl", "Preacher_Curl", "Dumbbell_Bicep_Curl", "Chin-Up"], ...ACC },
      { opts: ["Hammer_Curls", "Dumbbell_Bicep_Curl"], ...ACC, sets: 2 },
    ],
  },
  legs: {
    title: "Ноги и корпус",
    slots: [
      { opts: ["Barbell_Squat", "Smith_Machine_Squat", "Leg_Press", "Hack_Squat", "Goblet_Squat", "Bodyweight_Squat"], ...BASE },
      { opts: ["Romanian_Deadlift", "Barbell_Hip_Thrust", "Hyperextensions_Back_Extensions", "Dumbbell_Lunges"], ...BASE, sets: 3, reps: "8–10" },
      { opts: ["Leg_Press", "Dumbbell_Lunges", "Bodyweight_Squat"], ...ACC },
      { opts: ["Seated_Leg_Curl", "Lying_Leg_Curls", "Hyperextensions_Back_Extensions"], ...ACC },
      { opts: ["Leg_Extensions", "Thigh_Abductor", "Dumbbell_Lunges"], ...ACC, reps: "12–15", rest_s: 60 },
      { opts: ["Standing_Calf_Raises", "Seated_Calf_Raise"], ...ACC, reps: "12–15", rest_s: 60 },
      { opts: ["Hanging_Leg_Raise", "Ab_Crunch_Machine", "Cable_Crunch", "Crunches"], ...ACC, rest_s: 60 },
    ],
  },
  cardio: {
    title: "Выносливость: интервалы и корпус",
    slots: [
      { opts: ["Rowing_Stationary", "Bicycling_Stationary", "Running_Treadmill", "Elliptical_Trainer"], sets: 1, reps: "разминка", rest_s: 0, minutes: 8, note: "Спокойно, пульс до 120." },
      { opts: ["Rowing_Stationary", "Stairmaster", "Bicycling_Stationary", "Running_Treadmill", "Elliptical_Trainer"], sets: 6, reps: "2 мин быстро / 1 мин легко", rest_s: 0, minutes: 18, note: "Быстрые отрезки в зоне 4: тяжело, но можно сказать пару слов." },
      { opts: ["One-Arm_Kettlebell_Swings", "Mountain_Climbers"], sets: 3, reps: "15", rest_s: 60 },
      { opts: ["Plank"], sets: 3, reps: "40 с", rest_s: 45 },
      { opts: ["Russian_Twist", "Ab_Crunch_Machine", "Cable_Crunch", "Crunches"], sets: 3, reps: "15", rest_s: 45 },
    ],
  },
};

const ROTATION: Exclude<Focus, "recovery">[] = ["push", "pull", "legs", "cardio"];

export function nextFocus(history: { focus: string | null; status: string }[]): Exclude<Focus, "recovery"> {
  const last = history.find((h) => h.status !== "skipped" && ROTATION.includes(h.focus as never));
  if (!last) return "push";
  return ROTATION[(ROTATION.indexOf(last.focus as never) + 1) % ROTATION.length];
}

function pick(opts: string[], have: Set<Equip>, used: Set<string>, shift = 0): string | null {
  const ok = opts.filter((id) => !used.has(id) && have.has(EQ[id] ?? "other"));
  if (ok.length) return ok[shift % ok.length];
  return opts.find((id) => !used.has(id) && have.has(EQ[id] ?? "other")) ?? opts.find((id) => !used.has(id) && EQ[id] === "body only") ?? null;
}

export function buildPlan(opts: { readiness: number | null; acwr: number | null; history: { focus: string | null; status: string }[]; equipment: Equip[] }): Plan {
  const { readiness: r, acwr } = opts;
  const have = new Set<Equip>([...(opts.equipment.length ? opts.equipment : DDX_GYM), "body only"]);
  const why: string[] = [];

  if ((r != null && r < 50) || (acwr != null && acwr > 1.5)) {
    const cardio = pick(["Bicycling_Stationary", "Elliptical_Trainer", "Rowing_Stationary", "Running_Treadmill"], have, new Set());
    const items: PlanItem[] = [];
    if (cardio) items.push({ exercise_id: cardio, sets: 1, reps: "ровный темп", rest_s: 0, minutes: 30, note: "Зона 2: можно разговаривать полными фразами." });
    items.push({ exercise_id: "Plank", sets: 3, reps: "30 с", rest_s: 45 });
    if (r != null && r < 50) why.push(`Готовность ${Math.round(r)} из 100: организму нужно восстановиться.`);
    if (acwr != null && acwr > 1.5) why.push(`Нагрузка за неделю выросла слишком быстро (ACWR ${acwr.toFixed(2)}).`);
    why.push("Сегодня лёгкое кардио и корпус, силовую сдвигаем на завтра.");
    return { title: "Восстановление", focus: "recovery", items, rationale: why.join(" ") };
  }

  const focus = nextFocus(opts.history);
  const t = TEMPLATES[focus];
  const light = r != null && r < 60;
  const used = new Set<string>();
  const items: PlanItem[] = [];
  // Базовые упражнения не меняем, чтобы видеть прогресс в весах; вспомогательные чередуем по неделям.
  const shift = opts.history.filter((h) => h.focus === focus && h.status !== "skipped").length;
  for (const s of t.slots) {
    const id = pick(s.opts, have, used, s.main ? 0 : shift);
    if (!id) continue;
    used.add(id);
    items.push({ exercise_id: id, sets: Math.max(1, s.sets - (light && s.sets > 1 ? 1 : 0)), reps: s.reps, rest_s: s.rest_s, ...(s.minutes ? { minutes: s.minutes } : {}), ...(s.note ? { note: s.note } : {}) });
  }
  // Для выносливости после силовой: короткие интервалы, если готовность высокая.
  if (focus !== "cardio" && r != null && r >= 70) {
    const fin = pick(["Rowing_Stationary", "Bicycling_Stationary", "Running_Treadmill"], have, used);
    if (fin) items.push({ exercise_id: fin, sets: 5, reps: "30 с быстро / 30 с легко", rest_s: 0, minutes: 10, note: "Финишер на выносливость." });
  }

  why.push(`По очереди сегодня «${t.title.split(":")[0].toLowerCase()}».`);
  if (r == null) why.push("Готовности за сегодня ещё нет, план обычный.");
  else if (light) why.push(`Готовность ${Math.round(r)}: на один подход меньше в каждом упражнении.`);
  else why.push(`Готовность ${Math.round(r)}: полный объём${r >= 70 ? " и финишер на выносливость" : ""}.`);
  why.push("Вес подбирайте так, чтобы в последнем подходе оставалось 1–2 повтора в запасе.");
  return { title: t.title, focus, items, rationale: why.join(" ") };
}

/** Подсказка веса по прошлому разу: сделали верх диапазона — добавить 2,5 кг. */
export function suggestWeight(reps: string, last?: { weight_kg: number | null; reps: number | null }): number | null {
  if (!last?.weight_kg) return null;
  const top = Math.max(...(reps.match(/\d+/g) ?? ["0"]).map(Number));
  return last.reps != null && top > 0 && last.reps >= top ? last.weight_kg + 2.5 : last.weight_kg;
}

export const restText = (s: number) => (s >= 60 && s % 60 === 0 ? `${s / 60} мин` : `${s} с`);
