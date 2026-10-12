// Разминка перед силовой: 5–7 минут кардио, суставная разминка под день, затем разминочные подходы в первом базовом.
// Опора: обзоры по разминке (Fradkin 2010, McCrary 2015) — общая разминка + специфические подходы
// снижают риск травм и не мешают силе; долгая статическая растяжка перед силовой не нужна.

import type { Focus } from "./planner";

export type Warmup = { cardio: string; joints: string[] };

const JOINTS: Record<string, string[]> = {
  upper: [
    "Круги плечами вперёд и назад — по 10",
    "Махи руками скрестно перед грудью — 15",
    "Выкрут с палкой или резиной — 10, руки шире плеч",
    "Отжимания лопатками в упоре — 10 (только лопатки, локти прямые)",
    "Вращения в локтях и запястьях — по 10",
    "Наружная ротация плеча с резиной или лёгким блоком — 15 на руку",
  ],
  lower: [
    "Вращения тазом и коленями — по 10",
    "Махи ногой вперёд-назад и в стороны у опоры — по 10 на ногу",
    "Глубокий присед без веса с паузой внизу 2 с — 8",
    "Выпады назад с поворотом корпуса — 6 на ногу",
    "Ягодичный мост — 12",
    "Подъёмы на носки и вращения стопой — по 15",
  ],
  back: [
    "Кошка-корова на четвереньках — 8 медленно",
    "Повороты грудного отдела на четвереньках, рука за голову — 8 на сторону",
    "Висы на турнике 20 с, затем подтягивание лопатками — 8",
    "Тяга резины или лёгкого блока к лицу — 15",
    "Наклоны с прямой спиной без веса (гуд-монинг) — 10",
  ],
};

export function warmupFor(focus: Focus | string | null): Warmup | null {
  if (focus === "recovery") return null;
  const cardio = focus === "cardio" ? "Входит в план: первые 8 минут спокойно." : "5–7 минут на велотренажёре, эллипсе или дорожке: пульс 110–130, лёгкая испарина.";
  const joints =
    focus === "push" ? JOINTS.upper
      : focus === "pull" ? [...JOINTS.back, JOINTS.upper[0], JOINTS.upper[4]]
        : focus === "legs" ? [...JOINTS.lower, JOINTS.back[0]]
          : focus === "cardio" ? [JOINTS.lower[1], JOINTS.lower[0], JOINTS.lower[5], JOINTS.back[0]]
            : [JOINTS.upper[0], JOINTS.upper[2], JOINTS.back[0], JOINTS.lower[0], JOINTS.lower[2], JOINTS.lower[4]];
  return { cardio, joints };
}

/** Разминочные подходы до рабочего веса: лёгкие, без усталости. */
export function rampSets(work: number | null): { kg: number | null; reps: number; label: string }[] {
  if (!work || work < 20) return [{ kg: null, reps: 12, label: "Лёгкий вес или пустой гриф" }, { kg: null, reps: 8, label: "Около половины рабочего" }];
  const r = (x: number) => Math.max(2.5, Math.round(x / 2.5) * 2.5);
  return [
    { kg: r(work * 0.4), reps: 10, label: "40%" },
    { kg: r(work * 0.6), reps: 6, label: "60%" },
    { kg: r(work * 0.8), reps: 3, label: "80%" },
  ];
}
