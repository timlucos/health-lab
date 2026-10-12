"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, ErrorCard, Header, Loading } from "@/components/ui";
import { fmtDay, fmtWeekday, lastWith, localToday, mutate, useGoal, useGym, usePlan, useSummary, useWorkouts, type PlanDay } from "@/lib/data";
import { readinessColor } from "@/lib/insights";
import { buildPlan, FOCUS_LABELS, GYM_KINDS, restText, type Equip, type Focus } from "@/lib/planner";
import { warmupFor } from "@/lib/warmup";

// Цель из ответов владельца (11.10.2026), хранится в health.goals.
const GOAL = { title: "Мышечная масса и выносливость", horizon: "до 12 апреля 2027" };

const STATUS: Record<string, { label: string; color: string }> = {
  planned: { label: "Запланирована", color: "air" },
  in_progress: { label: "Идёт", color: "warn" },
  done: { label: "Готово", color: "ok" },
};

export default function Coach() {
  const sum = useSummary(60);
  const today = localToday(sum.data?.tz);
  const plan = usePlan(sum.data ? today : null);
  const gym = useGym();
  const hist = useWorkouts(10);
  const goal = useGoal();
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState<Focus | "auto">("auto");
  const [variant, setVariant] = useState(0);
  const [err, setErr] = useState("");

  const error = sum.error ?? plan.error ?? gym.error ?? hist.error;
  if (error) return <ErrorCard error={error} onRetry={() => { sum.reload(); plan.reload(); gym.reload(); hist.reload(); }} />;

  const load = sum.data ? lastWith(sum.data.load, (l) => l.readiness) : undefined;
  const r = load?.readiness ?? null;
  const acwr = sum.data?.load[sum.data.load.length - 1]?.acwr ?? null;
  const kinds = (gym.data?.kinds ?? []) as Equip[];

  async function compose(f: Focus | "auto" = focus, v = variant) {
    if (!hist.data) return;
    setBusy(true);
    setErr("");
    try {
      const p = buildPlan({ readiness: r, acwr, history: hist.data.filter((h) => h.day < today), equipment: kinds, focus: f, variant: v });
      await mutate("hl_plan_save", { d: today, title: p.title, focus: p.focus, readiness: r, acwr, plan: p.items, rationale: p.rationale });
      plan.reload();
      hist.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const ready = sum.data && plan.data && hist.data && gym.data;
  return (
    <>
      <Header eyebrow={`${fmtWeekday(today)}, ${fmtDay(today)}`} title="Тренер" />
      {!ready ? (
        <Loading n={2} />
      ) : plan.data!.plan ? (
        <PlanCard
          day={plan.data!}
          busy={busy}
          focus={focus}
          onFocus={(f) => { setFocus(f); setVariant(0); compose(f, 0); }}
          onRebuild={() => { const v = variant + 1; setVariant(v); compose(focus, v); }}
        />
      ) : (
        <Card title="План на сегодня" color="ring1">
          <p className="coach">
            {r != null ? <>Готовность <b style={{ color: `var(--${readinessColor(r)})` }}>{Math.round(r)}</b>. </> : null}
            Тренер соберёт тренировку по очереди «жим, тяга, ноги, выносливость», вашей готовности и снарядам зала.
          </p>
          <FocusChips value={focus} onChange={setFocus} disabled={busy} />
          <button className="btn" onClick={() => compose()} disabled={busy}>{busy ? "Собираю…" : "Составить план"}</button>
          {err && <p className="note" style={{ color: "var(--bad)" }}>Не получилось сохранить план: {err}</p>}
        </Card>
      )}

      <Card title="Прогресс" color="ring2" href="/coach/progress">
        <div className="note">Вес и замеры раз в неделю, рост рабочих весов, объём по неделям и недельный разбор от ИИ-тренера.</div>
      </Card>

      <Card title="ИИ-тренер" color="load" href="/coach/ai">
        <div className="note">Задайте любой вопрос: тренер видит тренировки, замеры, сон и пульс.</div>
      </Card>

      <Card title="Разборы" color="ring2" href="/coach/reports">
        <div className="note">Все прошлые разборы и ответы ИИ: когда, что сказал, какая модель и сколько стоило.</div>
      </Card>

      <Card title="Мой зал" color="ring3" href="/coach/gym">
        <div className="note">
          {kinds.length
            ? GYM_KINDS.filter((k) => kinds.includes(k.key)).map((k) => k.label).join(", ")
            : "Снаряды не отмечены, поэтому план считает, что вы в DDX Fitness. Можно поменять."}
        </div>
      </Card>

      <Card title="Цель" color="ring2" href="/coach/goal">
        <div className="val m">{GOAL.title}</div>
        <div className="note">
          {goal.data?.details.target_weight_kg ? `Вес ${goal.data.details.start_weight_kg ?? "?"} → ${goal.data.details.target_weight_kg} кг · ` : "Укажите вес и цели, чтобы ИИ считал питание и темп · "}
          {GOAL.horizon}
        </div>
      </Card>

      {hist.data && hist.data.length > 0 && (
        <Card title="История тренировок" color="load" href="/coach/history">
          <div className="list">
            {hist.data.slice(0, 6).map((w) => (
              <Link className="li" key={w.id} href={`/coach/history?d=${w.day}`}>
                <div>
                  <div className="n">{w.title}</div>
                  <div className="note">{fmtWeekday(w.day)}, {fmtDay(w.day)} · {w.sets} подх. · {Math.round(w.volume_kg).toLocaleString("ru-RU")} кг</div>
                </div>
                <span className="state" style={{ color: `var(--${STATUS[w.status]?.color ?? "muted"})` }}>{STATUS[w.status]?.label ?? w.status}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Card title="Каталог упражнений" color="air" href="/coach/exercises">
        <div className="note">876 упражнений с анимацией техники: поиск по мышцам и снарядам.</div>
      </Card>
    </>
  );
}

function FocusChips({ value, onChange, disabled }: { value: Focus | "auto"; onChange: (f: Focus | "auto") => void; disabled?: boolean }) {
  return (
    <div className="chips" style={{ flexWrap: "wrap" }} role="radiogroup" aria-label="Какая тренировка">
      {FOCUS_LABELS.map((f) => (
        <button key={f.key} role="radio" aria-checked={value === f.key} className={"chip" + (value === f.key ? " on" : "")} onClick={() => onChange(f.key)} disabled={disabled}>
          {f.label}
        </button>
      ))}
    </div>
  );
}

function PlanCard({ day, onRebuild, onFocus, focus, busy }: { day: PlanDay; onRebuild: () => void; onFocus: (f: Focus | "auto") => void; focus: Focus | "auto"; busy: boolean }) {
  const wu = warmupFor(day.plan!.focus);
  const p = day.plan!;
  const total = p.plan.reduce((s, i) => s + (i.minutes ? 1 : i.sets), 0);
  const done = day.sets.length;
  const st = STATUS[p.status] ?? STATUS.planned;
  return (
    <Card title="План на сегодня" color="ring1" right={<span className="state" style={{ color: `var(--${st.color})` }}>{st.label}</span>}>
      <div className="val m">{p.title}</div>
      {p.rationale && <p className="note">{p.rationale}</p>}
      {wu && <p className="note"><b>Разминка 10 минут:</b> кардио, суставы, разминочные подходы. Подробно на экране тренировки.</p>}
      <div className="plan-list">
        {p.plan.map((it) => {
          const e = day.exercises[it.exercise_id];
          return (
            <Link key={it.exercise_id} href={`/coach/exercise?id=${encodeURIComponent(it.exercise_id)}`} className="plan-li">
              {e?.images?.[0] ? <img src={e.images[0]} alt="" loading="lazy" /> : <span className="ph" />}
              <div>
                <div className="n">{e?.name_ru ?? e?.name ?? it.exercise_id}</div>
                <div className="note">
                  {it.minutes ? `${it.minutes} мин · ${it.reps}` : `${it.sets} × ${it.reps} · отдых ${restText(it.rest_s)}`}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      {done > 0 && (
        <div className="progress" aria-label={`Сделано ${done} из ${total} подходов`}>
          <div style={{ width: `${Math.min(100, (done / total) * 100)}%` }} />
        </div>
      )}
      <Link href="/coach/workout" className="btn" style={{ textAlign: "center" }}>
        {p.status === "done" ? "Открыть тренировку" : done > 0 ? `Продолжить · ${done} из ${total}` : "Начать тренировку"}
      </Link>
      {(p.status === "done" || done > 0) && (
        <Link href="/coach/review" className="btn ghost" style={{ textAlign: "center" }}>{p.status === "done" ? "Итоги и разбор тренера" : "Подвести итоги"}</Link>
      )}
      {done === 0 && (
        <>
          <div className="note">Другая тренировка на сегодня:</div>
          <FocusChips value={focus} onChange={onFocus} disabled={busy} />
          <button className="btn ghost" onClick={onRebuild} disabled={busy}>{busy ? "Собираю…" : "Заменить упражнения"}</button>
        </>
      )}
    </Card>
  );
}
