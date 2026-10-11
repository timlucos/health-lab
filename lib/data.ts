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

function useRpc<T>(fn: string, args: Record<string, unknown> | null): State<T> & { reload: () => void } {
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
