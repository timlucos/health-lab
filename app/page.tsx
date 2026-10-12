"use client";

import Link from "next/link";
import { ActivityRings, Spark } from "@/components/charts";
import { PasswordCard } from "@/components/Shell";
import { Card, Delta, ErrorCard, Header, Loading } from "@/components/ui";
import { fmtDay, fmtTime, fmtWeekday, hm, lastWith, localToday, num, useSummary, type Day } from "@/lib/data";
import { acwrState, dayInsight, norm, readinessColor } from "@/lib/insights";

type Mini = { key: keyof Day; title: string; color: string; unit: string; digits?: number; good: "up" | "down" | "none"; kind?: "bar" | "line"; sign?: boolean };

const ZONE: Record<string, string> = { ok: "Зелёная зона", warn: "Жёлтая зона", bad: "Красная зона", muted: "Мало данных" };
const SLEEP_GOAL = 8 * 60; // минут сна в сутки
const AZM_GOAL = 22; // ≈150 минут в зонах в неделю, норма ВОЗ

const MINIS: Mini[] = [
  { key: "steps", title: "Шаги", color: "move", unit: "", good: "up", kind: "bar" },
  { key: "azm", title: "Мин. в зонах", color: "move", unit: "мин", good: "up", kind: "bar" },
  { key: "skin_temp_delta_c", title: "Темп. кожи", color: "temp", unit: "°C", digits: 2, good: "none", sign: true },
  { key: "spo2_avg", title: "SpO₂ ночью", color: "air", unit: "%", digits: 0, good: "up" },
  { key: "resp_rate", title: "Дыхание", color: "air", unit: "вд/мин", digits: 1, good: "none" },
  { key: "active_kcal", title: "Активные ккал", color: "temp", unit: "ккал", good: "up", kind: "bar" },
];

