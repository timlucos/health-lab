"use client";

import { useState } from "react";
import { Card } from "./ui";
import { mutate, num, useRpc, type Meal } from "@/lib/data";
import { MEALS, mealNow } from "@/lib/nutrition";

// Еда из кофейни Дринкит и других мест, где он ест каждый день (просьба 13.10): одно касание — запись в дневник.
// КБЖУ можно поправить по этикетке или карточке в приложении кофейни; пока не поправлено — помечено как оценка.
export type Preset = { id: number; place: string; name: string; grams: number | null; kcal: number | null; protein: number | null; fat: number | null; carbs: number | null; estimate: boolean; sort: number };
type Draft = { id?: number; place: string; name: string; grams: string; kcal: string; protein: string; fat: string; carbs: string };

const n = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
const toDraft = (p?: Preset): Draft => ({ id: p?.id, place: p?.place ?? "Дринкит", name: p?.name ?? "", grams: p?.grams?.toString() ?? "", kcal: p?.kcal?.toString() ?? "", protein: p?.protein?.toString() ?? "", fat: p?.fat?.toString() ?? "", carbs: p?.carbs?.toString() ?? "" });

export function PresetsCard({ day, onLogged }: { day: string; onLogged: () => void }) {
  const ps = useRpc<Preset[]>("hl_presets", {});
  const [meal, setMeal] = useState<Meal>(mealNow());
  const [edit, setEdit] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  const list = ps.data ?? [];
  const places = [...new Set(list.map((p) => p.place))];

  async function eat(p: Preset) {
    setBusy(p.id);
    setMsg("");
    try {
      await mutate("hl_food_add", { d: day, meal, items: [{ name: `${p.name} (${p.place})`, grams: p.grams ?? 100, kcal: p.kcal ?? 0, protein: p.protein ?? 0, fat: p.fat ?? 0, carbs: p.carbs ?? 0, product_id: null, source: "preset" }] });
      setMsg(`${p.name} записано в «${MEALS.find((m) => m.key === meal)?.label}».`);
      onLogged();
    } catch (e) {
      setMsg("Не записалось: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  }
  async function save() {
    if (!edit) return;
    try {
      await mutate("hl_preset_save", { r: { id: edit.id ?? null, place: edit.place, name: edit.name, grams: n(edit.grams), kcal: n(edit.kcal), protein: n(edit.protein), fat: n(edit.fat), carbs: n(edit.carbs), estimate: false } });
      setEdit(null);
      ps.reload();
    } catch (e) {
      setMsg("Не сохранилось: " + (e instanceof Error ? e.message : String(e)));
    }
  }
  async function remove(id: number) {
    try {
      await mutate("hl_preset_remove", { i: id });
      setEdit(null);
      ps.reload();
    } catch (e) {
      setMsg("Не удалилось: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  if (ps.error) return null;
  return (
    <Card title={places.length === 1 ? `Кофейня ${places[0]}` : "Мои места"} color="temp" right={<button className="link small" onClick={() => setEdit(edit ? null : toDraft())}>{edit ? "Закрыть" : "+ Блюдо"}</button>}>
      {!edit && (
        <>
          <div className="chips">
            {MEALS.map((m) => <button key={m.key} className={"chip" + (meal === m.key ? " on" : "")} onClick={() => setMeal(m.key)}>{m.label}</button>)}
          </div>
          <div className="list">
            {list.map((p) => (
              <div key={p.id} className="li">
                <button className="preset-name" onClick={() => setEdit(toDraft(p))} aria-label={`Изменить ${p.name}`}>
                  <span className="n">{p.name}</span>
                  <span className="note">
                    {places.length > 1 ? `${p.place} · ` : ""}{p.grams ? `${num(p.grams)} г · ` : ""}{Math.round(p.kcal ?? 0)} ккал · Б {num(p.protein, 0)} · Ж {num(p.fat, 0)} · У {num(p.carbs, 0)}{p.estimate ? " · оценка" : ""}
                  </span>
                </button>
                <button className="chip" onClick={() => eat(p)} disabled={busy === p.id}>{busy === p.id ? "…" : "Съел"}</button>
              </div>
            ))}
          </div>
          {list.some((p) => p.estimate) && <p className="note">«Оценка» — средние цифры для такого блюда. Нажмите на название и впишите КБЖУ с этикетки или из приложения кофейни, так дневник будет точным.</p>}
        </>
      )}
      {edit && (
        <div className="preset-form">
          <input className="field" placeholder="Название, например «Сырники, 3 шт»" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <input className="field" placeholder="Место" value={edit.place} onChange={(e) => setEdit({ ...edit, place: e.target.value })} />
          <div className="preset-nums">
            {([["grams", "Вес, г"], ["kcal", "Ккал"], ["protein", "Белки"], ["fat", "Жиры"], ["carbs", "Углев."]] as const).map(([k, l]) => (
              <label key={k} className="stack-label">
                <span>{l}</span>
                <input className="field" inputMode="decimal" value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <p className="note">Цифры — на всю порцию, как на этикетке «на упаковку».</p>
          <div className="row2">
            <button className="btn" onClick={save} disabled={!edit.name.trim() || n(edit.kcal) == null}>Сохранить</button>
            {edit.id ? <button className="btn ghost" onClick={() => remove(edit.id!)}>Удалить</button> : <button className="btn ghost" onClick={() => setEdit(null)}>Отмена</button>}
          </div>
        </div>
      )}
      {msg && <p className="note" style={{ color: msg.startsWith("Не") ? "var(--bad)" : "var(--ok)" }}>{msg}</p>}
    </Card>
  );
}
