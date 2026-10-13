"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, ErrorCard, Header, Loading, Seg } from "@/components/ui";
import { fmtDay, mean, num, useGoal, useProgress, useSummary, type Day } from "@/lib/data";

// Отчёт для врача: средние за период, сравнение последней недели с остальным периодом и общепринятые нормы.
// Нормы — для взрослых в покое (AHA, AASM, ВОЗ); ВСР и температура кожи — только относительно своих же значений.
type Row = { key: keyof Day; label: string; unit: string; digits: number; norm: string; bad?: (v: number) => boolean; higherWorse?: boolean };

const ROWS: Row[] = [
  { key: "resting_hr", label: "Пульс покоя", unit: "уд/мин", digits: 0, norm: "60–100 (у тренированных от 40)", bad: (v) => v > 100 || v < 40, higherWorse: true },
  { key: "hrv_ms", label: "Вариабельность пульса (ВСР)", unit: "мс", digits: 0, norm: "индивидуально, важен тренд" },
  { key: "sleep_min", label: "Сон", unit: "ч", digits: 1, norm: "7–9 ч", bad: (v) => v < 7 * 60 },
  { key: "sleep_deep_min", label: "Глубокий сон", unit: "мин", digits: 0, norm: "≈ 13–23% сна" },
  { key: "sleep_rem_min", label: "Быстрый сон", unit: "мин", digits: 0, norm: "≈ 20–25% сна" },
  { key: "spo2_avg", label: "Кислород ночью", unit: "%", digits: 1, norm: "95–100%", bad: (v) => v < 95 },
  { key: "resp_rate", label: "Дыхание во сне", unit: "вд/мин", digits: 1, norm: "12–20", bad: (v) => v < 12 || v > 20, higherWorse: true },
  { key: "skin_temp_delta_c", label: "Температура кожи к обычной", unit: "°C", digits: 2, norm: "±0,5 °C", bad: (v) => Math.abs(v) > 0.5, higherWorse: true },
  { key: "steps", label: "Шаги", unit: "в день", digits: 0, norm: "от 7000–8000", bad: (v) => v < 5000 },
  { key: "azm", label: "Минуты в зонах пульса", unit: "в день", digits: 0, norm: "от 150 в неделю (ВОЗ)" },
];

const SPANS = [
  { key: "30", label: "30 дней" },
  { key: "90", label: "90 дней" },
] as const;

