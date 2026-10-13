"use client";

import Link from "next/link";
import { AiCard } from "@/components/AiCard";
import { PushCard } from "@/components/PushCard";
import { BatteryCard } from "@/components/BatteryCard";
import { ActivityRings, Spark } from "@/components/charts";
import { PasswordCard } from "@/components/Shell";
import { Card, Delta, ErrorCard, Header, Loading } from "@/components/ui";
import { fmtDay, fmtTime, fmtWeekday, fmtWeekdayShort, hm, lastWith, localToday, num, useSummary, type Day, type Load } from "@/lib/data";
import { acwrState, dayInsight, norm, readinessColor } from "@/lib/insights";

type Mini = { key: keyof Day; title: string; color: string; unit: string; digits?: number; good: "up" | "down" | "none"; kind?: "bar" | "line"; sign?: boolean };

const ZONE: Record<string, string> = { ok: "Зелёная зона", warn: "Жёлтая зона", bad: "Красная зона", muted: "Мало данных" };
const SLEEP_GOAL = 8 * 60; // минут сна в сутки
const AZM_GOAL = 22; // ≈150 минут в зонах в неделю, норма ВОЗ

const MINIS: Mini[] = [
  { key: "steps", title: "Шаги", color: "move", unit: "", good: "up", kind: "bar" },
  { key: "azm", title: "Мин. в зонах", color: "move", unit: "мин", good: "up", kind: "bar" },
  { key: "skin_temp_delta_c", title: "Темп. кожи", color: "temp", unit: "°C", digits: 2, good: "none", sign: true },
  { key: "spo2_avg", title: "Кислород ночью", color: "air", unit: "%", digits: 0, good: "up" },
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
      <PushCard place="top" />
      <BatteryCard />

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
            <span className="k">Вариабельность</span>
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
            <span className="v" style={{ color: `var(--${st.color})` }}>{acwr != null ? Math.round(acwr * 100) : "—"}<small className="muted small">%</small></span>
            <span className="delta" style={{ color: `var(--${st.color})` }}>{st.label.toLowerCase()}</span>
          </Link>
        </div>
      </Card>

      <CardioWeek load={data.load} readiness={r} />

      <AiCard kind="daily" day={today} title="Тренер на сегодня" cta="Что делать сегодня?" color="ring1"
        hint="Короткий совет на день: тренироваться или восстанавливаться, что есть, во сколько лечь. По данным сна, пульса и нагрузки." />

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
          Глубокий {num(sleepDay?.sleep_deep_min)} мин · быстрый {num(sleepDay?.sleep_rem_min)} мин · <Delta value={sleepDay?.sleep_min} base={sleepNorm} unit=" мин" good="up" />
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

      <PushCard />

      <Glossary />

      <p className="note" style={{ textAlign: "center" }}>
        Данные Google Health{data.sync ? `, обновлено в ${fmtTime(data.sync, tz)} ${fmtDay(new Date(data.sync).toLocaleDateString("en-CA", { timeZone: tz }))}` : ""}. День {d ? fmtDay(d.day) : "—"}.
      </p>
    </>
  );
}

/**
 * Кардионагрузка за 7 дней, как в Google Health: баллы пульсовой нагрузки против недельной цели.
 * Цель = обычная неделя (средняя за 4 недели) +10% для роста выносливости; при низкой готовности −10%.
 */
function CardioWeek({ load, readiness }: { load: Load[]; readiness: number | null }) {
  const week = load.slice(-7);
  const done = week.reduce((a, l) => a + (l.trimp ?? 0), 0);
  const chronic = lastWith(load, (l) => l.chronic)?.chronic ?? null;
  if (!week.length || chronic == null || chronic <= 0) return null;
  const k = readiness != null && readiness < 50 ? 0.9 : 1.1;
  const goal = Math.max(1, Math.round(chronic * 7 * k));
  const pct = Math.round((done / goal) * 100);
  const left = goal - Math.round(done);
  const max = Math.max(...week.map((l) => l.trimp ?? 0), 1);
  return (
    <Card title="Кардионагрузка за неделю" color="ring3" href="/load" right={<span />}>
      <div className="rings-hero">
        <div className="ring-center">
          <ActivityRings rings={[{ value: done / goal, color: "var(--ring3)", label: "Кардионагрузка" }]} size={120} />
          <div className="ring-center-v"><b>{pct}%</b><small>цели</small></div>
        </div>
        <div className="ring-legend">
          <div>
            <div className="k" style={{ color: "var(--ring3)" }}>Сделано</div>
            <div className="v" style={{ color: "var(--ring3)" }}>{Math.round(done)}<small>/{goal} баллов</small></div>
          </div>
          <div className="note">
            {pct >= 100 ? `Цель недели выполнена${pct > 100 ? `, сверх цели +${pct - 100}%` : ""}.` : `До цели ${left} баллов: это примерно ${Math.max(10, Math.round(left / 1.5))} мин в среднем темпе.`}
          </div>
          <div className="week-bars" aria-hidden>
            {week.map((l) => (
              <div key={l.day} title={`${l.day}: ${Math.round(l.trimp ?? 0)}`}>
                <i style={{ height: `${Math.max(4, ((l.trimp ?? 0) / max) * 100)}%` }} />
                <span>{fmtWeekdayShort(l.day).slice(0, 2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

const TERMS: [string, string][] = [
  ["Готовность", "Насколько организм восстановился, от 0 до 100. Считается по вариабельности пульса, пульсу покоя, сну, температуре и дыханию против вашей нормы за 30 дней. 70 и выше: можно тренироваться в полную силу; 55–69: умеренно; ниже 55: лучше восстановиться."],
  ["Вариабельность пульса (ВСР)", "Насколько различаются промежутки между ударами сердца ночью, в миллисекундах. Выше вашей нормы: нервная система отдохнула. Ниже: усталость, стресс, алкоголь, болезнь или поздний ужин. Сравнивайте только с собой, у всех свои цифры."],
  ["Пульс покоя", "Самый спокойный пульс за сутки. Если он на 3–5 ударов выше обычного, организм не восстановился или начинается простуда. Со временем от тренировок выносливости он снижается."],
  ["Кардионагрузка", "Баллы по пульсу: чем выше пульс и дольше нагрузка, тем больше баллов. Недельная цель строится от вашей обычной недели +10%, чтобы выносливость росла без перегрузки."],
  ["Нагрузка недели к обычной", "Сколько вы нагрузились за 7 дней по сравнению со средней неделей за последний месяц. 80–130% — безопасно, выше 130% — растёт риск травмы и перетренированности."],
  ["Минуты в зонах", "Минуты с повышенным пульсом: жиросжигание считается за 1, кардио и пик за 2. Норма ВОЗ — 150 минут в неделю."],
  ["Кислород ночью", "Насыщение крови кислородом (SpO₂). Норма 95–100%. Если часто ниже 92%, стоит показать врачу."],
  ["Температура кожи", "Отклонение от вашей обычной температуры ночью. Рост на 0,5–1 °C и больше бывает перед болезнью или после тяжёлой тренировки."],
  ["Быстрый сон", "Фаза сновидений (REM), важна для памяти и нервной системы. Глубокий сон — для восстановления мышц."],
];

function Glossary() {
  return (
    <Card title="Что значат показатели" color="muted">
      <div className="gloss">
        {TERMS.map(([k, v]) => (
          <details key={k}>
            <summary>{k}</summary>
            <p className="note">{v}</p>
          </details>
        ))}
      </div>
    </Card>
  );
}
