"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Trend } from "@/components/charts";
import { Card, ErrorCard, Header, Loading, Seg, SpanSeg, spanDays, type SpanKey } from "@/components/ui";
import { fmtDayShort, hmText, mean, num, useSummary, type Day } from "@/lib/data";
import { PasswordCard, signOut } from "@/components/Shell";

type Metric = { key: keyof Day; label: string; color: string; unit: string; digits?: number; kind: "bar" | "line" };

const METRICS: Metric[] = [
  { key: "hrv_ms", label: "ВСР", color: "load", unit: "мс", digits: 1, kind: "line" },
  { key: "resting_hr", label: "Пульс покоя", color: "heart", unit: "уд/мин", kind: "line" },
  { key: "sleep_min", label: "Сон", color: "sleep", unit: "мин", kind: "bar" },
  { key: "steps", label: "Шаги", color: "move", unit: "", kind: "bar" },
  { key: "azm", label: "Минуты в зонах", color: "move", unit: "мин", kind: "bar" },
  { key: "active_kcal", label: "Активные ккал", color: "temp", unit: "ккал", kind: "bar" },
  { key: "distance_km", label: "Дистанция", color: "move", unit: "км", digits: 1, kind: "bar" },
  { key: "spo2_avg", label: "Кислород", color: "air", unit: "%", digits: 1, kind: "line" },
  { key: "resp_rate", label: "Дыхание", color: "air", unit: "вд/мин", digits: 1, kind: "line" },
  { key: "skin_temp_delta_c", label: "Темп. кожи", color: "temp", unit: "°C", digits: 2, kind: "line" },
  { key: "hr_avg", label: "Средний пульс", color: "heart", unit: "уд/мин", kind: "line" },
  { key: "sedentary_min", label: "Сидячие минуты", color: "muted", unit: "мин", kind: "bar" },
  { key: "trimp", label: "Нагрузка", color: "load", unit: "", kind: "bar" },
];

export default function DataPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Data />
    </Suspense>
  );
}

function Data() {
  const params = useSearchParams();
  const router = useRouter();
  const [span, setSpan] = useState<SpanKey>("m");
  const [key, setKey] = useState<keyof Day>((params.get("m") as keyof Day) || "hrv_ms");
  const [view, setView] = useState<"charts" | "table">("charts");
  const { data, error, reload } = useSummary(spanDays(span));
  if (error) return <ErrorCard error={error} onRetry={reload} />;

  const metric = METRICS.find((m) => m.key === key) ?? METRICS[0];
  const days = data?.days.slice(-spanDays(span)) ?? [];
  const dd = days.map((d) => d.day);
  const fmt = (v: number | null | undefined, m: Metric) => (m.key === "sleep_min" ? hmText(v) : num(v, m.digits ?? 0));

  return (
    <>
      <Header eyebrow="все показатели" title="Данные" />
      <SpanSeg value={span} onChange={setSpan} />
      <Seg value={view} options={[{ key: "charts", label: "Графики" }, { key: "table", label: "Таблица" }] as const} onChange={setView} label="Вид" />
      {!data ? (
        <Loading />
      ) : view === "charts" ? (
        <>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
            {METRICS.map((m) => (
              <button key={m.key} className="pill" onClick={() => setKey(m.key)} style={{ border: 0, cursor: "pointer", padding: "6px 12px", fontSize: 13, color: m.key === key ? `var(--${m.color})` : "var(--muted)", background: m.key === key ? undefined : "var(--card)" }}>
                {m.label}
              </button>
            ))}
          </div>
          {[metric, ...METRICS.filter((m) => m.key !== metric.key)].map((m, k) => {
            const vals = days.map((d) => d[m.key] as number | null);
            const avg = mean(vals);
            return (
              <Card key={m.key} title={m.label} color={m.color}>
                <Trend
                  days={dd}
                  height={k === 0 ? 200 : 140}
                  series={[{ key: m.key, values: vals, color: `var(--${m.color})`, kind: m.kind }]}
                  ref_={avg != null ? { y: avg, label: "среднее" } : undefined}
                  readout={(i) => (
                    <div>
                      <div className="muted small">{i == null ? "В среднем" : fmtDayShort(dd[i])}</div>
                      <div className="val">
                        {fmt(i == null ? avg : vals[i], m)}
                        {m.key !== "sleep_min" && m.unit && <small>{m.unit}</small>}
                      </div>
                    </div>
                  )}
                />
              </Card>
            );
          })}
        </>
      ) : (
        <Card>
          <div className="scroll-x">
            <table className="days">
              <thead>
                <tr>
                  <th>День</th>
                  <th>Готовн.</th>
                  <th>Сон</th>
                  <th>ВСР</th>
                  <th>Покой</th>
                  <th>Шаги</th>
                  <th>Зоны</th>
                  <th>Нагр.</th>
                  <th>Кислород</th>
                </tr>
              </thead>
              <tbody>
                {days
                  .slice()
                  .reverse()
                  .map((d) => {
                    const l = data.load.find((x) => x.day === d.day);
                    return (
                      <tr key={d.day} onClick={() => router.push(`/day?d=${d.day}`)}>
                        <td>{fmtDayShort(d.day)}</td>
                        <td>{num(l?.readiness)}</td>
                        <td>{d.sleep_min != null ? hmText(d.sleep_min).replace(" мин", "") : "—"}</td>
                        <td>{num(d.hrv_ms, 1)}</td>
                        <td>{num(d.resting_hr)}</td>
                        <td>{num(d.steps)}</td>
                        <td>{num(d.azm)}</td>
                        <td>{num(d.trimp)}</td>
                        <td>{num(d.spo2_avg, 1)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <PasswordCard />
      <button className="btn ghost" onClick={() => signOut()} style={{ marginTop: 12 }}>
        Выйти
      </button>
    </>
  );
}
