"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AiCard } from "@/components/AiCard";
import { Trend } from "@/components/charts";
import { Card, ErrorCard, Header, Loading } from "@/components/ui";
import { fmtDay, fmtDayShort, localToday, mutate, num, useProgress, useSummary, type Checkin } from "@/lib/data";

const FIELDS: { key: keyof Checkin; label: string; unit: string }[] = [
  { key: "weight_kg", label: "Вес", unit: "кг" },
  { key: "waist_cm", label: "Талия", unit: "см" },
  { key: "chest_cm", label: "Грудь", unit: "см" },
  { key: "arm_cm", label: "Бицепс", unit: "см" },
  { key: "hip_cm", label: "Ягодицы", unit: "см" },
  { key: "thigh_cm", label: "Бедро", unit: "см" },
  { key: "body_fat_pct", label: "Жир", unit: "%" },
];

export default function ProgressPage() {
  const sum = useSummary(60);
  const today = localToday(sum.data?.tz);
  const pr = useProgress(26);

  if (sum.error || pr.error) return <ErrorCard error={(sum.error ?? pr.error)!} onRetry={pr.reload} />;
  if (!sum.data || !pr.data) return <Loading n={3} />;
  const p = pr.data;
  return (
    <>
      <Header eyebrow="тренер" title="Прогресс">
        <Link href="/coach" className="muted small">‹ Тренер</Link>
      </Header>
      <CheckinForm today={today} checkins={p.checkins} onSaved={pr.reload} />
      <WeightCard checkins={p.checkins} />
      <VolumeCard weeks={p.weeks} />
      <LiftsCard lifts={p.lifts} names={p.names ?? {}} />
      <FeelCard reviews={p.reviews} />
      <AiCard kind="weekly" day={today} title="Недельный разбор тренера" cta="Получить недельный разбор" />
    </>
  );
}

function CheckinForm({ today, checkins, onSaved }: { today: string; checkins: Checkin[]; onSaved: () => void }) {
  const last = checkins.at(-1);
  const todays = last?.day === today ? last : undefined;
  const [v, setV] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!todays) return;
    setV(Object.fromEntries(FIELDS.map((f) => [f.key, todays[f.key] != null ? String(todays[f.key]) : ""])));
    setNote(todays.note ?? "");
  }, [todays]);

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const r: Record<string, unknown> = { note: note.trim() || null };
      for (const f of FIELDS) {
        const s = (v[f.key] ?? "").trim().replace(",", ".");
        r[f.key] = s === "" ? null : Number(s);
      }
      await mutate("hl_checkin_save", { d: today, r });
      setOk(true);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const days = last ? Math.round((Date.parse(today) - Date.parse(last.day)) / 864e5) : null;
  return (
    <Card title="Замеры недели" color="ring1">
      <p className="note">
        {days == null ? "Раз в неделю, утром натощак, после туалета. Достаточно веса, остальное по желанию." : days === 0 ? "Сегодняшние замеры сохранены, можно поправить." : `Последние замеры ${days} дн. назад${days >= 7 ? ", пора обновить." : "."}`}
      </p>
      <div className="form2">
        {FIELDS.map((f) => (
          <label key={f.key}>
            {f.label}, {f.unit}
            <input className="field" inputMode="decimal" placeholder={last?.[f.key] != null ? String(last[f.key]) : "—"} value={v[f.key] ?? ""} onChange={(e) => { setOk(false); setV((x) => ({ ...x, [f.key]: e.target.value })); }} />
          </label>
        ))}
      </div>
      <textarea className="field" rows={2} placeholder="Заметка: самочувствие, питание, сон" value={note} onChange={(e) => { setOk(false); setNote(e.target.value); }} />
      <button className="btn" onClick={save} disabled={busy}>{busy ? "Сохраняю…" : ok ? "✓ Сохранено" : "Сохранить замеры"}</button>
      {err && <p className="note" style={{ color: "var(--bad)" }}>Не сохранилось: {err}</p>}
    </Card>
  );
}

