"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, ErrorCard, Header, Loading } from "@/components/ui";
import { AiError, localToday, mutate, num, recognizeFridge, useRecipes, type Meal, type Recipe } from "@/lib/data";
import { excluded } from "@/lib/weekplan";
import { MEALS, mealNow, shrinkImage } from "@/lib/nutrition";

// База рецептов (просьба 13.10): поиск, фильтры и «что приготовить из того, что есть дома».
// Продукты дома — список ключей (яйца, творог…); их можно отметить вручную или по фото холодильника.

const PANTRY = new Set(["специи", "масло", "соль", "вода", "сахар", "мёд", "томатная паста", "соевый соус", "мука"]);
const KEYS = ["яйца", "творог", "курица", "индейка", "говядина", "свинина", "фарш", "рыба", "тунец", "лосось", "минтай", "креветки", "кефир", "йогурт", "молоко", "сыр", "моцарелла", "сметана",
  "гречка", "рис", "овсянка", "макароны", "булгур", "картофель", "хлеб", "лаваш", "фасоль", "нут", "чечевица", "горох", "помидоры", "огурцы", "перец", "лук", "морковь", "капуста",
  "брокколи", "кабачок", "грибы", "шпинат", "зелень", "чеснок", "банан", "яблоко", "ягоды", "орехи", "арахисовая паста", "протеин", "авокадо", "кукуруза", "редис", "лимон"];

