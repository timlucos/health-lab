import type { Day, Load } from "./data";

// Выгрузка показателей в CSV (разделитель «;», запятая в дробях — так файл сразу открывается в Excel и Numbers на русском).
const COLS: [keyof Day, string][] = [
  ["steps", "Шаги"], ["distance_km", "Дистанция, км"], ["active_kcal", "Активные ккал"], ["azm", "Минуты в зонах"],
  ["resting_hr", "Пульс покоя"], ["hr_avg", "Средний пульс"], ["hrv_ms", "ВСР, мс"], ["spo2_avg", "Кислород, %"], ["resp_rate", "Дыхание, вд/мин"],
  ["skin_temp_delta_c", "Темп. кожи к обычной, °C"], ["sleep_min", "Сон, мин"], ["sleep_deep_min", "Глубокий, мин"], ["sleep_rem_min", "Быстрый, мин"],
  ["sleep_light_min", "Лёгкий, мин"], ["sleep_awake_min", "Пробуждения, мин"], ["trimp", "Кардионагрузка"],
];

const cell = (v: unknown) => (v == null ? "" : typeof v === "number" ? String(Math.round(v * 100) / 100).replace(".", ",") : `"${String(v).replace(/"/g, '""')}"`);

export function daysCsv(days: Day[], load: Load[]) {
  const head = ["Дата", "Готовность", ...COLS.map(([, l]) => l)];
  const rows = days.map((d) => [d.day, load.find((x) => x.day === d.day)?.readiness ?? null, ...COLS.map(([k]) => d[k])].map(cell).join(";"));
  return "﻿" + [head.join(";"), ...rows].join("\r\n");
}

/** На iPhone — через «Поделиться» (сохранить в Файлы, отправить), в браузере компьютера — обычное скачивание. */
export async function saveCsv(name: string, csv: string) {
  const file = new File([csv], name, { type: "text/csv" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
