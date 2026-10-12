import { mean, type Day, type Load } from "./data";

/** Норма: среднее за 30 дней до дня index (сам день не входит). */
export function norm(days: Day[], key: keyof Day, index = days.length - 1): number | null {
  const prev = days.slice(Math.max(0, index - 30), index).map((d) => d[key] as number | null);
  return prev.filter((v) => v != null).length >= 5 ? mean(prev) : null;
}

export function sd(days: Day[], key: keyof Day, index = days.length - 1): number | null {
  const v = days.slice(Math.max(0, index - 30), index).map((d) => d[key] as number | null).filter((x): x is number => x != null);
  if (v.length < 7) return null;
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

export function z(days: Day[], key: keyof Day, index = days.length - 1): number | null {
  const v = days[index]?.[key] as number | null;
  const m = norm(days, key, index), s = sd(days, key, index);
  return v == null || m == null || !s ? null : (v - m) / s;
}

export function readinessColor(r: number | null | undefined) {
  if (r == null) return "muted";
  return r >= 70 ? "ok" : r >= 55 ? "warn" : "bad";
}

export function acwrState(a: number | null | undefined): { label: string; color: string } {
  if (a == null) return { label: "Мало данных", color: "muted" };
  if (a < 0.8) return { label: "Ниже обычной", color: "air" };
  if (a <= 1.3) return { label: "Оптимально", color: "ok" };
  if (a <= 1.5) return { label: "Растёт быстро", color: "warn" };
  return { label: "Риск перегрузки", color: "bad" };
}

/**
 * Короткий вывод дня по правилам (до подключения ИИ-тренера на этапе 3).
 * Возвращает заголовок и пояснение с причинами.
 */
export function dayInsight(days: Day[], load: Load | undefined): { head: string; body: string } {
  const i = days.length - 1;
  const d = days[i];
  const r = load?.readiness ?? null;
  const acwr = load?.acwr ?? null;
  const reasons: string[] = [];
  const zh = z(days, "hrv_ms"), zr = z(days, "resting_hr");
  if (zh != null && zh >= 0.5) reasons.push("ВСР выше нормы");
  if (zh != null && zh <= -0.5) reasons.push("ВСР ниже нормы");
  if (zr != null && zr >= 1) reasons.push("пульс покоя повышен");
  if (zr != null && zr <= -1) reasons.push("пульс покоя ниже обычного");
  if (d?.sleep_min != null && d.sleep_min < 360) reasons.push("сна меньше 6 часов");
  else if (d?.sleep_min != null && d.sleep_min >= 450) reasons.push("сон больше 7,5 часов");
  if (d?.skin_temp_delta_c != null && Math.abs(d.skin_temp_delta_c) >= 1) reasons.push("температура кожи заметно отличается от обычной");
  if (acwr != null && acwr > 1.3) reasons.push("нагрузка за неделю растёт быстрее, чем за месяц");

  let head = "Готовность пока не посчитана.";
  if (r != null) head = r >= 75 ? "Готовность высокая." : r >= 60 ? "Готовность в норме." : r >= 50 ? "Готовность снижена." : "Организм просит восстановления.";

  let advice = "";
  if (r != null) {
    if (r < 50 || (acwr != null && acwr > 1.5)) advice = "Лучше лёгкий день: прогулка, растяжка, ранний отбой.";
    else if (r < 60 || (acwr != null && acwr > 1.3)) advice = "Подойдёт умеренная тренировка без работы до отказа.";
    else advice = "Хороший день для силовой или интервалов.";
  }
  const why = reasons.length ? reasons[0][0].toUpperCase() + reasons.slice(0, 3).join(", ").slice(1) + ". " : "";
  return { head, body: why + advice };
}
