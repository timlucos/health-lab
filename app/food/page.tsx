"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { ActivityRings } from "@/components/charts";
import { Card, ErrorCard, Header, Loading } from "@/components/ui";
import {
  AiError, fmtDay, fmtWeekdayShort, localToday, lookupBarcode, mutate, num, recognizeFood, recognizeLabel, useFoodDay, useGoal, useMealPlan, useProgress, useSummary,
  type FoodGuess, type Meal, type Product,
} from "@/lib/data";
import { MEALS, mealNow, shrinkImage, targets } from "@/lib/nutrition";
import { logRecipe, planDay, recipeOf, weekdayKey } from "@/lib/mealplan";

type Draft = { name: string; grams: number; k: number; p: number; f: number; c: number; product_id?: number | null; source: string };
const per = (d: Draft) => ({ kcal: (d.k * d.grams) / 100, protein: (d.p * d.grams) / 100, fat: (d.f * d.grams) / 100, carbs: (d.c * d.grams) / 100 });

export default function FoodPage() {
  const sum = useSummary(60);
  const today = localToday(sum.data?.tz);
  const day = useFoodDay(sum.data ? today : null);
  const goal = useGoal();
  const pr = useProgress(8);
  const [mode, setMode] = useState<"photo" | "text" | "barcode" | "recent" | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [meal, setMeal] = useState<Meal>(mealNow());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const weight = pr.data?.checkins.filter((c) => c.weight_kg != null).at(-1)?.weight_kg ?? null;
  const t = targets(goal.data?.details, weight);
  const entries = day.data?.entries ?? [];
  const tot = useMemo(() => entries.reduce((a, e) => ({ kcal: a.kcal + (e.kcal ?? 0), protein: a.protein + (e.protein ?? 0), fat: a.fat + (e.fat ?? 0), carbs: a.carbs + (e.carbs ?? 0) }), { kcal: 0, protein: 0, fat: 0, carbs: 0 }), [entries]);

  if (sum.error || day.error) return <ErrorCard error={(sum.error ?? day.error)!} onRetry={day.reload} />;

  const fail = (e: unknown) => setErr(e instanceof AiError || e instanceof Error ? e.message : String(e));
  const fromGuess = (items: FoodGuess[] = [], source: string): Draft[] =>
    items.filter((i) => i?.name).map((i) => ({ name: i.name, grams: Math.round(i.grams || 100), k: i.kcal_100 || 0, p: i.protein_100 || 0, f: i.fat_100 || 0, c: i.carbs_100 || 0, source }));

  async function save() {
    if (!drafts.length) return;
    setBusy(true);
    setErr("");
    try {
      await mutate("hl_food_add", { d: today, meal, items: drafts.map((d) => ({ name: d.name, grams: d.grams, ...per(d), product_id: d.product_id ?? null, source: d.source })) });
      setDrafts([]);
      setNote("");
      setMode(null);
      day.reload();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    await mutate("hl_food_remove", { entry_id: id });
    day.reload();
  }

  return (
    <>
      <Header eyebrow={fmtDay(today)} title="Питание" />

      <Card>
        {t ? (
          <div className="rings-hero">
            <ActivityRings rings={[
              { value: tot.kcal / t.kcal, color: "var(--ring1)", label: "Калории" },
              { value: tot.protein / t.protein, color: "var(--ring2)", label: "Белок" },
              { value: tot.carbs / Math.max(1, t.carbs), color: "var(--ring3)", label: "Углеводы" },
            ]} />
            <div className="ring-legend">
              <div><div className="k" style={{ color: "var(--ring1)" }}>Калории</div><div className="v" style={{ color: "var(--ring1)" }}>{Math.round(tot.kcal)}<small>/{t.kcal}</small></div></div>
              <div><div className="k" style={{ color: "var(--ring2)" }}>Белок</div><div className="v" style={{ color: "var(--ring2)" }}>{Math.round(tot.protein)}<small>/{t.protein} г</small></div></div>
              <div><div className="k" style={{ color: "var(--ring3)" }}>Углеводы · жиры</div><div className="v" style={{ color: "var(--ring3)" }}>{Math.round(tot.carbs)}<small>/{t.carbs} · {Math.round(tot.fat)}/{t.fat} г</small></div></div>
            </div>
          </div>
        ) : (
          <p className="note">Чтобы посчитать норму калорий и белка, укажите вес в <Link className="link" href="/coach/goal">«Цели»</Link> или в <Link className="link" href="/coach/progress">замерах</Link>.</p>
        )}
        {t && <p className="note">{t.why}</p>}
      </Card>

      <PlanToday today={today} onLogged={day.reload} />

      <div className="food-add">
        {([["photo", "📷 Фото"], ["barcode", "▥ Штрихкод"], ["text", "✎ Текстом"], ["recent", "↺ Недавнее"]] as const).map(([k, l]) => (
          <button key={k} className={"chip" + (mode === k ? " on" : "")} onClick={() => { setMode(mode === k ? null : k); setErr(""); }}>{l}</button>
        ))}
      </div>

      {mode === "photo" && <PhotoAdd day={today} busy={busy} setBusy={setBusy} onItems={(items, n) => { setDrafts(fromGuess(items, "photo")); setNote(n ?? ""); }} onError={fail} />}
      {mode === "text" && <TextAdd day={today} busy={busy} setBusy={setBusy} onItems={(items, n) => { setDrafts(fromGuess(items, "text")); setNote(n ?? ""); }} onError={fail} />}
      {mode === "barcode" && <BarcodeAdd day={today} busy={busy} setBusy={setBusy} onProduct={(p) => setDrafts([{ name: p.brand ? `${p.name} (${p.brand})` : p.name, grams: Math.round(p.portion_g ?? 100), k: p.kcal ?? 0, p: p.protein ?? 0, f: p.fat ?? 0, c: p.carbs ?? 0, product_id: p.id, source: "barcode" }])} onError={fail} />}
      {mode === "recent" && (
        <Card title="Недавнее" color="air">
          {day.data?.recent.length ? (
            <div className="list">
              {day.data.recent.map((r) => (
                <button key={r.name} className="li" style={{ textAlign: "left", background: "none", border: 0, color: "inherit", font: "inherit" }}
                  onClick={() => setDrafts((d) => [...d, { name: r.name, grams: Number(r.grams), k: r.grams ? ((r.kcal ?? 0) * 100) / r.grams : 0, p: r.grams ? ((r.protein ?? 0) * 100) / r.grams : 0, f: r.grams ? ((r.fat ?? 0) * 100) / r.grams : 0, c: r.grams ? ((r.carbs ?? 0) * 100) / r.grams : 0, product_id: r.product_id, source: "product" }])}>
                  <div><div className="n">{r.name}</div><div className="note">{num(r.grams)} г · {Math.round(r.kcal ?? 0)} ккал</div></div>
                  <span className="chev">+</span>
                </button>
              ))}
            </div>
          ) : <p className="note">Здесь появится то, что вы ели за последний месяц, для добавления в одно касание.</p>}
        </Card>
      )}

      {err && <p className="note" style={{ color: "var(--bad)" }}>{err}</p>}

      {drafts.length > 0 && (
        <Card title="Проверьте и добавьте" color="ring2">
          <p className="note">Граммы от ИИ — оценка с ошибкой до 30–40%. Поправьте вес, если знаете точнее: так дневник будет честным.</p>
          {drafts.map((d, i) => {
            const v = per(d);
            return (
              <div key={i} className="draft">
                <input className="field" value={d.name} onChange={(e) => setDrafts((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} aria-label="Название" />
                <label className="draft-g">
                  <input className="field" inputMode="numeric" value={String(d.grams)} onChange={(e) => setDrafts((x) => x.map((y, j) => (j === i ? { ...y, grams: Number(e.target.value.replace(",", ".")) || 0 } : y)))} aria-label="Граммы" />
                  <small>г</small>
                </label>
                <div className="note">{Math.round(v.kcal)} ккал · Б {num(v.protein, 1)} · Ж {num(v.fat, 1)} · У {num(v.carbs, 1)}</div>
                <button className="link" onClick={() => setDrafts((x) => x.filter((_, j) => j !== i))}>Убрать</button>
              </div>
            );
          })}
          {note && <p className="coach" style={{ margin: 0 }}>{note}</p>}
          <div className="chips">
            {MEALS.map((m) => <button key={m.key} className={"chip" + (meal === m.key ? " on" : "")} onClick={() => setMeal(m.key)}>{m.label}</button>)}
          </div>
          <button className="btn" onClick={save} disabled={busy}>{busy ? "Сохраняю…" : `Добавить · ${Math.round(drafts.reduce((a, d) => a + per(d).kcal, 0))} ккал`}</button>
        </Card>
      )}

      {!day.data ? <Loading n={2} /> : MEALS.map((m) => {
        const list = entries.filter((e) => e.meal === m.key);
        if (!list.length) return null;
        const k = list.reduce((a, e) => a + (e.kcal ?? 0), 0);
        return (
          <Card key={m.key} title={m.label} color="food" right={<span className="muted small">{Math.round(k)} ккал</span>}>
            <div className="list">
              {list.map((e) => (
                <div key={e.id} className="li">
                  <div>
                    <div className="n">{e.name}</div>
                    <div className="note">{num(e.grams)} г · {Math.round(e.kcal ?? 0)} ккал · Б {num(e.protein, 1)} · Ж {num(e.fat, 1)} · У {num(e.carbs, 1)}</div>
                  </div>
                  <button className="link" onClick={() => remove(e.id)} aria-label={`Удалить ${e.name}`}>✕</button>
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      {day.data && day.data.week.length > 1 && t && (
        <Card title="Неделя" color="ring1">
          <div className="week-bars tall" aria-label="Калории по дням">
            {day.data.week.map((w) => (
              <div key={w.day} title={`${w.day}: ${w.kcal} ккал, белок ${w.protein} г`}>
                <i style={{ height: `${Math.min(100, (w.kcal / (t.kcal * 1.3)) * 100)}%`, background: w.kcal >= t.kcal * 0.9 ? "var(--ring1)" : "color-mix(in srgb, var(--ring1) 45%, transparent)" }} />
                <span>{fmtWeekdayShort(w.day).slice(0, 2)}</span>
              </div>
            ))}
          </div>
          <p className="note">
            В среднем {Math.round(day.data.week.reduce((a, w) => a + (w.kcal ?? 0), 0) / day.data.week.length)} ккал и {Math.round(day.data.week.reduce((a, w) => a + (w.protein ?? 0), 0) / day.data.week.length)} г белка в день при норме {t.kcal} и {t.protein}.
          </p>
        </Card>
      )}
      <p className="note" style={{ textAlign: "center" }}>Штрихкоды: своя база и Open Food Facts (ODbL). Фото и текст распознаёт ИИ, одно распознавание ≈ 1–3 ₽.</p>
    </>
  );
}

type AddProps = { day: string; busy: boolean; setBusy: (b: boolean) => void; onError: (e: unknown) => void };

function PhotoAdd({ day, busy, setBusy, onItems, onError }: AddProps & { onItems: (i: FoodGuess[] | undefined, note?: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [hint, setHint] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  async function go(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const img = await shrinkImage(file);
      setPreview(img);
      const r = await recognizeFood(day, hint, img);
      onItems(r.result.items, r.result.note);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Фото тарелки" color="ring1">
      <input className="field" placeholder="Подсказка, если хотите: «паста карбонара, порция 300 г»" value={hint} onChange={(e) => setHint(e.target.value)} />
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => go(e.target.files?.[0])} />
      {preview && <img src={preview} alt="Фото еды" className="food-preview" />}
      <button className="btn" onClick={() => input.current?.click()} disabled={busy}>{busy ? "Распознаю… 5–15 секунд" : "Сфотографировать или выбрать"}</button>
      <p className="note">Снимайте сверху, вся тарелка в кадре, рядом вилка или ладонь для масштаба.</p>
    </Card>
  );
}

function TextAdd({ day, busy, setBusy, onItems, onError }: AddProps & { onItems: (i: FoodGuess[] | undefined, note?: string) => void }) {
  const [text, setText] = useState("");
  async function go() {
    setBusy(true);
    try {
      const r = await recognizeFood(day, text);
      onItems(r.result.items, r.result.note);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Текстом" color="air">
      <textarea className="field" rows={2} placeholder="Например: гречка 200 г, куриная грудка 150 г, огурец, чай с сахаром" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn" onClick={go} disabled={busy || !text.trim()}>{busy ? "Считаю…" : "Посчитать КБЖУ"}</button>
    </Card>
  );
}

function BarcodeAdd({ day, busy, setBusy, onProduct, onError }: AddProps & { onProduct: (p: Product) => void }) {
  const [code, setCode] = useState("");
  const [scan, setScan] = useState(true);
  const [missing, setMissing] = useState<string | null>(null);
  const label = useRef<HTMLInputElement>(null);

  const find = useCallback(async (c: string) => {
    setScan(false);
    setCode(c);
    setMissing(null);
    setBusy(true);
    try {
      const r = await lookupBarcode(c);
      if (r.product) onProduct(r.product);
      else setMissing(c);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }, [onProduct, onError, setBusy]);

  async function fromLabel(file?: File) {
    if (!file || !missing) return;
    setBusy(true);
    try {
      const img = await shrinkImage(file, 1400);
      const r = await recognizeLabel(day, img);
      const x = r.result;
      if (x.kcal == null) throw new Error("Не удалось прочитать этикетку. Снимите таблицу пищевой ценности крупнее.");
      const saved = (await mutate("hl_food_product_save", { r: { barcode: missing, name: x.name ?? "Продукт", brand: x.brand ?? null, kcal: x.kcal, protein: x.protein ?? 0, fat: x.fat ?? 0, carbs: x.carbs ?? 0, portion_g: x.portion_g ?? null, source: "label" } })) as Product;
      setMissing(null);
      onProduct(saved);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Штрихкод" color="temp">
      {scan && <BarcodeScanner onCode={find} />}
      <div className="row-between" style={{ gap: 8 }}>
        <input className="field" inputMode="numeric" placeholder="Или введите цифры кода" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        <button className="btn" onClick={() => find(code)} disabled={busy || code.length < 8}>Найти</button>
      </div>
      {!scan && <button className="link" onClick={() => { setScan(true); setMissing(null); }}>Сканировать ещё</button>}
      {busy && <p className="note">Ищу…</p>}
      {missing && (
        <>
          <p className="note">Продукта {missing} нет в базе. Сфотографируйте таблицу «Пищевая ценность на 100 г» на упаковке: ИИ прочитает её и запомнит продукт навсегда.</p>
          <input ref={label} type="file" accept="image/*" capture="environment" hidden onChange={(e) => fromLabel(e.target.files?.[0])} />
          <button className="btn" onClick={() => label.current?.click()} disabled={busy}>Сфотографировать этикетку</button>
        </>
      )}
    </Card>
  );
}

/** Сегодня по рациону: блюда из недельного плана, запись в дневник в одно касание. */
function PlanToday({ today, onLogged }: { today: string; onLogged: () => void }) {
  const mp = useMealPlan(null);
  const [done, setDone] = useState<Record<number, boolean>>({});
  const row = mp.data?.plan;
  const plan = row?.status === "ready" ? row.plan : null;
  const d = plan ? planDay(plan, weekdayKey(today)) : null;
  if (!mp.data) return null;
  if (!plan || !d) {
    return (
      <Card title="Рацион на неделю" color="food" href="/food/plan">
        <div className="note">{row?.status === "pending" ? "Claude составляет рацион…" : "Меню на 7 дней с готовкой впрок: рецепты, список покупок и цены в «Пятёрочке»."}</div>
      </Card>
    );
  }
  return (
    <Card title="Сегодня по рациону" color="food" right={<Link className="link small" href="/food/plan">Весь рацион ›</Link>}>
      <div className="list">
        {d.meals.map(([meal, id, n], i) => {
          const r = recipeOf(plan, id);
          if (!r) return null;
          return (
            <div key={i} className="li">
              <div>
                <div className="muted small">{MEALS.find((m) => m.key === meal)?.label ?? meal}</div>
                <div className="n">{r.emoji ?? "🍽"} {r.name}</div>
                <div className="note">{Math.round(r.kcal * n)} ккал · белок {Math.round(r.protein * n)} г</div>
              </div>
              <button className={"chip" + (done[i] ? " on" : "")} disabled={done[i]}
                onClick={async () => { await logRecipe(today, meal, r, n); setDone((x) => ({ ...x, [i]: true })); onLogged(); }}>
                {done[i] ? "Записано" : "Съел"}
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
