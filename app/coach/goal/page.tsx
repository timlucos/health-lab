"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, ErrorCard, Header, Loading } from "@/components/ui";
import { mutate, num, useGoal, type GoalDetails } from "@/lib/data";

type F = { key: keyof GoalDetails; label: string; num?: boolean; ph?: string; wide?: boolean };

const BODY: F[] = [
  { key: "age", label: "Возраст", num: true },
  { key: "height_cm", label: "Рост, см", num: true },
  { key: "start_weight_kg", label: "Вес на старте, кг", num: true },
  { key: "target_weight_kg", label: "Цель по весу, кг", num: true },
  { key: "creatine_g", label: "Креатин, г в день", num: true, ph: "5" },
  { key: "workouts_per_week", label: "Тренировок в неделю", num: true, ph: "4" },
  { key: "session_min", label: "Минут на тренировку", num: true, ph: "75" },
];
const TEXT: F[] = [
  { key: "priorities", label: "Что важнее всего нарастить", ph: "Например: грудь, плечи, руки" },
  { key: "cardio_goal", label: "Цель по выносливости", ph: "Например: 5 км бегом за 25 минут, 30 минут на эллипсе без остановки" },
  { key: "limits", label: "Травмы и ограничения", ph: "Например: побаливает поясница при становой" },
  { key: "nutrition", label: "Питание сейчас", ph: "Например: 3 раза в день, белка мало, сладкое по вечерам" },
];

export default function GoalPage() {
  const g = useGoal();
  const [v, setV] = useState<Record<string, string>>({});
  const [sex, setSex] = useState<"m" | "f" | undefined>();
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const d = g.data?.details;
    if (!d) return;
    setV(Object.fromEntries([...BODY, ...TEXT].map((f) => [f.key, d[f.key] != null ? String(d[f.key]) : ""])));
    setSex(d.sex);
  }, [g.data]);

  if (g.error) return <ErrorCard error={g.error} onRetry={g.reload} />;
  if (g.loading) return <Loading n={3} />;

  const set = (k: string, x: string) => {
    setOk(false);
    setV((o) => ({ ...o, [k]: x }));
  };

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const details: Record<string, unknown> = { sex: sex ?? null };
      for (const f of BODY) {
        const s = (v[f.key] ?? "").trim().replace(",", ".");
        details[f.key] = s === "" ? null : Number(s);
      }
      for (const f of TEXT) details[f.key] = (v[f.key] ?? "").trim() || null;
      await mutate("hl_goal_save", { r: { details } });
      setOk(true);
      g.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const w0 = Number(v.start_weight_kg), w1 = Number(v.target_weight_kg);
  const gain = w0 && w1 ? w1 - w0 : null;
  const weeks = g.data ? Math.round((Date.parse(g.data.end_day) - Date.now()) / 6048e5) : null;
  return (
    <>
      <Header eyebrow="тренер" title="Моя цель">
        <Link href="/coach" className="muted small">‹ Тренер</Link>
      </Header>
      <p className="note">ИИ-тренер учитывает эти данные в каждом разборе: считает калории и белок, темп набора и что подтянуть.</p>
      <Card title={g.data?.title ?? "Цель"} color="ring2">
        <div className="chips">
          {([["m", "Мужчина"], ["f", "Женщина"]] as const).map(([k, l]) => (
            <button key={k} className={"chip" + (sex === k ? " on" : "")} onClick={() => { setOk(false); setSex(k); }}>{l}</button>
          ))}
        </div>
        <div className="form2">
          {BODY.map((f) => (
            <label key={f.key}>
              {f.label}
              <input className="field" inputMode="decimal" placeholder={f.ph ?? "—"} value={v[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
            </label>
          ))}
        </div>
        {gain != null && weeks != null && weeks > 0 && (
          <p className="note">
            {gain > 0 ? "+" : ""}{num(gain, 1)} кг за {weeks} нед.: это {num(gain / weeks, 2)} кг в неделю.
            {gain / weeks > 0.5 ? " Быстрее 0,5 кг в неделю набирается заметно больше жира." : gain > 0 ? " Реалистичный темп для набора мышц." : ""}
          </p>
        )}
      </Card>
      <Card title="Подробности" color="ring1">
        {TEXT.map((f) => (
          <label key={f.key} className="stack-label">
            {f.label}
            <textarea className="field" rows={2} placeholder={f.ph} value={v[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
          </label>
        ))}
      </Card>
      <button className="btn" onClick={save} disabled={busy}>{busy ? "Сохраняю…" : ok ? "✓ Сохранено" : "Сохранить цель"}</button>
      {err && <p className="note" style={{ color: "var(--bad)" }}>Не сохранилось: {err}</p>}
    </>
  );
}
