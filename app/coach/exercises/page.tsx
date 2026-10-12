"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { ExerciseMotion } from "@/components/ExerciseMotion";
import { ErrorCard, Header, Loading } from "@/components/ui";
import { EQUIPMENT, MUSCLES, useExercises } from "@/lib/data";

export default function Exercises() {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equip, setEquip] = useState("");
  const dq = useDeferredValue(q.trim());
  const { data, error, loading, reload } = useExercises(dq, muscle, equip);

  return (
    <>
      <Header eyebrow="тренер" title="Упражнения">
        <Link href="/coach" className="muted small">‹ Тренер</Link>
      </Header>
      <input className="field" type="search" placeholder="Поиск: жим, присед, тяга…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск упражнения" />
      <div className="chips" role="group" aria-label="Мышцы">
        <button className={"chip" + (muscle === "" ? " on" : "")} onClick={() => setMuscle("")}>Все мышцы</button>
        {Object.entries(MUSCLES).map(([k, v]) => (
          <button key={k} className={"chip" + (muscle === k ? " on" : "")} onClick={() => setMuscle(muscle === k ? "" : k)}>{v}</button>
        ))}
      </div>
      <div className="chips" role="group" aria-label="Снаряд">
        <button className={"chip" + (equip === "" ? " on" : "")} onClick={() => setEquip("")}>Любой снаряд</button>
        {Object.entries(EQUIPMENT).map(([k, v]) => (
          <button key={k} className={"chip" + (equip === k ? " on" : "")} onClick={() => setEquip(equip === k ? "" : k)}>{v}</button>
        ))}
      </div>
      {error ? (
        <ErrorCard error={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loading n={2} />
      ) : !data?.length ? (
        <p className="note">Ничего не нашлось. Попробуйте другое слово или снимите фильтр.</p>
      ) : (
        <div className="ex-grid">
          {data.map((e) => (
            <Link key={e.id} href={`/coach/exercise?id=${encodeURIComponent(e.id)}`} className="card ex-card">
              <ExerciseMotion images={e.images} alt={e.name_ru ?? e.name} />
              <div className="n">{e.name_ru ?? e.name}</div>
              <div className="muted small">
                {e.primary_muscles.map((m) => MUSCLES[m] ?? m).join(", ")}
                {e.equipment ? ` · ${EQUIPMENT[e.equipment] ?? e.equipment}` : ""}
              </div>
            </Link>
          ))}
        </div>
      )}
      <p className="note">Картинки и описания: открытая база free-exercise-db.</p>
    </>
  );
}
