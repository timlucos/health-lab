"use client";

import Link from "next/link";
import { useState } from "react";
import { Md } from "@/components/Md";
import { Card, Header } from "@/components/ui";
import { AiError, askCoach, localToday, useAiReports } from "@/lib/data";


const QUICK = [
  "Что улучшить на этой неделе?",
  "Сколько калорий и белка мне нужно?",
  "Почему могла упасть вариабельность?",
  "Составь план тренировок на неделю",
  "Как лучше принимать креатин?",
];

export default function AiPage() {
  const chat = useAiReports("chat", 30);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<AiError | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const items = chat.data ?? [];

  async function send() {
    const question = q.trim();
    if (!question) return;
    setBusy(true);
    setErr(null);
    setPending(question);
    setQ("");
    try {
      const history = items.slice(-4).flatMap((r) => [{ role: "user", content: r.question ?? "" }, { role: "assistant", content: r.answer }]);
      await askCoach({ kind: "chat", day: localToday(), question, history });
      chat.reload();
    } catch (e) {
      setErr(e instanceof AiError ? e : new AiError("other", String(e)));
      setQ(question);
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  return (
    <>
      <Header eyebrow="тренер" title="ИИ-тренер">
        <div className="row-between">
          <Link href="/coach" className="muted small">‹ Тренер</Link>
          <Link href="/coach/reports" className="link small">Все разборы ›</Link>
        </div>
      </Header>

      <Card title="Чат с тренером" color="load">
        <div className="chat">
          {items.length === 0 && !pending && <p className="note">Например: «Почему не растёт жим?», «Сколько белка мне нужно?», «Можно ли тренироваться при готовности 45?». Тренер видит ваши тренировки, замеры, сон и пульс.</p>}
          {items.map((r) => (
            <div key={r.id} className="chat">
              {r.question && <div className="bubble me">{r.question}</div>}
              <div className="bubble ai"><Md text={r.answer} /></div>
            </div>
          ))}
          {pending && <div className="bubble me">{pending}</div>}
          {busy && <div className="bubble ai note">Тренер думает…</div>}
        </div>
        <div className="chips" style={{ flexWrap: "wrap" }}>
          {QUICK.map((t) => (
            <button key={t} className="chip" onClick={() => setQ(t)} disabled={busy}>{t}</button>
          ))}
        </div>
        <textarea className="field" rows={2} placeholder="Ваш вопрос" value={q} onChange={(e) => setQ(e.target.value)} disabled={busy} />
        <button className="btn" onClick={send} disabled={busy || !q.trim()}>{busy ? "Отправляю…" : "Спросить"}</button>
        {err && <p className="note" style={{ color: err.code === "no_key" ? "var(--warn)" : "var(--bad)" }}>{err.message}</p>}
      </Card>

    </>
  );
}