const FILTERS = [
  { key: "all", label: "Все" },
  { key: "fav", label: "★ Избранное" },
  { key: "breakfast", label: "Завтрак" },
  { key: "main", label: "Обед и ужин" },
  { key: "snack", label: "Перекус" },
  { key: "fast", label: "До 15 мин" },
  { key: "nocook", label: "Без плиты" },
  { key: "prep", label: "Впрок" },
  { key: "box", label: "В контейнер" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

const STORE = "hl-have";
const needKeys = (r: Recipe) => [...new Set(r.ingredients.map((i) => i.key).filter((k) => k && !PANTRY.has(k)))];

function pass(r: Recipe, f: Filter) {
  if (f === "fav") return r.fav;
  if (f === "breakfast" || f === "snack") return r.meals.includes(f);
  if (f === "main") return r.meals.includes("lunch") || r.meals.includes("dinner");
  if (f === "fast") return (r.time_min ?? 99) <= 15;
  if (f === "nocook") return r.tags.includes("без плиты");
  if (f === "prep") return r.tags.includes("впрок");
  if (f === "box") return r.tags.includes("в контейнер");
  return true;
}

export default function Recipes() {
  const rs = useRecipes();
  const [q, setQ] = useState("");
  const [f, setF] = useState<Filter>("all");
  const [have, setHave] = useState<string[]>([]);
  const [pick, setPick] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [noFish, setNoFish] = useState(true);
  useEffect(() => {
    try { setNoFish(localStorage.getItem("hl-nofish") !== "0"); } catch {}
  }, []);
  const toggleFish = () => {
    setNoFish(!noFish);
    try { localStorage.setItem("hl-nofish", noFish ? "0" : "1"); } catch {}
  };

  useEffect(() => {
    try { setHave(JSON.parse(localStorage.getItem(STORE) ?? "[]")); } catch {}
  }, []);
  const saveHave = (h: string[]) => {
    setHave(h);
    try { localStorage.setItem(STORE, JSON.stringify(h)); } catch {}
  };

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const hs = new Set(have);
    return (rs.data ?? [])
      .filter((r) => pass(r, f) && !(noFish && excluded(r, "рыба")))
      .filter((r) => !s || r.name.toLowerCase().includes(s) || r.ingredients.some((i) => i.name.toLowerCase().includes(s) || i.key.includes(s)))
      .map((r) => {
        const need = needKeys(r);
        const miss = need.filter((k) => !hs.has(k));
        return { r, need, miss, score: need.length ? 1 - miss.length / need.length : 0 };
      })
      .sort((a, b) => (have.length ? b.score - a.score || a.miss.length - b.miss.length : 0) || Number(b.r.fav) - Number(a.r.fav));
  }, [rs.data, q, f, have, noFish]);

  if (rs.error) return <ErrorCard error={rs.error} onRetry={rs.reload} />;

  return (
    <>
      <Header eyebrow="питание" title="Рецепты">
        <Link href="/food" className="muted small">‹ Питание</Link>
      </Header>

      <Card title="Что есть дома" color="move" right={have.length ? <button className="link small" onClick={() => saveHave([])}>Сбросить</button> : null}>
        <p className="note">
          {have.length
            ? `Отмечено ${have.length}. Сверху — блюда, для которых всё есть; соль, специи и масло не считаются.`
            : "Отметьте продукты или сфотографируйте холодильник: покажу, что из них приготовить."}
        </p>
        {have.length > 0 && !pick && (
          <div className="chips wrap">{have.map((k) => <button key={k} className="chip on" onClick={() => saveHave(have.filter((x) => x !== k))}>{k} ✕</button>)}</div>
        )}
        {pick && (
          <div className="chips wrap">
            {KEYS.map((k) => (
              <button key={k} className={"chip" + (have.includes(k) ? " on" : "")} onClick={() => saveHave(have.includes(k) ? have.filter((x) => x !== k) : [...have, k])}>{k}</button>
            ))}
          </div>
        )}
        <div className="row2">
          <button className="btn ghost" onClick={() => setPick(!pick)}>{pick ? "Готово" : "Отметить продукты"}</button>
          <FridgePhoto onKeys={(ks) => saveHave([...new Set([...have, ...ks])])} />
        </div>
      </Card>

      <input className="field" type="search" placeholder="Поиск: блюдо или продукт" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        {FILTERS.map((x) => <button key={x.key} className={"chip" + (f === x.key ? " on" : "")} onClick={() => setF(x.key)}>{x.label}</button>)}
        <button className={"chip" + (noFish ? " on" : "")} onClick={toggleFish} aria-pressed={noFish}>Без рыбы</button>
      </div>

      {!rs.data ? <Loading n={4} /> : !list.length ? (
        <Card><p className="note">{rs.data.length ? "Ничего не нашлось. Попробуйте другой фильтр или слово." : "База рецептов пока пуста."}</p></Card>
      ) : (
        <div className="recipes">
          {list.map(({ r, need, miss }) => (
            <RecipeCard key={r.slug} r={r} open={open === r.slug} onToggle={() => setOpen(open === r.slug ? null : r.slug)}
              have={have.length ? need.length - miss.length : null} need={need.length} miss={miss} onChange={rs.reload} />
          ))}
        </div>
      )}
      <p className="note" style={{ textAlign: "center" }}>КБЖУ — на одну порцию, по таблицам Скурихина. Взвешивайте продукты, если хотите точнее.</p>
    </>
  );
}

