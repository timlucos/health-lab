"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HrLine, Trend } from "@/components/charts";
import { Card, ErrorCard, Header, Loading } from "@/components/ui";
import { addDays, fmtDay, fmtTime, fmtWeekday, hmText, localToday, minutesOfDay, num, useDay } from "@/lib/data";

const ACT: Record<string, string> = { WALKING: "Ходьба", RUNNING: "Бег", CARDIO_WORKOUT: "Кардио", STRENGTH_TRAINING: "Силовая", CYCLING: "Велосипед", SWIMMING: "Плавание" };

export default function DayPage() {
  return (
    <Suspense fallback={<Loading />}>
      <DayView />
    </Suspense>
  );
}

function DayView() {
  const params = useSearchParams();
  const router = useRouter();
  const today = localToday();
  const date = params.get("d") || today;
  const { data, error, reload } = useDay(date);
  const go = (n: number) => router.replace(`/day?d=${addDays(date, n)}`);
  const tz = "Etc/GMT-3";
  const s = data?.summary;
  const hours = Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, "0")}`);

  return (
    <>
      <Header eyebrow={fmtWeekday(date)} title={fmtDay(date)} />
      <div className="daynav">
        <button onClick={() => go(-1)} aria-label="Предыдущий день">‹</button>
        <b>День</b>
        <button onClick={() => go(1)} disabled={date >= today} aria-label="Следующий день">›</button>
      </div>
      {error ? (
        <ErrorCard error={error} onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <div className="grid2 grid4">
            <Card title="Шаги" color="move"><div className="val m">{num(s?.steps)}</div></Card>
            <Card title="Пульс покоя" color="heart"><div className="val m">{num(s?.resting_hr)}<small>уд/мин</small></div></Card>
            <Card title="Сон" color="sleep"><div className="val m" style={{ fontSize: 20 }}>{hmText(s?.sleep_min)}</div></Card>
            <Card title="TRIMP" color="load"><div className="val m">{num(s?.trimp)}</div></Card>
          </div>
          <Card title="Пульс за день" color="heart">
            <HrLine hr={data.hr} tz={tz} restingHr={s?.resting_hr} height={180} />
          </Card>
          <Card title="Шаги по часам" color="move">
            {(() => {
              const byHour = new Map(data.steps.map(([t, n]) => [Math.floor(minutesOfDay(t, tz) / 60), n]));
              const vals = hours.map((_, h) => byHour.get(h) ?? 0);
              return (
                <Trend
                  days={hours.map(() => date)}
                  height={130}
                  labels={hours.map((_, h) => `${String(h).padStart(2, "0")}:00`)}
                  series={[{ key: "s", values: vals, color: "var(--move)", kind: "bar" }]}
                  readout={(i) => (
                    <div>
                      <div className="muted small">{i == null ? "За день" : `${String(i).padStart(2, "0")}:00–${String(i + 1).padStart(2, "0")}:00`}</div>
                      <div className="val">{num(i == null ? s?.steps : vals[i])}</div>
                    </div>
                  )}
                />
              );
            })()}
          </Card>
          <Card title="Тренировки" color="move">
            {data.workouts.length ? (
              <div className="list">
                {data.workouts.map((w) => (
                  <div className="li" key={w.start_ts}>
                    <div>
                      <div className="n">{ACT[w.activity] ?? w.activity}</div>
                      <div className="muted small">
                        {fmtTime(w.start_ts, tz)} · {Math.round(w.duration_s / 60)} мин{w.avg_hr ? ` · пульс ${num(w.avg_hr)}` : ""}
                        {w.distance_m ? ` · ${num(w.distance_m / 1000, 2)} км` : ""}
                      </div>
                    </div>
                    <div className="val m" style={{ fontSize: 18 }}>{num(w.calories)}<small>ккал</small></div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="note">Тренировок не записано.</p>
            )}
          </Card>
        </>
      )}
    </>
  );
}
