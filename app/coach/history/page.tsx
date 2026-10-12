"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, ErrorCard, Header, Loading } from "@/components/ui";
import { fmtDay, fmtWeekday, num, usePlan, useReview, useWorkouts, type PlanDay } from "@/lib/data";

export default function HistoryPage() {
  return (
    <Suspense fallback={<Loading />}>
      <History />
    </Suspense>
  );
}

const FEEL: Record<string, string> = { better: "сильнее, чем раньше", same: "как обычно", worse: "слабее" };

function History() {
  const d = useSearchParams().get("d");
  return d ? <Day d={d} /> : <List />;
}

function List() {
  const w = useWorkouts(120);
  if (w.error) return <ErrorCard error={w.error} onRetry={w.reload} />;
  const rows = (w.data ?? []).filter((x) => x.sets > 0 || x.status === "done");
  return (
    <>
      <Header eyebrow="тренер" title="История">
        <Link href="/coach" className="muted small">‹ Тренер</Link>
      </Header>
      {!w.data ? <Loading n={3} /> : rows.length === 0 ? (
        <Card><p className="note">Пока пусто. После первой тренировки здесь будут все подходы и веса по дням.</p></Card>
      ) : (
        <Card>
          <div className="list">
            {rows.map((x) => (
              <Link key={x.id} href={`/coach/history?d=${x.day}`} className="li">
                <div>
                  <div className="n">{x.title}</div>
                  <div className="note">{fmtWeekday(x.day)}, {fmtDay(x.day)} · {x.sets} подх. · {Math.round(x.volume_kg).toLocaleString("ru-RU")} кг</div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

function Day({ d }: { d: string }) {
  const p = usePlan(d);
  const rv = useReview(d);
  if (p.error) return <ErrorCard error={p.error} onRetry={p.reload} />;
  if (!p.data) return <Loading n={3} />;
  const groups = byExercise(p.data);
  const vol = p.data.sets.reduce((s, x) => s + x.reps * (x.weight_kg ?? 0), 0);
  const r = rv.data;
  return (
    <>
      <Header eyebrow={`${fmtWeekday(d)}, ${fmtDay(d)}`} title={p.data.plan?.title ?? "Тренировка"}>
        <Link href="/coach/history" className="muted small">‹ История</Link>
      </Header>
      <div className="stats">
        <div><span className="k">Подходов</span><span className="v">{p.data.sets.length}</span></div>
        <div><span className="k">Объём</span><span className="v">{Math.round(vol).toLocaleString("ru-RU")}<small className="muted small"> кг</small></span></div>
        <div><span className="k">Готовность</span><span className="v">{num(p.data.plan?.readiness)}</span></div>
      </div>
      {groups.map((g) => (
        <Card key={g.id} title={g.name} color="ring1" href={`/coach/exercise?id=${encodeURIComponent(g.id)}`} right={<span />}>
          <div className="hist">
            {g.sets.map((s) => (
              <div key={s.id} className="hist-row">
                <span className="muted">Подход {s.set_no}</span>
                <span>{s.weight_kg != null ? `${num(s.weight_kg, 1)} кг × ${s.reps}` : s.reps > 1 ? `${s.reps} повт.` : "сделано"}</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
      {r && (
        <Card title="Самочувствие" color="ring2" href="/coach/review" right={<span />}>
          <div className="note">
            Энергия {r.energy ?? "—"}/5 · усталость {r.fatigue ?? "—"}/5 · сон {r.sleep_quality ?? "—"}/5
            {r.progress_feel ? ` · ${FEEL[r.progress_feel]}` : ""}
          </div>
          {r.pain && <div className="note" style={{ color: "var(--bad)" }}>Боль: {r.pain}</div>}
          {r.note && <div className="note">{r.note}</div>}
        </Card>
      )}
    </>
  );
}

function byExercise(day: PlanDay) {
  const order = day.plan?.plan.map((i) => i.exercise_id) ?? [];
  const ids = [...new Set([...order, ...day.sets.map((s) => s.exercise_id)])].filter((id) => day.sets.some((s) => s.exercise_id === id));
  return ids.map((id) => ({
    id,
    name: day.exercises[id]?.name_ru ?? day.exercises[id]?.name ?? id.replace(/_/g, " "),
    sets: day.sets.filter((s) => s.exercise_id === id).sort((a, b) => a.set_no - b.set_no),
  }));
}
