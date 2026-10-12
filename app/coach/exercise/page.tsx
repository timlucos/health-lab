"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExerciseMotion } from "@/components/ExerciseMotion";
import { Card, ErrorCard, Header, Loading } from "@/components/ui";
import { EQUIPMENT, fmtDay, LEVELS, MUSCLES, num, useExercise, useExerciseHistory } from "@/lib/data";

export default function ExercisePage() {
  return (
    <Suspense fallback={<Loading />}>
      <ExerciseView />
    </Suspense>
  );
}

function ExerciseView() {
  const id = useSearchParams().get("id");
  const { data: e, error, reload } = useExercise(id);
  // Русская техника лежит статикой рядом с приложением: /ex-ru/<id>.json
  const [ru, setRu] = useState<string[] | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    fetch(`/ex-ru/${encodeURIComponent(id)}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && setRu(Array.isArray(j) ? j.filter(Boolean) : null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);
  // Разбор тренера (суставы, ошибки, рост мышц) есть для упражнений из плана.
  const [tip, setTip] = useState<Tip | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    loadTips().then((t) => live && setTip(t[id] ?? null)).catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);
  if (error) return <ErrorCard error={error} onRetry={reload} />;
  if (!e) return <Loading n={2} />;
  const ruSteps = e.instructions_ru?.length ? e.instructions_ru : ru?.length ? ru : null;
  const steps = ruSteps ?? e.instructions ?? [];
  const tags = [e.equipment && (EQUIPMENT[e.equipment] ?? e.equipment), e.mechanic === "compound" ? "базовое" : e.mechanic === "isolation" ? "изолирующее" : null, e.level && `уровень: ${LEVELS[e.level] ?? e.level}`].filter(Boolean);

  return (
    <>
      <Header eyebrow="упражнение" title={e.name_ru ?? e.name}>
        <Link href="/coach/exercises" className="muted small">‹ Упражнения</Link>
      </Header>
      <Card>
        <ExerciseMotion images={e.images} alt={e.name_ru ?? e.name} size="hero" />
        <div className="chips">
          {tags.map((t) => <span key={t as string} className="chip on" style={{ cursor: "default" }}>{t}</span>)}
        </div>
      </Card>
      <ExHistoryCard id={e.id} />
      <Card title="Мышцы" color="heart">
        <div><b>Основные:</b> {e.primary_muscles.map((m) => MUSCLES[m] ?? m).join(", ") || "—"}</div>
        {e.secondary_muscles.length > 0 && <div className="muted">Помогают: {e.secondary_muscles.map((m) => MUSCLES[m] ?? m).join(", ")}</div>}
      </Card>
      {tip && (
        <>
          <Card title="Суставы" color="temp">
            <p className="coach" style={{ margin: 0 }}>{tip.joints}</p>
          </Card>
          <Card title="Главное в технике" color="ok">
            <ul className="steps">{tip.cues.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </Card>
          <Card title="Частые ошибки" color="bad">
            <ul className="steps">{tip.mistakes.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </Card>
          <Card title="Для роста мышц" color="load">
            <p className="coach" style={{ margin: 0 }}>{tip.hypertrophy}</p>
            <p className="note" style={{ margin: 0 }}>{tip.safety}</p>
          </Card>
        </>
      )}
      <Card title="Пошагово" color="air">
        {!ruSteps && steps.length > 0 && <p className="note">Перевод загружается…</p>}
        <ol className="steps">
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      </Card>
    </>
  );
}

type Tip = { joints: string; cues: string[]; mistakes: string[]; hypertrophy: string; safety: string };
let tipsPromise: Promise<Record<string, Tip>> | null = null;
function loadTips() {
  tipsPromise ??= fetch("/ex-tips.json").then((r) => (r.ok ? r.json() : {}));
  return tipsPromise;
}

function ExHistoryCard({ id }: { id: string }) {
  const h = useExerciseHistory(id, 8);
  if (!h.data?.length) return null;
  const best = Math.max(...h.data.map((x) => x.e1rm ?? 0));
  return (
    <Card title="Мои подходы" color="ring1">
      <div className="hist">
        {h.data.map((x) => (
          <div key={x.day} className="hist-row">
            <span className="muted">{fmtDay(x.day)}</span>
            <span>{x.sets.map((s) => (s.kg != null ? `${num(s.kg, 1)}×${s.reps}` : `${s.reps}`)).join(" · ")}</span>
          </div>
        ))}
      </div>
      {best > 0 && <p className="note">Лучший расчётный максимум на 1 раз: {num(best, 1)} кг.</p>}
    </Card>
  );
}
