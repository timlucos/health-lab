"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, ErrorCard, Header, Loading } from "@/components/ui";
import { mutate, useGym } from "@/lib/data";
import { DDX_GYM, GYM_KINDS } from "@/lib/planner";

export default function GymPage() {
  const { data, error, reload } = useGym();
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr] = useState("");
  if (error) return <ErrorCard error={error} onRetry={reload} />;

  async function toggle(k: string, on: boolean) {
    setPending(k);
    setErr("");
    try {
      await mutate("hl_gym_toggle", { k, on_: on });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

  async function preset() {
    setPending("ddx");
    setErr("");
    try {
      for (const k of GYM_KINDS) await mutate("hl_gym_toggle", { k: k.key, on_: DDX_GYM.includes(k.key) });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

  const kinds = data?.kinds ?? [];
  const isDdx = GYM_KINDS.every((k) => kinds.includes(k.key) === DDX_GYM.includes(k.key));
  return (
    <>
      <Header eyebrow="тренер" title="Мой зал">
        <Link href="/coach" className="muted small">‹ Тренер</Link>
      </Header>
      <p className="note">Отметьте, что есть в вашем зале. План будет брать упражнения только с этими снарядами. Упражнения с весом тела доступны всегда.</p>
      <Card title="DDX Fitness" color="ring1">
        <div className="note">Тренажёры Technogym и Matrix, свободные веса, блоки, гири, гиперэкстензия и кардио: дорожки, велотренажёры, эллипсы, гребля, лестница. Состав немного отличается по клубам.</div>
        <button className={"btn" + (isDdx ? " ghost" : "")} onClick={preset} disabled={pending != null || isDdx}>
          {isDdx ? "✓ Зал DDX выбран" : pending === "ddx" ? "Сохраняю…" : "Мой зал — DDX"}
        </button>
      </Card>
      {!data ? (
        <Loading n={2} />
      ) : (
        <div className="gym-grid">
          {GYM_KINDS.map((k) => {
            const on = kinds.includes(k.key);
            return (
              <button key={k.key} className={"gym-tile" + (on ? " on" : "")} aria-pressed={on} disabled={pending === k.key} onClick={() => toggle(k.key, !on)}>
                <span className="gym-check" aria-hidden>{on ? "✓" : ""}</span>
                <b>{k.label}</b>
                {k.hint && <span className="note">{k.hint}</span>}
              </button>
            );
          })}
        </div>
      )}
      {err && <p className="note" style={{ color: "var(--bad)" }}>Не сохранилось: {err}</p>}
      <Card title="Фото зала" color="ring3">
        <div className="note">Скоро: сфотографируете тренажёры, и ИИ сам отметит, что есть. Заработает после подключения ключа ИИ.</div>
      </Card>
    </>
  );
}
