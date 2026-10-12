"use client";

import Link from "next/link";
import { useState } from "react";
import { Md } from "@/components/Md";
import { Card, Header } from "@/components/ui";
import { AiError, askCoach, localToday, useAiReports } from "@/lib/data";

const SECRETS = "https://supabase.com/dashboard/project/yfdaldpzbfyzoancmywn/functions/secrets";

const MODELS = [
  { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", note: "по умолчанию: лучше всех разбирает данные, понимает фото еды. Разбор ≈ 5–10 ₽." },
  { id: "openai/gpt-5.4-mini", name: "ChatGPT 5.4 mini", note: "дешевле в 2–3 раза, для ежедневных вопросов хватает." },
  { id: "openai/gpt-6-astra", name: "ChatGPT 6 Astra", note: "самая мощная у OpenAI, но дорогая: разбор ≈ 20–40 ₽." },
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
        <Link href="/coach" className="muted small">‹ Тренер</Link>
      </Header>

      <Card title="Спросить тренера" color="load">
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
        <textarea className="field" rows={2} placeholder="Ваш вопрос" value={q} onChange={(e) => setQ(e.target.value)} disabled={busy} />
        <button className="btn" onClick={send} disabled={busy || !q.trim()}>{busy ? "Отправляю…" : "Спросить"}</button>
        {err && <p className="note" style={{ color: err.code === "no_key" ? "var(--warn)" : "var(--bad)" }}>{err.message}{err.code === "no_key" && " Инструкция ниже."}</p>}
      </Card>

      <Card title="Как подключить ИИ" color="ring1">
        <p className="note">Работает через российский сервис ProxyAPI: оплата картой РФ, без VPN, доступ к Claude и ChatGPT по одному ключу. Ключ хранится только на сервере Supabase, в приложение и в чат он не попадает.</p>
        <ol className="steps">
          <li>Зарегистрируйтесь на <a className="link" href="https://console.proxyapi.ru" target="_blank" rel="noreferrer">console.proxyapi.ru</a> и подтвердите почту.</li>
          <li>Раздел <a className="link" href="https://console.proxyapi.ru/billing" target="_blank" rel="noreferrer">«Биллинг»</a>: пополните баланс картой, для начала хватит 300–500 ₽.</li>
          <li>Раздел <a className="link" href="https://console.proxyapi.ru/keys" target="_blank" rel="noreferrer">«Ключи API»</a>: создайте ключ и сразу скопируйте, он показывается один раз.</li>
          <li>Откройте <a className="link" href={SECRETS} target="_blank" rel="noreferrer">секреты Supabase</a>, нажмите «Add new secret» и добавьте:
            <ul className="steps">
              <li><b>AI_API_KEY</b> = ваш ключ (начинается с sk-)</li>
              <li><b>AI_BASE_URL</b> = https://api.proxyapi.ru/v1</li>
              <li><b>AI_MODEL</b> = одна из моделей ниже (можно не добавлять, тогда Claude Sonnet 5)</li>
            </ul>
          </li>
          <li>Сохраните и задайте вопрос выше. Если ответил, всё готово.</li>
        </ol>
      </Card>

      <Card title="Какую модель выбрать" color="ring2">
        <div className="list">
          {MODELS.map((m) => (
            <div key={m.id} className="li" style={{ display: "block" }}>
              <div className="n">{m.name}</div>
              <div className="note"><code>{m.id}</code> · {m.note}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Другие варианты" color="ring3">
        <ul className="steps">
          <li><b>VseGPT</b> (vsegpt.ru): тоже Claude и ChatGPT, оплата картой и СБП. AI_BASE_URL = https://api.vsegpt.ru/v1</li>
          <li><b>AITunnel</b> (aitunnel.ru): то же самое, AI_BASE_URL = https://api.aitunnel.ru/v1</li>
          <li><b>GigaChat</b> от Сбера: бесплатный лимит, но анализирует заметно слабее. Подключение отдельно, напишите в чат.</li>
          <li>Подписка ChatGPT Plus или Claude Pro, купленная на маркетплейсе, к приложению не подключается: нужен именно ключ API.</li>
        </ul>
      </Card>
    </>
  );
}
