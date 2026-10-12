"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { fmtDayShort, fmtTime, fmtWeekdayShort, minutesOfDay, num, type Stage } from "@/lib/data";

// Графики в стиле Apple Health: SVG в реальных пикселях (без растяжения текста),
// палец или мышь «ведёт» по графику, а значение показывается в шапке карточки.

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function niceTicks(lo: number, hi: number, n = 3): number[] {
  const span = hi - lo || Math.abs(hi) || 1;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let t = Math.floor(lo / step) * step; t <= hi + step * 0.001; t += step) out.push(+t.toFixed(6));
  if (out[out.length - 1] < hi) out.push(+(out[out.length - 1] + step).toFixed(6));
  return out;
}

const c = (name: string) => `var(--${name})`;

// ---------- кольцо ----------

export function Ring({ value, color, size = 132, label = "из 100" }: { value: number | null; color: string; size?: number; label?: string }) {
  const r = size / 2 - 10;
  const len = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, (value ?? 0) / 100));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${value ?? "нет данных"} ${label}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c("track")} strokeWidth={14} />
      <circle
        className="ring-arc"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={14}
        strokeLinecap="round"
        strokeDasharray={`${len * p} ${len}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y={size / 2 + 6} textAnchor="middle" fontSize={size * 0.27} fontWeight={700} fill={c("ink")} className="rounded">
        {value ?? "—"}
      </text>
      <text x="50%" y={size / 2 + 26} textAnchor="middle" fontSize={12} fontWeight={600} fill={c("muted")}>
        {label}
      </text>
    </svg>
  );
}

// ---------- тройные кольца как в «Фитнесе» ----------

export type RingItem = { value: number | null; color: string; label: string };

/** Концентрические кольца: value в долях (1 = цель). Больше 1 рисуется вторым кругом поверх. */
export function ActivityRings({ rings, size = 150 }: { rings: RingItem[]; size?: number }) {
  const sw = size * 0.11;
  const gap = 3;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={rings.map((r) => `${r.label}: ${r.value == null ? "нет данных" : Math.round(r.value * 100) + "%"}`).join(", ")}>
      {rings.map((r, i) => {
        const rad = size / 2 - sw / 2 - i * (sw + gap);
        const len = 2 * Math.PI * rad;
        const p = Math.max(0, r.value ?? 0);
        const first = Math.min(p, 1);
        const over = Math.min(Math.max(p - 1, 0), 1);
        const mid = size / 2;
        return (
          <g key={i}>
            <circle cx={mid} cy={mid} r={rad} fill="none" stroke={r.color} strokeOpacity={0.22} strokeWidth={sw} />
            {first > 0 && (
              <circle className="ring-arc" cx={mid} cy={mid} r={rad} fill="none" stroke={r.color} strokeWidth={sw} strokeLinecap="round"
                strokeDasharray={`${Math.max(len * first - 0.01, 0.01)} ${len}`} transform={`rotate(-90 ${mid} ${mid})`} />
            )}
            {over > 0 && (
              <circle cx={mid} cy={mid} r={rad} fill="none" stroke={r.color} strokeWidth={sw} strokeLinecap="round"
                strokeDasharray={`${len * over} ${len}`} transform={`rotate(-90 ${mid} ${mid})`} style={{ filter: "drop-shadow(0 0 2px rgba(0,0,0,.45))" }} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ---------- маленький график в карточке ----------

export function Spark({ values, color, kind = "line", height = 32 }: { values: (number | null)[]; color: string; kind?: "line" | "bar"; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const ys = values.filter((v): v is number => v != null);
  return (
    <div ref={ref} style={{ width: "100%" }}>
      {w > 0 && ys.length > 0 && (
        <svg width={w} height={height} style={{ display: "block", overflow: "visible" }} aria-hidden>
          {(() => {
            const n = values.length;
            const X = (i: number) => 4 + (i * (w - 8)) / Math.max(1, n - 1);
            if (kind === "bar") {
              const hi = Math.max(...ys) || 1;
              const bw = Math.max(3, (w - 8) / n - 3);
              return values.map((v, i) =>
                v == null ? null : (
                  <rect key={i} x={X(i) - bw / 2} y={height - Math.max(2, (v / hi) * height)} width={bw} height={Math.max(2, (v / hi) * height)} rx={2} fill={color} opacity={i === n - 1 ? 1 : 0.4} />
                ),
              );
            }
            const lo = Math.min(...ys), hi = Math.max(...ys);
            const Y = (v: number) => height - 4 - ((v - lo) / (hi - lo || 1)) * (height - 8);
            const pts = values.map((v, i) => (v == null ? null : `${X(i)},${Y(v)}`)).filter(Boolean).join(" ");
            const li = values.map((v, i) => (v == null ? -1 : i)).reduce((a, b) => Math.max(a, b), -1);
            return (
              <>
                <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {li >= 0 && <circle cx={X(li)} cy={Y(values[li]!)} r={3.5} fill={color} stroke={c("card")} strokeWidth={1.5} />}
              </>
            );
          })()}
        </svg>
      )}
    </div>
  );
}

// ---------- тренд по дням с «прокруткой» пальцем ----------

export type Series = { key: string; values: (number | null)[]; color: string; kind: "bar" | "line" | "dash"; opacity?: number };
export type Stack = { key: string; label: string; color: string; opacity?: number; values: (number | null)[] }[];

type TrendProps = {
  days: string[];
  series?: Series[];
  stack?: Stack;
  height?: number;
  yMin?: number;
  yMax?: number;
  band?: { lo: number; hi: number; label?: string };
  ref_?: { y: number; label: string };
  barColor?: (v: number, i: number) => string;
  /** свои подписи оси X (по умолчанию даты) */
  labels?: string[];
  /** что показать в шапке при наведении на день */
  readout: (i: number | null) => ReactNode;
};

export function Trend({ days, series = [], stack, height = 180, yMin, yMax, band, ref_, barColor, labels, readout }: TrendProps) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  const n = days.length;
  const padL = 2, padR = 34, padT = 8, padB = 22;
  const plotW = Math.max(10, w - padL - padR);
  const plotH = height - padT - padB;

  const all: number[] = [];
  series.forEach((s) => s.values.forEach((v) => v != null && all.push(v)));
  if (stack) days.forEach((_, i) => all.push(stack.reduce((sum, s) => sum + (s.values[i] ?? 0), 0)));
  if (band) all.push(band.lo, band.hi);
  if (ref_) all.push(ref_.y);
  const hasBars = !!stack || series.some((s) => s.kind === "bar");
  let lo = yMin ?? (hasBars ? 0 : Math.min(...all));
  let hi = yMax ?? Math.max(...all);
  if (!all.length) (lo = 0), (hi = 1);
  if (!hasBars && yMin == null) {
    const pad = (hi - lo) * 0.15 || 1;
    lo -= pad;
    hi += pad;
  }
  const nice = niceTicks(lo, hi, 3);
  lo = yMin ?? nice[0];
  hi = yMax ?? nice[nice.length - 1];
  const ticks = nice.filter((t) => t >= lo - 1e-9 && t <= hi + 1e-9);
  const step = plotW / Math.max(1, n);
  const X = (i: number) => padL + step * i + step / 2;
  const Y = (v: number) => padT + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const bw = Math.max(1.5, Math.min(22, step * 0.62));

  const labelEvery = n <= 7 ? 1 : labels ? Math.ceil(n / 4) : Math.ceil(n / 5);
  const xLabel = (i: number) => (labels ? labels[i] : n <= 7 ? fmtWeekdayShort(days[i]) : fmtDayShort(days[i]));

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - padL) / step);
    setSel(i >= 0 && i < n ? i : null);
  }

  const dim = (i: number) => (sel == null ? 1 : sel === i ? 1 : 0.35);

  return (
    <div className="trend">
      <div className="readout">{readout(sel)}</div>
      <div ref={ref} style={{ width: "100%", touchAction: "pan-y" }}>
        {w > 0 && (
          <svg width={w} height={height} style={{ display: "block" }} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setSel(null)} role="img">
            {band && <rect x={padL} y={Y(band.hi)} width={plotW} height={Math.max(0, Y(band.lo) - Y(band.hi))} rx={4} fill={c("ok")} opacity={0.12} />}
            {band?.label && (
              <text x={padL + plotW - 4} y={Y(band.hi) + 12} textAnchor="end" fontSize={10} fill={c("ok")}>
                {band.label}
              </text>
            )}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={padL + plotW} y1={Y(t)} y2={Y(t)} stroke={c("hair")} strokeDasharray={t === lo ? undefined : "2 3"} />
                <text x={padL + plotW + 6} y={Y(t) + 4} fontSize={11} fill={c("muted")}>
                  {Math.abs(t) >= 10000 ? `${num(t / 1000)}к` : num(t, t % 1 ? 1 : 0)}
                </text>
              </g>
            ))}
            {ref_ && (
              <g>
                <line x1={padL} x2={padL + plotW} y1={Y(ref_.y)} y2={Y(ref_.y)} stroke={c("ink")} strokeOpacity={0.45} strokeDasharray="4 4" />
                <text x={padL + 4} y={Y(ref_.y) - 5} fontSize={10} fill={c("muted")}>
                  {ref_.label}
                </text>
              </g>
            )}
            {stack &&
              days.map((_, i) => {
                let acc = 0;
                return (
                  <g key={i} opacity={dim(i)}>
                    {stack.map((s) => {
                      const v = s.values[i] ?? 0;
                      if (!v) return null;
                      const y0 = Y(acc), y1 = Y(acc + v);
                      acc += v;
                      return <rect key={s.key} x={X(i) - bw / 2} y={y1} width={bw} height={Math.max(1, y0 - y1)} fill={s.color} opacity={s.opacity ?? 1} />;
                    })}
                  </g>
                );
              })}
            {series
              .filter((s) => s.kind === "bar")
              .map((s) =>
                s.values.map((v, i) =>
                  v == null ? null : (
                    <rect key={s.key + i} x={X(i) - bw / 2} y={Y(Math.max(v, lo))} width={bw} height={Math.max(2, Y(lo) - Y(Math.max(v, lo)))} rx={Math.min(3, bw / 3)} fill={barColor ? barColor(v, i) : s.color} opacity={(s.opacity ?? 1) * dim(i)} />
                  ),
                ),
              )}
            {series
              .filter((s) => s.kind !== "bar")
              .map((s) => {
                const segs: string[][] = [[]];
                s.values.forEach((v, i) => (v == null ? segs.push([]) : segs[segs.length - 1].push(`${X(i)},${Y(v)}`)));
                return (
                  <g key={s.key}>
                    {segs
                      .filter((g) => g.length)
                      .map((g, k) =>
                        g.length === 1 ? (
                          <circle key={k} cx={+g[0].split(",")[0]} cy={+g[0].split(",")[1]} r={2.5} fill={s.color} />
                        ) : (
                          <polyline key={k} points={g.join(" ")} fill="none" stroke={s.color} strokeWidth={s.kind === "dash" ? 1.6 : 2.2} strokeDasharray={s.kind === "dash" ? "4 3" : undefined} strokeLinejoin="round" strokeLinecap="round" opacity={s.opacity ?? 1} />
                        ),
                      )}
                    {sel != null && s.values[sel] != null && <circle cx={X(sel)} cy={Y(s.values[sel]!)} r={4.5} fill={s.color} stroke={c("card")} strokeWidth={2} />}
                  </g>
                );
              })}
            {sel != null && <line x1={X(sel)} x2={X(sel)} y1={padT} y2={padT + plotH} stroke={c("ink")} strokeOpacity={0.25} />}
            {days.map((d, i) =>
              (labels ? i : n - 1 - i) % labelEvery === 0 ? (
                <text key={i} x={X(i)} y={height - 5} textAnchor="middle" fontSize={11} fill={c("muted")}>
                  {xLabel(i)}
                </text>
              ) : null,
            )}
          </svg>
        )}
      </div>
    </div>
  );
}

// ---------- гипнограмма ----------

const STAGE_ROW: Record<string, number> = { awake: 0, rem: 1, light: 2, asleep: 2, deep: 3 };
const STAGE_COLOR: Record<string, [string, number]> = { awake: ["temp", 1], rem: ["air", 1], light: ["sleep", 0.5], asleep: ["sleep", 0.5], deep: ["sleep", 1] };
export const STAGE_NAMES = ["Бодрств.", "REM", "Лёгкий", "Глубокий"];

export function Hypnogram({ stages, tz }: { stages: Stage[]; tz: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  if (!stages.length) return <div className="note">Стадий сна за эту ночь нет.</div>;
  const t0 = stages[0][0], t1 = stages[stages.length - 1][0] + stages[stages.length - 1][1];
  const padL = 64, rowH = 32, H = rowH * 4 + 22;
  const plotW = Math.max(10, w - padL - 4);
  const X = (t: number) => padL + ((t - t0) / (t1 - t0 || 1)) * plotW;
  const hourTicks: number[] = [];
  const firstHour = Math.ceil(t0 / 3600) * 3600;
  const every = (t1 - t0) / 3600 > 8 ? 2 : 1;
  for (let t = firstHour; t < t1; t += 3600) if (Math.round(minutesOfDay(t, tz) / 60) % every === 0) hourTicks.push(t);
  const cur = sel != null ? stages[sel] : null;
  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const t = t0 + ((e.clientX - r.left - padL) / plotW) * (t1 - t0);
    const i = stages.findIndex((s) => t >= s[0] && t < s[0] + s[1]);
    setSel(i >= 0 ? i : null);
  }
  return (
    <div className="trend">
      <div className="readout small">
        {cur ? (
          <>
            <b>{STAGE_NAMES[STAGE_ROW[cur[2]] ?? 2]}</b> {fmtTime(cur[0], tz)}–{fmtTime(cur[0] + cur[1], tz)} · {Math.round(cur[1] / 60)} мин
          </>
        ) : (
          <span className="muted">Проведите по графику, чтобы увидеть стадию</span>
        )}
      </div>
      <div ref={ref} style={{ touchAction: "pan-y" }}>
        {w > 0 && (
          <svg width={w} height={H} style={{ display: "block" }} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setSel(null)}>
            {STAGE_NAMES.map((n, i) => (
              <g key={n}>
                <line x1={padL} x2={padL + plotW} y1={i * rowH + rowH / 2} y2={i * rowH + rowH / 2} stroke={c("hair")} strokeDasharray="2 3" />
                <text x={0} y={i * rowH + rowH / 2 + 4} fontSize={11} fill={c("muted")}>
                  {n}
                </text>
              </g>
            ))}
            {hourTicks.map((t) => (
              <text key={t} x={X(t)} y={H - 4} textAnchor={X(t) > w - 20 ? "end" : "middle"} fontSize={11} fill={c("muted")}>
                {fmtTime(t, tz)}
              </text>
            ))}
            {stages.map((s, i) => {
              if (i === 0) return null;
              const a = STAGE_ROW[stages[i - 1][2]] ?? 2, b = STAGE_ROW[s[2]] ?? 2;
              return <line key={"j" + i} x1={X(s[0])} x2={X(s[0])} y1={Math.min(a, b) * rowH + rowH / 2} y2={Math.max(a, b) * rowH + rowH / 2} stroke={c("muted")} strokeOpacity={0.25} />;
            })}
            {stages.map((s, i) => {
              const row = STAGE_ROW[s[2]] ?? 2;
              const [col, op] = STAGE_COLOR[s[2]] ?? ["sleep", 0.5];
              return <rect key={i} x={X(s[0])} y={row * rowH + 5} width={Math.max(1.5, X(s[0] + s[1]) - X(s[0]))} height={rowH - 10} rx={4} fill={c(col)} opacity={sel == null || sel === i ? op : op * 0.4} />;
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

// ---------- пульс за период времени (по минутам) ----------

export function HrLine({ hr, tz, from, to, restingHr, height = 150 }: { hr: [number, number, number | null, number | null][]; tz: string; from?: number; to?: number; restingHr?: number | null; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  const pts = hr.filter(([t]) => (from == null || t >= from) && (to == null || t <= to));
  if (!pts.length) return <div className="note">Пульса за это время нет.</div>;
  const t0 = from ?? pts[0][0], t1 = to ?? pts[pts.length - 1][0];
  const padL = 2, padR = 34, padT = 8, padB = 22;
  const plotW = Math.max(10, w - padL - padR), plotH = height - padT - padB;
  const lows = pts.map((p) => p[2] ?? p[1]), highs = pts.map((p) => p[3] ?? p[1]);
  const ticks = niceTicks(Math.min(...lows, restingHr ?? Infinity), Math.max(...highs), 3);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const X = (t: number) => padL + ((t - t0) / (t1 - t0 || 1)) * plotW;
  const Y = (v: number) => padT + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  // разрывы больше 10 минут не соединяем
  const segs: (typeof pts)[] = [[]];
  pts.forEach((p, i) => {
    if (i && p[0] - pts[i - 1][0] > 600) segs.push([]);
    segs[segs.length - 1].push(p);
  });
  const hours = (t1 - t0) / 3600;
  const every = hours > 14 ? 6 : hours > 7 ? 2 : 1;
  const hourTicks: number[] = [];
  for (let t = Math.ceil(t0 / 3600) * 3600; t <= t1; t += 3600) if (Math.round(minutesOfDay(t, tz) / 60) % every === 0) hourTicks.push(t);
  const cur = sel != null ? pts[sel] : null;
  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const t = t0 + ((e.clientX - r.left - padL) / plotW) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - t) < Math.abs(pts[best][0] - t)) best = i;
    setSel(best);
  }
  const minP = pts.reduce((a, b) => (b[1] < a[1] ? b : a));
  const maxP = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
  return (
    <div className="trend">
      <div className="readout small">
        {cur ? (
          <>
            <b className="rounded">{Math.round(cur[1])}</b> уд/мин · {fmtTime(cur[0], tz)}
            {cur[2] != null && cur[3] != null && <span className="muted"> · {Math.round(cur[2])}–{Math.round(cur[3])}</span>}
          </>
        ) : (
          <span className="muted">
            {Math.round(minP[1])}–{Math.round(maxP[1])} уд/мин · минимум в {fmtTime(minP[0], tz)}
          </span>
        )}
      </div>
      <div ref={ref} style={{ touchAction: "pan-y" }}>
        {w > 0 && (
          <svg width={w} height={height} style={{ display: "block" }} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setSel(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={padL + plotW} y1={Y(t)} y2={Y(t)} stroke={c("hair")} strokeDasharray="2 3" />
                <text x={padL + plotW + 6} y={Y(t) + 4} fontSize={11} fill={c("muted")}>
                  {t}
                </text>
              </g>
            ))}
            {segs.map((g, k) => (
              <g key={k}>
                <polygon points={[...g.map((p) => `${X(p[0])},${Y(p[3] ?? p[1])}`), ...g.slice().reverse().map((p) => `${X(p[0])},${Y(p[2] ?? p[1])}`)].join(" ")} fill={c("heart")} opacity={0.14} />
                <polyline points={g.map((p) => `${X(p[0])},${Y(p[1])}`).join(" ")} fill="none" stroke={c("heart")} strokeWidth={1.6} strokeLinejoin="round" />
              </g>
            ))}
            {restingHr != null && (
              <g>
                <line x1={padL} x2={padL + plotW} y1={Y(restingHr)} y2={Y(restingHr)} stroke={c("heart")} strokeDasharray="4 4" opacity={0.6} />
                <text x={padL + 4} y={Y(restingHr) - 5} fontSize={10} fill={c("muted")}>
                  покоя {Math.round(restingHr)}
                </text>
              </g>
            )}
            {cur && (
              <>
                <line x1={X(cur[0])} x2={X(cur[0])} y1={padT} y2={padT + plotH} stroke={c("ink")} strokeOpacity={0.25} />
                <circle cx={X(cur[0])} cy={Y(cur[1])} r={4.5} fill={c("heart")} stroke={c("card")} strokeWidth={2} />
              </>
            )}
            {hourTicks.map((t) => (
              <text key={t} x={X(t)} y={height - 5} textAnchor={X(t) < 18 ? "start" : "middle"} fontSize={11} fill={c("muted")}>
                {fmtTime(t, tz)}
              </text>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

// ---------- режим сна: когда легли и встали ----------

export function SleepSchedule({ days, starts, ends, tz, height = 170 }: { days: string[]; starts: (string | null)[]; ends: (string | null)[]; tz: string; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  const n = days.length;
  // ось времени от 20:00 до 14:00 следующего дня (в минутах от 20:00)
  const rel = (ts: string) => (minutesOfDay(ts, tz) - 20 * 60 + 1440) % 1440;
  const vals = days.map((_, i) => (starts[i] && ends[i] ? [rel(starts[i]!), rel(ends[i]!)] : null));
  const present = vals.filter((v): v is number[] => !!v);
  const lo = Math.max(0, Math.floor((Math.min(...present.map((v) => v[0]), 240) - 30) / 60) * 60);
  const hi = Math.min(1080, Math.ceil((Math.max(...present.map((v) => v[1]), 660) + 30) / 60) * 60);
  const padL = 2, padR = 44, padT = 8, padB = 22;
  const plotW = Math.max(10, w - padL - padR), plotH = height - padT - padB;
  const step = plotW / Math.max(1, n);
  const X = (i: number) => padL + step * i + step / 2;
  const Y = (m: number) => padT + ((m - lo) / (hi - lo)) * plotH;
  const bw = Math.max(2, Math.min(14, step * 0.55));
  const label = (m: number) => `${String(Math.floor((m / 60 + 20) % 24)).padStart(2, "0")}:00`;
  const ticks: number[] = [];
  for (let m = lo; m <= hi; m += hi - lo > 720 ? 240 : 120) ticks.push(m);
  const labelEvery = n <= 7 ? 1 : Math.ceil(n / 5);
  return (
    <div className="trend">
      <div className="readout small">
        {sel != null && vals[sel] ? (
          <>
            <b>{fmtDayShort(days[sel])}</b> {fmtTime(starts[sel]!, tz)} – {fmtTime(ends[sel]!, tz)}
          </>
        ) : (
          <span className="muted">Отбой и подъём по дням</span>
        )}
      </div>
      <div ref={ref} style={{ touchAction: "pan-y" }}>
        {w > 0 && present.length > 0 && (
          <svg
            width={w}
            height={height}
            style={{ display: "block" }}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const i = Math.floor((e.clientX - r.left - padL) / step);
              setSel(i >= 0 && i < n ? i : null);
            }}
            onPointerLeave={() => setSel(null)}
          >
            {ticks.map((m) => (
              <g key={m}>
                <line x1={padL} x2={padL + plotW} y1={Y(m)} y2={Y(m)} stroke={c("hair")} strokeDasharray="2 3" />
                <text x={padL + plotW + 6} y={Y(m) + 4} fontSize={11} fill={c("muted")}>
                  {label(m)}
                </text>
              </g>
            ))}
            {vals.map((v, i) =>
              v ? <rect key={i} x={X(i) - bw / 2} y={Y(v[0])} width={bw} height={Math.max(2, Y(v[1]) - Y(v[0]))} rx={bw / 2} fill={c("sleep")} opacity={sel == null || sel === i ? 0.9 : 0.35} /> : null,
            )}
            {days.map((d, i) =>
              (n - 1 - i) % labelEvery === 0 ? (
                <text key={d} x={X(i)} y={height - 5} textAnchor="middle" fontSize={11} fill={c("muted")}>
                  {n <= 7 ? fmtWeekdayShort(d) : fmtDayShort(d)}
                </text>
              ) : null,
            )}
          </svg>
        )}
      </div>
    </div>
  );
}

// ---------- полоса «значение против нормы» ----------

export function NormBar({ label, value, norm, max, color, opacity = 1, unit = "мин" }: { label: string; value: number | null; norm: number | null; max: number; color: string; opacity?: number; unit?: string }) {
  return (
    <div className="normbar">
      <div className="row-between">
        <span className="normbar-l">{label}</span>
        <span className="muted small">
          {num(value)} {unit}
          {norm != null && ` · норма ${num(norm)}`}
        </span>
      </div>
      <div className="normbar-track">
        <div style={{ width: `${Math.min(100, ((value ?? 0) / max) * 100)}%`, background: color, opacity }} />
        {norm != null && <i style={{ left: `${Math.min(100, (norm / max) * 100)}%` }} />}
      </div>
    </div>
  );
}
