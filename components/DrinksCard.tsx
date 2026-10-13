"use client";

import { useState } from "react";
import { Card } from "./ui";
import { fmtWeekdayShort, mutate, num, useDrinks, type DrinkKind } from "@/lib/data";

// Вода и напитки (просьба 13.10): кнопки в одно касание, норма воды от веса, кофеин за день.
// Норма ~33 мл на кг (EFSA: 2,5 л в день мужчине с едой и питьём); с креатином пить стоит не меньше.
const QUICK: { kind: DrinkKind; label: string; ml: number; kcal: number; emoji: string }[] = [
  { kind: "water", label: "Стакан", ml: 250, kcal: 0, emoji: "💧" },
  { kind: "water", label: "Бутылка", ml: 500, kcal: 0, emoji: "💧" },
  { kind: "coffee", label: "Кофе", ml: 200, kcal: 5, emoji: "☕" },
  { kind: "coffee", label: "Капучино", ml: 300, kcal: 120, emoji: "☕" },
  { kind: "tea", label: "Чай", ml: 250, kcal: 0, emoji: "🍵" },
  { kind: "protein", label: "Протеин", ml: 300, kcal: 120, emoji: "🥤" },
  { kind: "milk", label: "Молоко", ml: 250, kcal: 130, emoji: "🥛" },
  { kind: "juice", label: "Сок", ml: 250, kcal: 115, emoji: "🧃" },
  { kind: "soda", label: "Газировка", ml: 330, kcal: 140, emoji: "🥤" },
  { kind: "alcohol", label: "Пиво", ml: 500, kcal: 215, emoji: "🍺" },
];
const NAME: Record<DrinkKind, string> = { water: "Вода", coffee: "Кофе", tea: "Чай", protein: "Протеин", juice: "Сок", soda: "Газировка", milk: "Молоко", alcohol: "Алкоголь", other: "Другое" };

export function DrinksCard({ day, weight }: { day: string; weight: number | null }) {
  const dr = useDrinks(day);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [more, setMore] = useState(false);
  const goal = Math.round(((weight ?? 75) * 33) / 100) * 100;
  const list = dr.data?.list ?? [];
  const water = list.filter((d) => d.kind === "water" || d.kind === "tea").reduce((a, d) => a + d.ml, 0);
  const coffee = list.filter((d) => d.kind === "coffee").length;
  const kcal = list.reduce((a, d) => a + Number(d.kcal ?? 0), 0);

  async function add(q: (typeof QUICK)[number]) {
    setBusy(true);
    setErr("");
    try {
      await mutate("hl_drink_add", { d: day, k: q.kind, ml_: q.ml, kcal_: q.kcal });
      dr.reload();
    } catch (e) {
      setErr("Не записалось: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: number) {
    try {
      await mutate("hl_drink_remove", { i: id });
      dr.reload();
    } catch (e) {
      setErr("Не удалилось: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <Card title="Вода и напитки" color="air" right={<span className="muted small">{num(water / 1000, 1)} / {num(goal / 1000, 1)} л</span>}>
      <div className="water-bar" role="progressbar" aria-valuenow={water} aria-valuemax={goal} aria-label="Вода за день">
        <i style={{ width: `${Math.min(100, (water / goal) * 100)}%` }} />
      </div>
      <p className="note">
        {water >= goal ? "Норма воды на сегодня выполнена." : `Ещё ${num((goal - water) / 1000, 1)} л до нормы (~33 мл на кг веса; с креатином это особенно важно).`}
        {coffee ? ` Кофе: ${coffee} ${coffee === 1 ? "чашка" : coffee < 5 ? "чашки" : "чашек"}${coffee >= 4 ? " — это уже около 400 мг кофеина, больше не стоит, особенно после 15:00." : "."}` : ""}
        {kcal >= 20 ? ` В напитках ${Math.round(kcal)} ккал.` : ""}
      </p>
      <div className="drink-grid">
        {(more ? QUICK : QUICK.slice(0, 6)).map((q, i) => (
          <button key={i} className="chip" onClick={() => add(q)} disabled={busy}>
            {q.emoji} {q.label}<small>{q.ml} мл</small>
          </button>
        ))}
      </div>
      <button className="link small" onClick={() => setMore(!more)}>{more ? "Меньше" : "Молоко, сок, газировка, пиво ›"}</button>
      {list.length > 0 && (
        <div className="list">
          {list.map((d) => (
            <div key={d.id} className="li">
              <span>{NAME[d.kind]} · {d.ml} мл<span className="muted small"> · {new Date(d.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" })}</span></span>
              <button className="link" onClick={() => remove(d.id)} aria-label={`Удалить ${NAME[d.kind]}`}>✕</button>
            </div>
          ))}
        </div>
      )}
      {(dr.data?.week.length ?? 0) > 1 && (
        <div className="week-bars" aria-label="Вода по дням">
          {dr.data!.week.map((w) => (
            <div key={w.day} title={`${w.day}: ${w.water_ml ?? 0} мл`}>
              <i style={{ height: `${Math.min(100, ((w.water_ml ?? 0) / goal) * 100)}%`, background: (w.water_ml ?? 0) >= goal * 0.9 ? "var(--air)" : "color-mix(in srgb, var(--air) 45%, transparent)" }} />
              <span>{fmtWeekdayShort(w.day).slice(0, 2)}</span>
            </div>
          ))}
        </div>
      )}
      {err && <p className="note" style={{ color: "var(--bad)" }}>{err}</p>}
    </Card>
  );
}