function RecipeCard({ r, open, onToggle, have, need, miss, onChange }: { r: Recipe; open: boolean; onToggle: () => void; have: number | null; need: number; miss: string[]; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [meal, setMeal] = useState<Meal>(mealNow());
  const [fav, setFav] = useState(r.fav);
  const full = have != null && have === need;

  async function eat() {
    setBusy(true);
    setDone("");
    try {
      await mutate("hl_food_add", { d: localToday(), meal, items: [{ name: r.name, grams: r.portion_g ?? 300, kcal: r.kcal, protein: r.protein, fat: r.fat, carbs: r.carbs, product_id: null, source: "recipe" }] });
      await mutate("hl_recipe_mark", { s: r.slug, fav_: null, cooked_: true }).catch(() => {});
      setDone("Записано в дневник");
      onChange();
    } catch (e) {
      setDone("Не записалось: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }
  async function star() {
    setFav(!fav);
    try { await mutate("hl_recipe_mark", { s: r.slug, fav_: !fav, cooked_: false }); } catch { setFav(fav); }
  }

  return (
    <Card className="recipe">
      <button className="recipe-head" onClick={onToggle} aria-expanded={open}>
        <span className="recipe-emoji" aria-hidden>{r.emoji ?? "🍽"}</span>
        <span>
          <span className="n">{r.name}</span>
          <span className="note">
            {Math.round(r.kcal)} ккал · белок {Math.round(r.protein)} г{r.time_min ? ` · ${r.time_min} мин` : ""}
          </span>
          {have != null && (
            <span className="recipe-have" style={{ color: full ? "var(--ok)" : have / Math.max(need, 1) >= 0.6 ? "var(--warn)" : "var(--muted)" }}>
              {full ? "Всё есть" : `Есть ${have} из ${need} · нужно: ${miss.slice(0, 3).join(", ")}${miss.length > 3 ? "…" : ""}`}
            </span>
          )}
        </span>
        <span className="chev" aria-hidden />
      </button>
      {open && (
        <>
          <div className="macro-row">
            <div><b>{Math.round(r.kcal)}</b><small>ккал</small></div>
            <div><b>{num(r.protein, 0)}</b><small>белок</small></div>
            <div><b>{num(r.fat, 0)}</b><small>жиры</small></div>
            <div><b>{num(r.carbs, 0)}</b><small>углев.</small></div>
          </div>
          <p className="note">
            На порцию{r.portion_g ? ` ≈ ${r.portion_g} г` : ""}{r.servings > 1 ? `, рецепт на ${r.servings} порц.` : ""}{r.tags.length ? ` · ${r.tags.join(", ")}` : ""}
          </p>
          <div className="list">
            {r.ingredients.map((i, k) => (
              <div key={k} className="li ingr">
                <span>{have != null && !PANTRY.has(i.key) ? (miss.includes(i.key) ? "○ " : "✓ ") : ""}{i.name}</span>
                <span className="muted">{i.qty}</span>
              </div>
            ))}
          </div>
          <ol className="steps">{r.steps.map((s, k) => <li key={k}>{s}</li>)}</ol>
          {r.tip && <p className="note">💡 {r.tip}</p>}
          <div className="chips">
            {MEALS.map((m) => <button key={m.key} className={"chip" + (meal === m.key ? " on" : "")} onClick={() => setMeal(m.key)}>{m.label}</button>)}
          </div>
          <Link className="btn" style={{ textAlign: "center" }} href={`/food/cook?r=${r.slug}`}>Готовить по шагам</Link>
          <div className="row2">
            <button className="btn ghost" onClick={eat} disabled={busy}>{busy ? "Записываю…" : "Съел порцию"}</button>
            <button className="btn ghost" onClick={star} aria-pressed={fav}>{fav ? "★ В избранном" : "☆ В избранное"}</button>
          </div>
          {done && <p className="note" style={{ color: done.startsWith("Не") ? "var(--bad)" : "var(--ok)" }}>{done}</p>}
        </>
      )}
    </Card>
  );
}

/** Фото холодильника или полки: ИИ перечисляет продукты, рецепты подбираются по базе. */
function FridgePhoto({ onKeys }: { onKeys: (k: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function go(file?: File) {
    if (!file) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await recognizeFridge(localToday(), "", await shrinkImage(file));
      const ps = r.result.products ?? [];
      const keys = ps.map((p) => p.key).filter((k) => KEYS.includes(k));
      onKeys(keys);
      setMsg(ps.length ? `Нашёл: ${ps.map((p) => p.name).join(", ")}.${r.result.note ? " " + r.result.note : ""}` : "Продуктов на фото не нашёл. Попробуйте ближе и при свете.");
    } catch (e) {
      setMsg(e instanceof AiError || e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => go(e.target.files?.[0])} />
      <button className="btn ghost" onClick={() => input.current?.click()} disabled={busy}>{busy ? "Смотрю… 10–20 с" : "📷 Фото холодильника"}</button>
      {msg && <p className="note" style={{ gridColumn: "1 / -1" }}>{msg}</p>}
    </>
  );
}
