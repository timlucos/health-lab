"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HrLine, Hypnogram, NormBar, SleepSchedule, Trend } from "@/components/charts";
import { Card, ErrorCard, Header, Loading, SpanSeg, spanDays, type SpanKey } from "@/components/ui";
import { addDays, fmtDay, fmtDayShort, fmtTime, hm, hmText, lastWith, mean, num, useDay, useSummary } from "@/lib/data";
import { norm } from "@/lib/insights";

export default function SleepPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Sleep />
    </Suspense>
  );
}

function Sleep() {
  const params = useSearchParams();
  const router = useRouter();
  const [span, setSpan] = useState<SpanKey>("m");
  const sum = useSummary(Math.max(60, spanDays(span) + 31));
  const days = sum.data?.days ?? [];
  const tz = sum.data?.tz ?? "Etc/GMT-3";
  const latest = lastWith(days, (d) => d.sleep_min)?.day ?? null;
  const date = params.get("d") || latest;
  const day = useDay(date);
  const prev = useDay(date ? addDays(date, -1) : null);

  if (sum.error) return <ErrorCard error={sum.error} onRetry={sum.reload} />;
  if (!sum.data || !date) return (<><Header eyebrow="сон" title="Сон" /><Loading /></>);

  const go = (n: number) => router.replace(`/sleep?d=${addDays(date, n)}`);
  const idx = days.findIndex((d) => d.day === date);
  const row = idx >= 0 ? days[idx] : null;
  const main = day.data?.sleep.find((s) => s.main) ?? day.data?.sleep[day.data.sleep.length - 1];
  const t0 = main ? Date.parse(main.start) / 1000 : undefined;
  const t1 = main ? Date.parse(main.end) / 1000 : undefined;
  const hr = [...(prev.data?.hr ?? []), ...(day.data?.hr ?? [])];
  const s = hm(row?.sleep_min);
  const n = (k: Parameters<typeof norm>[1]) => (idx >= 0 ? norm(days, k, idx) : null);
  const naps = (day.data?.sleep.length ?? 0) - 1;

  const tail = days.slice(-spanDays(span));
  const tDays = tail.map((d) => d.day);
  const avgSleep = mean(tail.map((d) => d.sleep_min));

  return (
    <>
      <Header eyebrow="сон" title="Сон" />
      <div className="daynav">
        <button onClick={() => go(-1)} aria-label="Предыдущая ночь">
          ‹
        </button>
        <b>Ночь на {fmtDay(date)}</b>
        <button onClick={() => go(1)} disabled={!latest || date >= latest} aria-label="Следующая ночь">
          ›
        </button>
      </div>

      {day.error ? (
        <ErrorCard error={day.error} onRetry={day.reload} />
      ) : !day.data ? (
        <Loading n={2} />
      ) : !main ? (
        <Card title="Сна нет" color="sleep">
          <p className="note">За эту ночь браслет не записал сон.</p>
        </Card>
      ) : (
        <>
          <Card title="Время сна" color="sleep" right={<span className="muted small">{fmtTime(main.start, tz)} – {fmtTime(main.end, tz)}</span>}>
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
            <div className="note">
              {n("sleep_min") != null && <>Обычно {hmText(n("sleep_min"))}. </>}
              {row?.sleep_efficiency != null && <>Эффективность {num(row.sleep_efficiency)}%. </>}
              {row?.sleep_awake_min != null && <>Без сна в постели {num(row.sleep_awake_min)} мин.</>}
              {naps > 0 && <> Ещё дневной сон: {naps}.</>}
            </div>
            <Hypnogram stages={main.stages} tz={tz} />
            <div className="legend">
              <span><i style={{ background: "var(--sleep)" }} />глубокий</span>
              <span><i style={{ background: "var(--sleep)", opacity: 0.5 }} />лёгкий</span>
              <span><i style={{ background: "var(--air)" }} />быстрый (REM)</span>
              <span><i style={{ background: "var(--temp)" }} />бодрствование</span>
            </div>
          </Card>

          <Card title="Пульс во сне" color="heart">
            <HrLine hr={hr} tz={tz} from={t0} to={t1} restingHr={row?.resting_hr} />
            <div className="note">
              {row?.nonrem_hr != null && <>Средний пульс в фазе без REM {num(row.nonrem_hr)} уд/мин. </>}
              {row?.hrv_ms != null && <>ВСР за ночь {num(row.hrv_ms, 1)} мс, норма {num(n("hrv_ms"), 1)}.</>}
            </div>
          </Card>

          <Card title="Стадии против нормы" color="sleep">
            <NormBar label="Глубокий" value={row?.sleep_deep_min ?? null} norm={n("sleep_deep_min")} max={360} color="var(--sleep)" />
            <NormBar label="REM" value={row?.sleep_rem_min ?? null} norm={n("sleep_rem_min")} max={360} color="var(--air)" />
            <NormBar label="Лёгкий" value={row?.sleep_light_min ?? null} norm={n("sleep_light_min")} max={360} color="var(--sleep)" opacity={0.5} />
            <NormBar label="Бодрствование" value={row?.sleep_awake_min ?? null} norm={n("sleep_awake_min")} max={360} color="var(--temp)" />
            <div className="legend">
              <span><i style={{ background: "var(--ink)", opacity: 0.5 }} />ваша норма за 30 дней</span>
            </div>
          </Card>
        </>
      )}

      <h2 className="h2">Тренды</h2>
      <SpanSeg value={span} onChange={setSpan} />
      <Card title="Длительность и стадии" color="sleep">
        <Trend
          days={tDays}
          stack={[
            { key: "deep", label: "Глубокий", color: "var(--sleep)", values: tail.map((d) => d.sleep_deep_min) },
            { key: "rem", label: "REM", color: "var(--air)", values: tail.map((d) => d.sleep_rem_min) },
            { key: "light", label: "Лёгкий", color: "var(--sleep)", opacity: 0.45, values: tail.map((d) => d.sleep_light_min) },
            { key: "awake", label: "Бодрств.", color: "var(--temp)", values: tail.map((d) => d.sleep_awake_min) },
          ]}
          ref_={avgSleep != null ? { y: avgSleep, label: "среднее" } : undefined}
          readout={(i) =>
            i == null ? (
              <div>
                <div className="muted small">В среднем</div>
                <div className="val">{hmText(avgSleep)}</div>
              </div>
            ) : (
              <div>
                <div className="muted small">{fmtDayShort(tDays[i])}</div>
                <div className="val">{hmText(tail[i].sleep_min)}</div>
                <div className="muted small">
                  глуб. {num(tail[i].sleep_deep_min)} · REM {num(tail[i].sleep_rem_min)} · лёгк. {num(tail[i].sleep_light_min)}
                </div>
              </div>
            )
          }
        />
      </Card>
      <Card title="Режим" color="sleep">
        <SleepSchedule days={tDays} starts={tail.map((d) => d.sleep_start)} ends={tail.map((d) => d.sleep_end)} tz={tz} />
        <div className="note">Чем ровнее столбики, тем стабильнее режим. Стабильный отбой влияет на восстановление сильнее, чем лишний час сна.</div>
      </Card>
    </>
  );
}
