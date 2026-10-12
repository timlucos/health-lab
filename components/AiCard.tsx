"use client";

import Link from "next/link";
import { useState } from "react";
import { Md } from "./Md";
import { Card } from "./ui";
import { AiError, askCoach, useAiReports } from "@/lib/data";

/** Разбор от ИИ-тренера: последний сохранённый ответ и кнопка «разобрать заново». */
export function AiCard({ kind, day, title, cta }: { kind: "workout" | "weekly"; day: string; title: string; cta: string }) {
  const reports = useAiReports(kind, 20);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<AiError | null>(null);
  const last = reports.data?.filter((r) => (kind === "weekly" ? true : r.day === day)).at(-1);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      await askCoach({ kind, day });
      reports.reload();
    } catch (e) {
      setErr(e instanceof AiError ? e : new AiError("other", String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={title} color="load">
      {last ? <Md text={last.answer} /> : !busy && <p className="note">Тренер посмотрит подходы, веса, самочувствие и данные часов и скажет, что подтянуть.</p>}
      {busy && <p className="note">Тренер думает… обычно 10–30 секунд.</p>}
      {err && (
        <p className="note" style={{ color: err.code === "no_key" ? "var(--warn)" : "var(--bad)" }}>
          {err.message} {err.code === "no_key" && <Link href="/coach/ai" className="link">Как подключить</Link>}
        </p>
      )}
      <button className={"btn" + (last ? " ghost" : "")} onClick={run} disabled={busy}>
        {busy ? "Разбираю…" : last ? "Разобрать заново" : cta}
      </button>
      {last?.model && <span className="note">Модель: {last.model}</span>}
    </Card>
  );
}
