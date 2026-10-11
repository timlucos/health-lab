"use client";

import { useState } from "react";
import { Trend } from "@/components/charts";
import { Card, ErrorCard, Header, Loading, SpanSeg, spanDays, type SpanKey } from "@/components/ui";
import { fmtDayShort, lastWith, mean, num, useSummary } from "@/lib/data";
import { acwrState, readinessColor } from "@/lib/insights";

export default function LoadPage() {
  const [span, setSpan] = useState<SpanKey>("m");
  const { data, error, reload } = useSummary(Math.max(60, spanDays(span)));
  if (error) return <ErrorCard error={error} onRetry={reload} />;
  if (!data)
    return (
      <>
        <Header eyebrow="тренированность" title="Нагрузка" />
        <Loading />
      </>
    );

  const n = spanDays(span);
  const load = data.load.slice(-n);
  const days = data.days.slice(-n);
  const ld = load.map((l) => l.day);
  const dd = days.map((d) => d.day);
  const last = lastWith(data.load, (l) => l.acute);
  const st = acwrState(last?.acwr);
  const lastR = lastWith(data.load, (l) => l.readiness);
  const minR = load.filter((l) => l.readiness != null).reduce<(typeof load)[number] | null>((a, b) => (!a || b.readiness! < a.readiness! ? b : a), null);
  const zones = (k: "hr_zone_light_min" | "hr_zone_moderate_min" | "hr_zone_vigorous_min" | "hr_zone_peak_min") => days.map((d) => d[k]);
  const zoneSum = days.map((d) => (d.hr_zone_light_min ?? 0) + (d.hr_zone_moderate_min ?? 0) + (d.hr_zone_vigorous_min ?? 0) + (d.hr_zone_peak_min ?? 0));

  return (
    <>
      <Header eyebrow="тренированность" title="Нагрузка" />
      <SpanSeg value={span} onChange={setSpan} />

      <Card title="Нагрузка по пульсу (TRIMP)" color="load" right={<span className="pill" style={{ color: `var(--${st.color})` }}>{st.label}</span>}>
        <Trend
          days={ld}
          series={[
            { key: "trimp", values: load.map((l) => l.trimp), color: "var(--load)", kind: "bar", opacity: 0.45 },
            { key: "chronic", values: load.map((l) => l.chronic), color: "var(--muted)", kind: "dash" },
            { key: "acute", values: load.map((l) => l.acute), color: "var(--load)", kind: "line" },
          ]}
          readout={(i) => {
            const l = i == null ? last : load[i];
            return (
              <div>
                <div className="muted small">{i == null ? "Средняя за 7 дней" : fmtDayShort(ld[i])}</div>
                <div className="val">
                  {num(i == null ? l?.acute : l?.trimp)}
                  <small>{i == null ? "в день" : "за день"}</small>
                </div>
                {l && <div className="muted small">7 дн {num(l.acute)} · 28 дн {num(l.chronic)}</div>}
              </div>
            );
          }}
        />
        <div className="legend">
          <span><i style={{ background: "var(--load)", opacity: 0.45 }} />за день</span>
          <span><i style={{ background: "var(--load)" }} />средняя за 7 дн</span>
          <span><i style={{ background: "var(--muted)" }} />за 28 дн</span>
        </div>
        <div className="note">TRIMP учитывает время и интенсивность по пульсу: минута в высокой зоне весит больше, чем в низкой.</div>
      </Card>

      <Card title="Неделя к месяцу (ACWR)" color="load">
        <Trend
          days={ld}
          height={150}
          yMin={0.4}
          yMax={1.8}
          band={{ lo: 0.8, hi: 1.3, label: "безопасная зона 0,8–1,3" }}
          series={[{ key: "acwr", values: load.map((l) => l.acwr), color: "var(--load)", kind: "line" }]}
          readout={(i) => {
            const v = i == null ? last?.acwr : load[i].acwr;
            const s = acwrState(v);
            return (
              <div className="row-between" style={{ alignItems: "end" }}>
                <div>
                  <div className="muted small">{i == null ? "Сейчас" : fmtDayShort(ld[i])}</div>
                  <div className="val">{num(v, 2)}</div>
                </div>
                <span className="pill" style={{ color: `var(--${s.color})` }}>{s.label}</span>
              </div>
            );
          }}
        />
        <div className="note">Выше 1,3 нагрузка растёт быстрее, чем организм успевает адаптироваться, и риск травмы выше. Ниже 0,8 форма постепенно теряется.</div>
      </Card>

      <Card title="Готовность по дням" color="move">
        <Trend
          days={ld}
          height={150}
          yMin={30}
          yMax={100}
          series={[{ key: "r", values: load.map((l) => l.readiness), color: "var(--ok)", kind: "bar" }]}
          barColor={(v) => `var(--${readinessColor(v)})`}
          readout={(i) => {
            const v = i == null ? lastR?.readiness : load[i].readiness;
            return (
              <div>
                <div className="muted small">{i == null ? "Последняя" : fmtDayShort(ld[i])}</div>
                <div className="val">{num(v)}<small>из 100</small></div>
              </div>
            );
          }}
        />
        <div className="note">
          Готовность считается по HRV, пульсу покоя, сну, температуре и дыханию против вашей нормы за 30 дней.
          {minR && ` Самая низкая за период: ${num(minR.readiness)} (${fmtDayShort(minR.day)}).`}
        </div>
      </Card>

      <Card title="Время в пульсовых зонах" color="heart">
        <Trend
          days={dd}
          stack={[
            { key: "l", label: "Жиросжигание", color: "var(--temp)", opacity: 0.55, values: zones("hr_zone_light_min") },
            { key: "m", label: "Аэробная", color: "var(--temp)", values: zones("hr_zone_moderate_min") },
            { key: "v", label: "Анаэробная", color: "var(--heart)", values: zones("hr_zone_vigorous_min") },
            { key: "p", label: "Пиковая", color: "var(--load)", values: zones("hr_zone_peak_min") },
          ]}
          readout={(i) =>
            i == null ? (
              <div>
                <div className="muted small">В среднем за день</div>
                <div className="val">{num(mean(zoneSum))}<small>мин</small></div>
              </div>
            ) : (
              <div>
                <div className="muted small">{fmtDayShort(dd[i])}</div>
                <div className="val">{num(zoneSum[i])}<small>мин</small></div>
                <div className="muted small">
                  {num(days[i].hr_zone_light_min)} · {num(days[i].hr_zone_moderate_min)} · {num(days[i].hr_zone_vigorous_min)} · {num(days[i].hr_zone_peak_min)}
                </div>
              </div>
            )
          }
        />
        <div className="legend">
          <span><i style={{ background: "var(--temp)", opacity: 0.55 }} />лёгкая</span>
          <span><i style={{ background: "var(--temp)" }} />аэробная</span>
          <span><i style={{ background: "var(--heart)" }} />анаэробная</span>
          <span><i style={{ background: "var(--load)" }} />пиковая</span>
        </div>
      </Card>
    </>
  );
}
