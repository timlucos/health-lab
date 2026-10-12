"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ExerciseMotion } from "@/components/ExerciseMotion";
import { Card, ErrorCard, Header, Loading } from "@/components/ui";
import { EQUIPMENT, LEVELS, MUSCLES, useExercise } from "@/lib/data";

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
  if (error) return <ErrorCard error={error} onRetry={reload} />;
  if (!e) return <Loading n={2} />;
  const steps = e.instructions_ru?.length ? e.instructions_ru : e.instructions ?? [];
  const tags = [e.equipment && (EQUIPMENT[e.equipment] ?? e.equipment), e.mechanic === "compound" ? "базовое" : e.mechanic === "isolation" ? "изолирующее" : null, e.level && `уровень: ${LEVELS[e.level] ?? e.level}`].filter(Boolean);

  return (
    <>
      <Header eyebrow={e.name_ru ? e.name : "упражнение"} title={e.name_ru ?? e.name}>
        <Link href="/coach/exercises" className="muted small">‹ Упражнения</Link>
      </Header>
      <Card>
        <ExerciseMotion images={e.images} alt={e.name_ru ?? e.name} size="hero" />
        <div className="chips">
          {tags.map((t) => <span key={t as string} className="chip on" style={{ cursor: "default" }}>{t}</span>)}
        </div>
      </Card>
      <Card title="Мышцы" color="heart">
        <div><b>Основные:</b> {e.primary_muscles.map((m) => MUSCLES[m] ?? m).join(", ") || "—"}</div>
        {e.secondary_muscles.length > 0 && <div className="muted">Помогают: {e.secondary_muscles.map((m) => MUSCLES[m] ?? m).join(", ")}</div>}
      </Card>
      <Card title="Техника" color="air">
        {!e.instructions_ru?.length && steps.length > 0 && <p className="note">Описание пока на английском. Тренер переведёт его на этапе 3.</p>}
        <ol className="steps">
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      </Card>
    </>
  );
}