function WeightCard({ checkins }: { checkins: Checkin[] }) {
  const rows = checkins.filter((c) => c.weight_kg != null);
  if (rows.length < 2) return null;
  const first = rows[0], last = rows.at(-1)!;
  const d = last.weight_kg! - first.weight_kg!;
  const waist = checkins.filter((c) => c.waist_cm != null);
  const dw = waist.length >= 2 ? waist.at(-1)!.waist_cm! - waist[0].waist_cm! : null;
  return (
    <Card title="Вес" color="ring2">
      <Trend
        days={rows.map((r) => r.day)}
        labels={rows.map((r) => fmtDayShort(r.day))}
        series={[{ key: "w", values: rows.map((r) => r.weight_kg), color: "var(--ring2)", kind: "line" }]}
        height={150}
        readout={(i) => {
          const r = i == null ? last : rows[i];
          return (
            <div>
              <div className="muted small">{i == null ? `С ${fmtDay(first.day)}` : fmtDayShort(r.day)}</div>
              <div className="val">{num(r.weight_kg, 1)}<small>кг</small></div>
              {i == null && <div className="muted small">{d >= 0 ? "+" : ""}{num(d, 1)} кг{dw != null ? ` · талия ${dw >= 0 ? "+" : ""}${num(dw, 1)} см` : ""}</div>}
            </div>
          );
        }}
      />
      <p className="note">Для набора мышц хороший темп +0,25–0,5% веса в неделю. Если талия растёт быстрее, чем руки и грудь, стоит чуть убавить калории.</p>
    </Card>
  );
}

function VolumeCard({ weeks }: { weeks: { week: string; workouts: number; sets: number; volume_kg: number }[] }) {
  if (!weeks.length) return null;
  const last = weeks.at(-1)!;
  return (
    <Card title="Объём по неделям" color="load">
      <Trend
        days={weeks.map((w) => w.week)}
        labels={weeks.map((w) => fmtDayShort(w.week))}
        series={[{ key: "v", values: weeks.map((w) => w.volume_kg), color: "var(--load)", kind: "bar" }]}
        height={150}
        readout={(i) => {
          const w = i == null ? last : weeks[i];
          return (
            <div>
              <div className="muted small">Неделя с {fmtDayShort(w.week)}</div>
              <div className="val">{Math.round(w.volume_kg).toLocaleString("ru-RU")}<small>кг</small></div>
              <div className="muted small">{w.workouts} трен. · {w.sets} подх.</div>
            </div>
          );
        }}
      />
    </Card>
  );
}

function LiftsCard({ lifts, names }: { lifts: Record<string, { day: string; e1rm: number }[]>; names: Record<string, string> }) {
  const list = useMemo(
    () =>
      Object.entries(lifts)
        .filter(([, pts]) => pts.length >= 1)
        .sort((a, b) => b[1].length - a[1].length || b[1].at(-1)!.e1rm - a[1].at(-1)!.e1rm)
        .slice(0, 6),
    [lifts],
  );
  if (!list.length) return null;
  return (
    <Card title="Сила: расчётный максимум" color="ring1">
      <p className="note">Сколько вы подняли бы на 1 раз, по формуле Эпли из лучшего подхода дня. Растёт, значит прогрессия работает.</p>
      <div className="list">
        {list.map(([id, pts]) => {
          const first = pts[0].e1rm, last = pts.at(-1)!.e1rm;
          const d = last - first;
          return (
            <Link key={id} href={`/coach/exercise?id=${encodeURIComponent(id)}`} className="li">
              <div>
                <div className="n">{names[id] ?? id.replace(/_/g, " ")}</div>
                <div className="note">{pts.length} трен. · с {fmtDayShort(pts[0].day)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="n">{num(last, 1)} кг</div>
                {pts.length > 1 && <div className="note" style={{ color: d > 0 ? "var(--ok)" : d < 0 ? "var(--bad)" : undefined }}>{d >= 0 ? "+" : ""}{num(d, 1)}</div>}
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

function FeelCard({ reviews }: { reviews: { day: string; energy: number | null; fatigue: number | null; progress_feel: string | null }[] }) {
  if (reviews.length < 2) return null;
  const last = reviews.at(-1)!;
  const better = reviews.filter((r) => r.progress_feel === "better").length;
  return (
    <Card title="Самочувствие после тренировок" color="ring3">
      <Trend
        days={reviews.map((r) => r.day)}
        labels={reviews.map((r) => fmtDayShort(r.day))}
        series={[
          { key: "e", values: reviews.map((r) => r.energy), color: "var(--ok)", kind: "line" },
          { key: "f", values: reviews.map((r) => r.fatigue), color: "var(--warn)", kind: "dash" },
        ]}
        yMin={1}
        yMax={5}
        height={140}
        readout={(i) => {
          const r = i == null ? last : reviews[i];
          return (
            <div>
              <div className="muted small">{fmtDayShort(r.day)}</div>
              <div className="val">{r.energy ?? "—"}<small>энергия</small> {r.fatigue ?? "—"}<small>усталость</small></div>
            </div>
          );
        }}
      />
      <div className="legend"><span style={{ color: "var(--ok)" }}>— энергия</span><span style={{ color: "var(--warn)" }}>- - усталость</span></div>
      <p className="note">«Сильнее, чем раньше» в {better} из {reviews.length} тренировок.</p>
    </Card>
  );
}