export default function Report() {
  const [span, setSpan] = useState<"30" | "90">("30");
  const n = Number(span);
  const sum = useSummary(n);
  const pr = useProgress(Math.ceil(n / 7) + 1);
  const goal = useGoal();

  if (sum.error || pr.error) return <ErrorCard error={(sum.error ?? pr.error)!} onRetry={() => { sum.reload(); pr.reload(); }} />;
  if (!sum.data || !pr.data) return <Loading n={3} />;

  const days = sum.data.days.slice(-n);
  const last7 = days.slice(-7);
  const before = days.slice(0, -7);
  const from = days[0]?.day, to = days.at(-1)?.day;
  const val = (r: Row, xs: Day[]) => mean(xs.map((d) => d[r.key] as number | null));
  const show = (r: Row, v: number | null) => (v == null ? "—" : r.key === "sleep_min" ? num(v / 60, 1) : num(v, r.digits));
  const flags: string[] = [];

  const weights = pr.data.checkins.filter((c) => c.weight_kg != null && (!from || c.day >= from));
  const g = goal.data?.details;

  const rows = ROWS.map((r) => {
    const all = val(r, days), w = val(r, last7), b = val(r, before);
    const vals = days.map((d) => d[r.key] as number | null).filter((x): x is number => x != null);
    const lo = vals.length ? Math.min(...vals) : null, hi = vals.length ? Math.max(...vals) : null;
    const diff = w != null && b != null && b !== 0 ? (w - b) / Math.abs(b) : null;
    const out = all != null && r.bad?.(all);
    if (out) flags.push(`${r.label}: в среднем ${show(r, all)} ${r.unit} при норме ${r.norm}.`);
    if (r.key === "resting_hr" && w != null && b != null && w - b >= 5) flags.push(`Пульс покоя за последнюю неделю выше обычного на ${num(w - b, 0)} уд/мин.`);
    if (r.key === "hrv_ms" && diff != null && diff <= -0.15) flags.push(`ВСР за последнюю неделю ниже обычной на ${num(-diff * 100, 0)}%.`);
    if (r.key === "spo2_avg" && lo != null && lo < 92) flags.push(`Были ночи с кислородом ниже 92% (минимум ${num(lo, 1)}%).`);
    return { r, all, w, b, lo, hi, diff, out };
  });

  return (
    <>
      <Header eyebrow="для врача" title="Отчёт о здоровье">
        <Link href="/data" className="muted small no-print">‹ Данные</Link>
      </Header>
      <div className="no-print" style={{ display: "grid", gap: 10 }}>
        <Seg value={span} options={SPANS} onChange={setSpan} label="Период" />
        <button className="btn" onClick={() => window.print()}>Сохранить PDF или распечатать</button>
        <p className="note">На iPhone: кнопка выше → «Поделиться» → «Сохранить в Файлы», или покажите экран врачу.</p>
      </div>

      <Card title="Кратко" color="ring3">
        <p className="note">
          Период: {from ? fmtDay(from) : "—"} — {to ? fmtDay(to) : "—"} ({days.length} дн.). Данные с фитнес-часов (Google Health), замеры и вес — вручную.
          {g?.age ? ` Возраст ${g.age}.` : ""}{g?.height_cm ? ` Рост ${g.height_cm} см.` : ""}
          {weights.length ? ` Вес ${num(weights.at(-1)!.weight_kg, 1)} кг${weights.length > 1 ? ` (${weights.at(-1)!.weight_kg! - weights[0].weight_kg! >= 0 ? "+" : ""}${num(weights.at(-1)!.weight_kg! - weights[0].weight_kg!, 1)} за период)` : ""}.` : ""}
          {" "}Цель: {goal.data?.title ?? "—"}. Принимает креатин моногидрат.
        </p>
        {flags.length ? (
          <ul className="report-flags">{flags.map((f, i) => <li key={i}>{f}</li>)}</ul>
        ) : (
          <p className="note">Отклонений от общепринятых норм и от своих обычных значений не найдено.</p>
        )}
        <p className="note muted">Это сводка данных носимого устройства, а не диагноз. Часы оценивают показатели косвенно и могут ошибаться.</p>
      </Card>

      <Card title="Показатели" color="air">
        <div className="report-table" role="table">
          <div className="rt-h" role="row">
            <span>Показатель</span><span>Среднее</span><span>Посл. 7 дн.</span><span>Мин–макс</span><span>Норма</span>
          </div>
          {rows.map(({ r, all, w, b, lo, hi, diff, out }) => (
            <div key={r.key} className={"rt-r" + (out ? " bad" : "")} role="row">
              <span>{r.label}<small>{r.unit}</small></span>
              <span>{show(r, all)}</span>
              <span>
                {show(r, w)}
                {r.key === "skin_temp_delta_c"
                  ? w != null && b != null && Math.abs(w - b) >= 0.1 && <small>{w > b ? "▲" : "▼"} {num(Math.abs(w - b), 2)} °C</small>
                  : diff != null && Math.abs(diff) >= 0.05 && <small>{diff > 0 ? "▲" : "▼"} {num(Math.abs(diff) * 100, 0)}%</small>}
              </span>
              <span>{lo == null ? "—" : `${show(r, lo)}–${show(r, hi)}`}</span>
              <span className="muted">{r.norm}</span>
            </div>
          ))}
        </div>
        <p className="note muted">«Посл. 7 дн.»: стрелка — изменение к остальной части периода.</p>
      </Card>

      {weights.length > 0 && (
        <Card title="Вес" color="ring2">
          <div className="report-table" role="table">
            <div className="rt-h rt-2" role="row"><span>Дата</span><span>Вес, кг</span></div>
            {weights.slice(-8).map((c) => (
              <div key={c.day} className="rt-r rt-2" role="row">
                <span>{fmtDay(c.day)}</span><span>{num(c.weight_kg, 1)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
