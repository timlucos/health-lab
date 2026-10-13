"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AiCard } from "@/components/AiCard";
import { Card, ErrorCard, Header, Loading } from "@/components/ui";
import { fmtDay, localToday, mutate, usePlan, useReview, useSummary, type Review } from "@/lib/data";

// Самочувствие после тренировки: 1 — плохо/мало, 5 — отлично/много.
const SCALES: { key: keyof Review; label: string; lo: string; hi: string }[] = [
  { key: "energy", label: "Энергия на тренировке", lo: "без сил", hi: "полон сил" },
  { key: "fatigue", label: "Усталость сейчас", lo: "свежий", hi: "выжат" },
  { key: "soreness", label: "Мышцы болят после прошлой", lo: "нет", hi: "сильно" },
  { key: "sleep_quality", label: "Как спал прошлой ночью", lo: "плохо", hi: "отлично" },
  { key: "mood", label: "Настроение", lo: "плохое", hi: "отличное" },
];
const FEEL = [
  { key: "better", label: "Сильнее, чем раньше" },
  { key: "same", label: "Как обычно" },
  { key: "worse", label: "Слабее" },
] as const;

export default function ReviewPage() {
  const sum = useSummary(60);
  const today = localToday(sum.data?.tz);
  const plan = usePlan(sum.data ? today : null);
  const saved = useReview(sum.data ? today : null);
  const [r, setR] = useState<Partial<Review>>({});
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (saved.data) setR(saved.data);
  }, [saved.data]);

  const error = sum.error ?? plan.error ?? saved.error;
  if (error) return <ErrorCard error={error} onRetry={() => { sum.reload(); plan.reload(); saved.reload(); }} />;
  if (!sum.data || saved.loading) return <Loading n={3} />;

  const set = (k: keyof Review, v: unknown) => {
    setOk(false);
    setR((x) => ({ ...x, [k]: v }));
  };

  async function save() {
    setBusy(true);
    setErr("");
    try {
      await mutate("hl_review_save", { d: today, r: { ...r, plan_id: plan.data?.plan?.id ?? null } });
      setOk(true);
      saved.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const sets = plan.data?.sets.length ?? 0;
  const volume = Math.round((plan.data?.sets ?? []).reduce((s, x) => s + x.reps * (x.weight_kg ?? 0), 0));
  return (
    <>
      <Header eyebrow={`итоги · ${fmtDay(today)}`} title="Как прошло?">
        <Link href="/coach" className="muted small">‹ Тренер</Link>
      </Header>
      {plan.data?.plan && (
        <div className="stats">
          <div><span className="k">Тренировка</span><span className="v" style={{ fontSize: 15 }}>{plan.data.plan.title.split(":")[0]}</span></div>
          <div><span className="k">Подходов</span><span className="v">{sets}</span></div>
          <div><span className="k">Объём</span><span className="v">{volume.toLocaleString("ru-RU")}<small className="muted small"> кг</small></span></div>
        </div>
      )}
      <Card title="Самочувствие" color="ring2">
        {SCALES.map((s) => (
          <div key={s.key} className="scale">
            <div className="scale-l">{s.label}</div>
            <div className="scale-row" role="radiogroup" aria-label={s.label}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} role="radio" aria-checked={r[s.key] === n} className={"scale-b" + (r[s.key] === n ? " on" : "")} onClick={() => set(s.key, n)}>
                  {n}
                </button>
              ))}
            </div>
            <div className="scale-ends"><span>{s.lo}</span><span>{s.hi}</span></div>
          </div>
        ))}
      </Card>
      <Card title="Чувствуете прогресс?" color="ring1">
        <div className="chips" style={{ flexWrap: "wrap" }}>
          {FEEL.map((f) => (
            <button key={f.key} className={"chip" + (r.progress_feel === f.key ? " on" : "")} onClick={() => set("progress_feel", f.key)}>{f.label}</button>
          ))}
        </div>
      </Card>
      <Card title="Боль или дискомфорт" color="bad">
        <input className="field" placeholder="Например: тянет правое плечо в жиме" value={r.pain ?? ""} onChange={(e) => set("pain", e.target.value)} />
      </Card>
      <Card title="Заметка" color="air">
        <textarea className="field" rows={3} placeholder="Что получилось, что нет, что хочется поменять" value={r.note ?? ""} onChange={(e) => set("note", e.target.value)} />
      </Card>
      <button className="btn" onClick={save} disabled={busy}>{busy ? "Сохраняю…" : ok ? "✓ Сохранено" : "Сохранить итоги"}</button>
      {err && <p className="note" style={{ color: "var(--bad)" }}>Не сохранилось: {err}</p>}
      {(ok || saved.data) && <AiCard kind="workout" day={today} title="Разбор тренера" cta="Получить разбор от ИИ" />}
    </>
  );
}
