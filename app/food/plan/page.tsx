"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, ErrorCard, Header, Loading } from "@/components/ui";
import {
  AiError, localToday, num, startMealPlan, useGoal, useMealPlan, useProgress, useSummary,
  type MealPlanBody, type MealPlanRow,
} from "@/lib/data";
import { rub } from "@/lib/ai";
import { MEALS, targets, type Targets } from "@/lib/nutrition";
import { WEEK, dayTotals, logRecipe, photoLink, planDay, recipeOf, weekdayKey } from "@/lib/mealplan";

export default function PlanPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Plan />
    </Suspense>
  );
}

const PREFS_KEY = "hl-mealplan-prefs";
type Prefs = { store: string; budget: string; cook: string; meals: string; dislikes: string; notes: string };
const DEFAULT: Prefs = { store: "Пятёрочка", budget: "", cook: "воскресенье и среда", meals: "4", dislikes: "", notes: "" };
const PREF_FIELDS: [keyof Prefs, string, string][] = [
  ["store", "Магазин", "Пятёрочка"],
  ["budget", "Бюджет на неделю, ₽", "например 4000"],
  ["cook", "Когда готовить", "воскресенье и среда"],
  ["meals", "Приёмов пищи в день", "4"],
  ["dislikes", "Не ем / аллергия", "например рыба, грибы"],
  ["notes", "Пожелания", "быстро, без духовки, контейнеры на работу"],
];

function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return DEFAULT;
  }
}

