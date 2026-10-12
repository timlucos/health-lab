"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExerciseMotion } from "@/components/ExerciseMotion";
import { Card, ErrorCard, Header, Loading } from "@/components/ui";
import { fmtDay, localToday, mutate, num, usePlan, useSummary, type PlanDay, type SetRow } from "@/lib/data";
import { restText, suggestWeight } from "@/lib/planner";

export default function Workout() {
  const sum = useSummary(60);
  const today = localToday(sum.data?.tz);
  const day = usePlan(sum.data ? today : null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (sum.error || day.error) return <ErrorCard error={(sum.error ?? day.error)!} onRetry={day.reload} />;
  if (!day.data) return <Loading n={3} />;
  const p = day.data.plan;
  if (!p)
    return (
      <>
        <Header eyebrow="тренировка" title="Плана нет" />
        <Link href="/coach" className="btn" style={{ textAlign: "center" }}>Составить план</Link>
      </>
    );

  async function finish() {
    setBusy(true);
    try {
      await mutate("hl_plan_status", { plan_id: p!.id, st: "done" });
      router.push("/coach/review");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header eyebrow={`тренировка · ${fmtDay(today)}`} title={p.title}>
        <Link href="/coach" className="muted small">‹ Тренер</Link>
      </Header>
      {p.plan.map((it, i) => (
        <ExerciseBlock key={it.exercise_id} n={i + 1} item={it} day={day.data!} planId={p.id} date={today} onChange={day.reload} />
      ))}
      {p.status === "done" ? (
        <Link href="/coach/review" className="btn" style={{ textAlign: "center" }}>Итоги тренировки</Link>
      ) : (
        <button className="btn" onClick={finish} disabled={busy}>{busy ? "Сохраняю…" : "Завершить и подвести итоги"}</button>
      )}
    </>
  );
}

type Item = NonNullable<PlanDay["plan"]>["plan"][number];

function ExerciseBlock({ n, item, day, planId, date, onChange }: { n: number; item: Item; day: PlanDay; planId: number; date: string; onChange: () => void }) {
  const e = day.exercises[item.exercise_id];
  const last = day.last[item.exercise_id];
  const logged = day.sets.filter((s) => s.exercise_id === item.exercise_id);
  const cardio = !!item.minutes;
  const count = cardio ? 1 : item.sets;
  const sw = suggestWeight(item.reps, last);
  const name = e?.name_ru ?? e?.name ?? item.exercise_id;
  const doneAll = logged.length >= count;

  return (
    <Card title={`${n}. ${name}`} color={doneAll ? "ok" : "ring1"} right={<Link href={`/coach/exercise?id=${encodeURIComponent(item.exercise_id)}`} className="chev">техника</Link>}>
      <div className="wo-top">
        {e?.images?.length ? <ExerciseMotion images={e.images} alt={name} /> : <span />}
        <div className="note">
          <div>{cardio ? `${item.minutes} мин · ${item.reps}` : `${item.sets} × ${item.reps} · отдых ${restText(item.rest_s)}`}</div>
          {last?.weight_kg ? <div>Прошлый раз: {num(last.weight_kg, 1)} кг × {last.reps}</div> : null}
          {sw ? <div style={{ color: "var(--ok)" }}>Сегодня: {num(sw, 1)} кг</div> : null}
          {item.note && <div>{item.note}</div>}
        </div>
      </div>
      <div className="sets">
        {Array.from({ length: count }, (_, k) => (
          <SetRowEditor key={`${k}-${logged.find((s) => s.set_no === k + 1)?.id ?? "new"}`} no={k + 1} cardio={cardio} reps={item.reps} weight={sw} row={logged.find((s) => s.set_no === k + 1)} planId={planId} date={date} exId={item.exercise_id} onChange={onChange} />
        ))}
      </div>
    </Card>
  );
}

function SetRowEditor({ no, cardio, reps, weight, row, planId, date, exId, onChange }: { no: number; cardio: boolean; reps: string; weight: number | null; row?: SetRow; planId: number; date: string; exId: string; onChange: () => void }) {
  const lowReps = Number(reps.match(/\d+/)?.[0] ?? 10);
  const [w, setW] = useState(row?.weight_kg != null ? String(row.weight_kg) : weight != null ? String(weight) : "");
  const [r, setR] = useState(row ? String(row.reps) : String(lowReps));
  const [busy, setBusy] = useState(false);
  const done = !!row;

  async function save(on: boolean) {
    setBusy(true);
    try {
      const wk = w.trim() === "" ? null : Number(w.replace(",", "."));
      await mutate("hl_set_log", { plan_id: planId, d: date, ex_id: exId, set_no: no, reps: on ? (cardio ? 1 : Number(r) || 0) : 0, weight_kg: cardio ? null : wk, rpe: null });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  if (cardio)
    return (
      <button className={"set-check wide" + (done ? " on" : "")} onClick={() => save(!done)} disabled={busy} aria-pressed={done}>
        {done ? "✓ Сделано" : "Отметить как сделано"}
      </button>
    );
  return (
    <div className={"set-row" + (done ? " on" : "")}>
      <span className="set-no">{no}</span>
      <label>
        <input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} disabled={done || busy} aria-label={`Вес, подход ${no}`} placeholder="—" />
        <small>кг</small>
      </label>
      <label>
        <input inputMode="numeric" value={r} onChange={(e) => setR(e.target.value)} disabled={done || busy} aria-label={`Повторы, подход ${no}`} />
        <small>повт.</small>
      </label>
      <button className={"set-check" + (done ? " on" : "")} onClick={() => save(!done)} disabled={busy} aria-label={done ? `Отменить подход ${no}` : `Записать подход ${no}`}>
        ✓
      </button>
    </div>
  );
}