export default function Today() {
  const { data, error, loading, reload } = useSummary(60);
  const today = localToday(data?.tz);

  if (error) return <ErrorCard error={error} onRetry={reload} />;
  if (loading || !data)
    return (
      <>
        <Header eyebrow={fmtWeekday(today) + ", " + fmtDay(today)} title="Сегодня" />
        <Loading n={4} />
      </>
    );

  const days = data.days;
  const tz = data.tz;
  const d = days[days.length - 1];
  const load = lastWith(data.load, (l) => l.readiness);
  const loadToday = data.load[data.load.length - 1];
  const insight = dayInsight(days, load);
  const r = load?.readiness != null ? Math.round(load.readiness) : null;
  const last7 = days.slice(-7);
  const sleepDay = lastWith(days, (x) => x.sleep_min);
  const sleepNorm = sleepDay ? norm(days, "sleep_min", days.indexOf(sleepDay)) : null;
  const s = hm(sleepDay?.sleep_min);
  const acwr = loadToday?.acwr ?? load?.acwr ?? null;
  const st = acwrState(acwr);
  const hrvRow = lastWith(days, (x) => x.hrv_ms);
  const rhrRow = lastWith(days, (x) => x.resting_hr);
  const hrvNorm = hrvRow ? norm(days, "hrv_ms", days.indexOf(hrvRow)) : null;
  const rhrNorm = rhrRow ? norm(days, "resting_hr", days.indexOf(rhrRow)) : null;

  return (
    <>
      <Header eyebrow={fmtWeekday(today) + ", " + fmtDay(today)} title="Сегодня" />
      <PasswordCard onlyIfMissing />

      <Card>
        <div className="rings-hero">
          <ActivityRings
            rings={[
              { value: r != null ? r / 100 : null, color: "var(--ring1)", label: "Готовность" },
              { value: sleepDay?.sleep_min != null ? sleepDay.sleep_min / SLEEP_GOAL : null, color: "var(--ring2)", label: "Сон" },
              { value: d?.azm != null ? d.azm / AZM_GOAL : null, color: "var(--ring3)", label: "Минуты в зонах" },
            ]}
          />
          <div className="ring-legend">
            <div>
              <div className="k" style={{ color: "var(--ring1)" }}>Готовность</div>
              <div className="v" style={{ color: "var(--ring1)" }}>{r ?? "—"}<small>/100</small></div>
            </div>
            <div>
              <div className="k" style={{ color: "var(--ring2)" }}>Сон</div>
              <div className="v" style={{ color: "var(--ring2)" }}>{s ? `${s.h}:${String(s.m).padStart(2, "0")}` : "—"}<small>/8 ч</small></div>
            </div>
            <div>
              <div className="k" style={{ color: "var(--ring3)" }}>В зонах</div>
              <div className="v" style={{ color: "var(--ring3)" }}>{num(d?.azm)}<small>/{AZM_GOAL} мин</small></div>
            </div>
          </div>
        </div>
        <span className="state" style={{ color: `var(--${readinessColor(r)})` }}>{ZONE[readinessColor(r)]}</span>
        <div className="coach">
          <b>{insight.head}</b> {insight.body}
        </div>
        <div className="stats">
          <div>
            <span className="k">ВСР</span>
            <span className="v">{num(lastWith(days, (x) => x.hrv_ms)?.hrv_ms)}<small className="muted small"> мс</small></span>
            <Delta value={lastWith(days, (x) => x.hrv_ms)?.hrv_ms} base={hrvNorm} good="up" />
          </div>
          <div>
            <span className="k">Пульс покоя</span>
            <span className="v">{num(lastWith(days, (x) => x.resting_hr)?.resting_hr)}<small className="muted small"> уд</small></span>
            <Delta value={lastWith(days, (x) => x.resting_hr)?.resting_hr} base={rhrNorm} good="down" />
          </div>
          <Link href="/load">
            <span className="k">Нагрузка</span>
            <span className="v" style={{ color: `var(--${st.color})` }}>{num(acwr, 2)}</span>
            <span className="delta" style={{ color: `var(--${st.color})` }}>{st.label.toLowerCase()}</span>
          </Link>
        </div>
      </Card>

      <Card title="Сон" color="sleep" href={`/sleep?d=${sleepDay?.day ?? ""}`} right={<span className="chev">{sleepDay?.sleep_end ? fmtTime(sleepDay.sleep_end, tz) : ""}</span>}>
        <div className="row-between" style={{ alignItems: "end" }}>
          <div className="val">
            {s ? (
              <>
                {s.h}
                <small>ч</small> {String(s.m).padStart(2, "0")}
                <small>мин</small>
              </>
            ) : (
              "—"
            )}
          </div>
          <div style={{ width: 120 }}>
            <Spark values={last7.map((x) => x.sleep_min)} color="var(--sleep)" kind="bar" height={36} />
          </div>
        </div>
        <div className="note">
          Глубокий {num(sleepDay?.sleep_deep_min)} мин · REM {num(sleepDay?.sleep_rem_min)} мин · <Delta value={sleepDay?.sleep_min} base={sleepNorm} unit=" мин" good="up" />
        </div>
      </Card>

      <div className="grid2 grid3">
        {MINIS.map((m) => {
          const row = lastWith(days, (x) => x[m.key]);
          const v = row?.[m.key] as number | null | undefined;
          const base = row ? norm(days, m.key, days.indexOf(row)) : null;
          return (
            <Card key={m.key} title={m.title} color={m.color} href={`/data?m=${m.key}`} right={<span />}>
              <div className="val m">
                {m.sign && v != null && v > 0 ? "+" : ""}
                {num(v, m.digits ?? 0)}
                {m.unit && <small>{m.unit}</small>}
              </div>
              <Spark values={last7.map((x) => x[m.key] as number | null)} color={`var(--${m.color})`} kind={m.kind ?? "line"} height={28} />
              <Delta value={v} base={base} digits={m.digits ?? 0} good={m.good} />
            </Card>
          );
        })}
      </div>

      <p className="note" style={{ textAlign: "center" }}>
        Данные Google Health{data.sync ? `, обновлено в ${fmtTime(data.sync, tz)} ${fmtDay(new Date(data.sync).toISOString().slice(0, 10))}` : ""}. День {d ? fmtDay(d.day) : "—"}.
      </p>
    </>
  );
}