function Plan() {
  const idParam = Number(useSearchParams().get("id")) || null;
  const sum = useSummary(60);
  const today = localToday(sum.data?.tz);
  const st = useMealPlan(idParam);
  const goal = useGoal();
  const pr = useProgress(8);
  const weight = pr.data?.checkins.filter((c) => c.weight_kg != null).at(-1)?.weight_kg ?? null;
  const t = targets(goal.data?.details, weight);
  const [form, setForm] = useState(false);
  const row = st.data?.plan ?? null;
  const pending = row?.status === "pending" && Date.now() - Date.parse(row.created_at) < 5 * 60e3;

  // Пока Claude составляет рацион, проверяем каждые 6 секунд.
  useEffect(() => {
    if (!pending) return;
    const h = setInterval(() => st.reload(), 6000);
    return () => clearInterval(h);
  }, [pending, st]);

  if (st.error) return <ErrorCard error={st.error} onRetry={st.reload} />;

  const showForm = form || (!pending && (!row || row.status !== "ready"));
  return (
    <>
      <Header eyebrow="питание" title="Рацион на неделю">
        <Link href="/food" className="muted small">‹ Питание</Link>
      </Header>
      {!st.data ? <Loading n={3} /> : (
        <>
          {pending && (
            <Card title="Составляю рацион" color="food">
              <p className="note">Claude подбирает рецепты под вашу норму, считает КБЖУ, список покупок и цены. Обычно 1–2 минуты, экран можно не закрывать — он обновится сам.</p>
              <div className="skeleton" style={{ height: 8 }} />
            </Card>
          )}
          {row?.status === "error" && !form && <p className="note" style={{ color: "var(--bad)" }}>Не получилось составить рацион: {row.error ?? "ошибка ИИ"}. Попробуйте ещё раз.</p>}
          {row?.status === "pending" && !pending && !form && <p className="note" style={{ color: "var(--bad)" }}>Ответ так и не пришёл. Попробуйте ещё раз.</p>}
          {showForm && !pending && <PlanForm today={today} t={t} onStarted={() => { setForm(false); st.reload(); }} />}
          {row?.status === "ready" && row.plan && !form && <PlanView row={row} plan={row.plan} today={today} t={t} onNew={() => setForm(true)} />}
          {(st.data.list.length > 1 || (st.data.list.length === 1 && idParam)) && (
            <Card title="Прошлые рационы" color="air">
              <div className="list">
                {st.data.list.filter((x) => x.status === "ready").map((x) => (
                  <Link key={x.id} className="li" href={`/food/plan?id=${x.id}`}>
                    <div>
                      <div className="n">{x.title ?? "Рацион"}</div>
                      <div className="note">{new Date(x.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}{x.cost_rub != null ? ` · ${rub(x.cost_rub)}` : ""}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}

function PlanForm({ today, t, onStarted }: { today: string; t: Targets | null; onStarted: () => void }) {
  const [p, setP] = useState<Prefs>(DEFAULT);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => setP(loadPrefs()), []);

  async function go() {
    setBusy(true);
    setErr("");
    try {
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch {}
      const prefs = Object.fromEntries(Object.entries(p).filter(([, v]) => v.trim()));
      await startMealPlan(today, prefs, t ? { kcal: t.kcal, protein: t.protein, fat: t.fat, carbs: t.carbs } : null);
      onStarted();
    } catch (e) {
      setErr(e instanceof AiError || e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Новый рацион" color="food">
      <p className="note">
        Claude составит меню на 7 дней с готовкой впрок 2 раза в неделю: рецепты, порядок готовки, список покупок с примерными ценами.
        {t ? ` Норма: ${t.kcal} ккал, белок ${t.protein} г, жиры ${t.fat} г, углеводы ${t.carbs} г.` : " Укажите вес в «Цели», чтобы попасть в вашу норму."}
      </p>
      {PREF_FIELDS.map(([k, label, ph]) => (
        <label key={k} className="stack-label">
          <span>{label}</span>
          <input className="field" value={p[k]} placeholder={ph} inputMode={k === "budget" || k === "meals" ? "numeric" : undefined}
            onChange={(e) => setP((x) => ({ ...x, [k]: e.target.value }))} />
        </label>
      ))}
      {err && <p className="note" style={{ color: "var(--bad)" }}>{err}</p>}
      <button className="btn" onClick={go} disabled={busy}>{busy ? "Отправляю…" : "Составить рацион"}</button>
      <p className="note">Один рацион ≈ 15–25 ₽: это самый объёмный запрос, его делает Claude.</p>
    </Card>
  );
}

const TABS = [["week", "Неделя"], ["cook", "Готовка"], ["recipes", "Рецепты"], ["shop", "Покупки"]] as const;

function PlanView({ row, plan, today, t, onNew }: { row: MealPlanRow; plan: MealPlanBody; today: string; t: Targets | null; onNew: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("week");
  return (
    <>
      <Card title={plan.title} color="food" right={<span className="muted small" style={{ whiteSpace: "nowrap" }}>{rub(row.cost_rub)}</span>}>
        {plan.summary && <p className="note">{plan.summary}</p>}
        {plan.per_day && (
          <div className="stats">
            <div><div className="k">В день</div><div className="v">{Math.round(plan.per_day.kcal)}</div><div className="note">ккал{t ? ` / ${t.kcal}` : ""}</div></div>
            <div><div className="k">Белок</div><div className="v">{Math.round(plan.per_day.protein)}</div><div className="note">г{t ? ` / ${t.protein}` : ""}</div></div>
            <div><div className="k">Покупки</div><div className="v">{plan.budget_rub ? num(plan.budget_rub) : "—"}</div><div className="note">₽, примерно</div></div>
          </div>
        )}
      </Card>
      <div className="food-add">
        {TABS.map(([k, l]) => <button key={k} className={"chip" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "week" && <Week plan={plan} today={today} t={t} />}
      {tab === "cook" && <Cook plan={plan} id={row.id} />}
      {tab === "recipes" && <Recipes plan={plan} />}
      {tab === "shop" && <Shop plan={plan} id={row.id} />}
      {plan.tips?.length ? (
        <Card title="Советы" color="ring2">
          <ul className="steps">{plan.tips.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </Card>
      ) : null}
      <button className="btn ghost" onClick={onNew}>Составить новый рацион</button>
    </>
  );
}

function Week({ plan, today, t }: { plan: MealPlanBody; today: string; t: Targets | null }) {
  const [d, setD] = useState(weekdayKey(today));
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState("");
  const day = planDay(plan, d);
  const tot = dayTotals(plan, d);
  const isToday = d === weekdayKey(today);
  return (
    <Card>
      <div className="chips" style={{ flexWrap: "wrap" }}>
        {WEEK.map((k) => <button key={k} className={"chip" + (d === k ? " on" : "")} onClick={() => setD(k)}>{k}{k === weekdayKey(today) ? " · сегодня" : ""}</button>)}
      </div>
      {!day ? <p className="note">На этот день в рационе ничего нет.</p> : (
        <div className="list">
          {day.meals.map(([meal, id, n], i) => {
            const r = recipeOf(plan, id);
            if (!r) return null;
            const key = `${d}-${i}`;
            return (
              <div key={key} className="li">
                <div>
                  <div className="muted small">{MEALS.find((m) => m.key === meal)?.label ?? meal}</div>
                  <div className="n">{r.emoji ?? "🍽"} {r.name}{n !== 1 ? ` × ${num(n)}` : ""}</div>
                  <div className="note">{Math.round(r.kcal * n)} ккал · Б {Math.round(r.protein * n)} · Ж {Math.round(r.fat * n)} · У {Math.round(r.carbs * n)}</div>
                </div>
                {isToday && (
                  <button className={"chip" + (done[key] ? " on" : "")} disabled={done[key]}
                    onClick={async () => { try { await logRecipe(today, meal, r, n); setDone((x) => ({ ...x, [key]: true })); } catch (e) { setErr(String(e)); } }}>
                    {done[key] ? "Записано" : "Съел"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {err && <p className="note" style={{ color: "var(--bad)" }}>{err}</p>}
      <p className="note">
        За день: {Math.round(tot.kcal)} ккал, белок {Math.round(tot.protein)} г{t ? ` (норма ${t.kcal} и ${t.protein})` : ""}.
        {isToday ? " «Съел» записывает блюдо в дневник питания." : ""}
      </p>
    </Card>
  );
}

/** Отметки в списках (готовка, покупки) хранятся на телефоне. */
function useChecks(key: string) {
  const [c, setC] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try { setC(JSON.parse(localStorage.getItem(key) ?? "{}")); } catch {}
  }, [key]);
  const toggle = (k: string) => setC((x) => {
    const n = { ...x, [k]: !x[k] };
    try { localStorage.setItem(key, JSON.stringify(n)); } catch {}
    return n;
  });
  return [c, toggle] as const;
}

function Cook({ plan, id }: { plan: MealPlanBody; id: number }) {
  const [c, toggle] = useChecks(`hl-cook-${id}`);
  return (
    <>
      {plan.cook.map((s, i) => (
        <Card key={i} title={s.when} color="temp" right={s.min ? <span className="muted small">≈ {s.min} мин</span> : undefined}>
          {s.makes?.length ? <p className="note">Готовим: {s.makes.map((m) => recipeOf(plan, m)?.name ?? m).join(", ")}.</p> : null}
          <div className="check-list">
            {s.steps.map((x, j) => {
              const k = `${i}-${j}`;
              return (
                <label key={k} className={"check-row" + (c[k] ? " on" : "")}>
                  <input type="checkbox" checked={!!c[k]} onChange={() => toggle(k)} />
                  <span>{j + 1}. {x}</span>
                </label>
              );
            })}
          </div>
        </Card>
      ))}
    </>
  );
}

function Recipes({ plan }: { plan: MealPlanBody }) {
  return (
    <>
      {plan.recipes.map((r) => (
        <Card key={r.id} title={`${r.emoji ?? "🍽"} ${r.name}`} color="food">
          <div className="note">
            {r.portions} порц.{r.portion_g ? ` по ${r.portion_g} г` : ""}{r.time_min ? ` · ${r.time_min} мин` : ""} · на порцию {Math.round(r.kcal)} ккал, Б {Math.round(r.protein)} · Ж {Math.round(r.fat)} · У {Math.round(r.carbs)}
          </div>
          {r.keeps && <div className="note">Хранение: {r.keeps}</div>}
          <div className="stack-label">Продукты</div>
          <ul className="steps">{r.ingredients.map(([n, q], i) => <li key={i}>{n} — {q}</li>)}</ul>
          <div className="stack-label">Как готовить</div>
          <ol className="steps">{r.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
          <a className="link" href={photoLink(r.name)} target="_blank" rel="noreferrer">Фото готового блюда ›</a>
        </Card>
      ))}
    </>
  );
}

function Shop({ plan, id }: { plan: MealPlanBody; id: number }) {
  const [c, toggle] = useChecks(`hl-shop-${id}`);
  const groups = new Map<string, MealPlanBody["shop"]>();
  for (const x of plan.shop) groups.set(x.aisle ?? "Другое", [...(groups.get(x.aisle ?? "Другое") ?? []), x]);
  const total = plan.shop.reduce((a, x) => a + (x.rub ?? 0), 0);
  const left = plan.shop.filter((x) => !c[x.name]).reduce((a, x) => a + (x.rub ?? 0), 0);
  return (
    <>
      <Card>
        <div className="row-between">
          <div><div className="muted small">Всего примерно</div><div className="v" style={{ fontSize: 24, fontWeight: 700 }}>{num(total)} ₽</div></div>
          <div style={{ textAlign: "right" }}><div className="muted small">Осталось купить</div><div style={{ fontSize: 18, fontWeight: 600 }}>{num(left)} ₽</div></div>
        </div>
        <p className="note">Цены — оценка ИИ для Москвы, не из магазина. Точные цены и наличие смотрите в приложении «Пятёрочки» или на <a className="link" href="https://5ka.ru" target="_blank" rel="noreferrer">5ka.ru</a>.</p>
      </Card>
      {[...groups].map(([g, items]) => (
        <Card key={g} title={g} color="move">
          <div className="check-list">
            {items.map((x) => (
              <label key={x.name} className={"check-row" + (c[x.name] ? " on" : "")}>
                <input type="checkbox" checked={!!c[x.name]} onChange={() => toggle(x.name)} />
                <span style={{ flex: 1 }}>{x.name} — {x.qty}</span>
                {x.rub ? <span className="muted small">≈ {num(x.rub)} ₽</span> : null}
              </label>
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}
