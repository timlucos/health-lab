"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, ErrorCard, Header, Loading } from "@/components/ui";
import {
  localToday, mutate, num, useGoal, useMealPlan, useProgress, useRecipes, useSummary,
  type MealPlanBody, type MealPlanRow,
} from "@/lib/data";
import { rub } from "@/lib/ai";
import { MEALS, targets, type Targets } from "@/lib/nutrition";
import { buildWeekPlan } from "@/lib/weekplan";
import { WEEK, dayTotals, planDay, recipeOf, useAte, weekdayKey } from "@/lib/mealplan";

export default function PlanPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Plan />
    </Suspense>
  );
}

const PREFS_KEY = "hl-mealplan-prefs";
type Prefs = { cook: string; meals: string; dislikes: string };
const DEFAULT: Prefs = { cook: "воскресенье и среда", meals: "4", dislikes: "рыба" };
const PREF_FIELDS: [keyof Prefs, string, string][] = [
  ["meals", "Приёмов пищи в день", "3, 4 или 5"],
  ["cook", "Когда готовить впрок", "воскресенье и среда"],
  ["dislikes", "Не ем / аллергия", "например рыба, грибы"],
];

function loadPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    // 13.10: рыбу он почти не ест — исключаем по умолчанию и в старых сохранённых настройках.
    if (!saved.v2) saved.dislikes = [saved.dislikes, "рыба"].filter((x: string) => x?.trim()).join(", ");
    return { ...DEFAULT, ...saved };
  } catch {
    return DEFAULT;
  }
}

function Plan() {
  const idParam = Number(useSearchParams().get("id")) || null;
  const sum = useSummary(60);
  const today = localToday(sum.data?.tz);
  const st = useMealPlan(idParam);
  const router = useRouter();
  const goal = useGoal();
  const pr = useProgress(8);
  const weight = pr.data?.checkins.filter((c) => c.weight_kg != null).at(-1)?.weight_kg ?? null;
  const t = targets(goal.data?.details, weight);
  const [form, setForm] = useState(false);
  const row = st.data?.plan ?? null;
  const pending = row?.status === "pending" && Date.now() - Date.parse(row.created_at) < 5 * 60e3;

  // Старые рационы от ИИ могли составляться в фоне: пока такой в работе, проверяем каждые 6 секунд.
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
              <p className="note">Составляется прошлый рацион от ИИ. Если ответ не придёт за 5 минут, просто соберите новый из базы рецептов.</p>
              <div className="skeleton" style={{ height: 8 }} />
            </Card>
          )}
          {row?.status === "error" && !form && <p className="note" style={{ color: "var(--bad)" }}>Не получилось составить рацион: {row.error ?? "ошибка ИИ"}. Попробуйте ещё раз.</p>}
          {row?.status === "pending" && !pending && !form && <p className="note" style={{ color: "var(--bad)" }}>Ответ так и не пришёл. Попробуйте ещё раз.</p>}
          {showForm && !pending && <PlanForm today={today} t={t} onStarted={() => { setForm(false); if (idParam) router.replace("/food/plan"); else st.reload(); }} />}
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

function PlanForm({ t, today, onStarted }: { today: string; t: Targets | null; onStarted: () => void }) {
  const rs = useRecipes();
  const [p, setP] = useState<Prefs>(DEFAULT);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => setP(loadPrefs()), []);

  async function go() {
    if (!t || !rs.data) return;
    setBusy(true);
    setErr("");
    try {
      try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...p, v2: true })); } catch {}
      let have: string[] = [];
      try { have = JSON.parse(localStorage.getItem("hl-have") ?? "[]"); } catch {}
      const plan = buildWeekPlan(rs.data, t, { meals: Math.min(5, Math.max(3, Number(p.meals) || 4)), dislikes: p.dislikes, have, cook: p.cook });
      const pid = (await mutate("hl_meal_plan_start", { ws: today, prefs: p })) as number;
      await mutate("hl_meal_plan_finish", { pid, plan, err: null, model: "база рецептов", cost_rub: null });
      onStarted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Новый рацион" color="food">
      <p className="note">
        Меню на 7 дней из проверенной базы рецептов: обед готовится впрок 2 раза в неделю, порции подогнаны под вашу норму, есть список покупок.
        Продукты, отмеченные в «Рецептах» как «есть дома», идут в дело первыми. Бесплатно и сразу, без ИИ.
        {t ? ` Норма: ${t.kcal} ккал, белок ${t.protein} г.` : ""}
      </p>
      {!t && <p className="note" style={{ color: "var(--warn)" }}>Укажите вес в «Цели» или в «Прогрессе»: без него не посчитать норму.</p>}
      {PREF_FIELDS.map(([k, label, ph]) => (
        <label key={k} className="stack-label">
          <span>{label}</span>
          <input className="field" value={p[k]} placeholder={ph} inputMode={k === "meals" ? "numeric" : undefined}
            onChange={(e) => setP((x) => ({ ...x, [k]: e.target.value }))} />
        </label>
      ))}
      {err && <p className="note" style={{ color: "var(--bad)" }}>{err}</p>}
      {rs.error && <p className="note" style={{ color: "var(--bad)" }}>Не загрузилась база рецептов. Обновите страницу.</p>}
      <button className="btn" onClick={go} disabled={busy || !t || !rs.data}>{busy ? "Собираю…" : "Составить рацион"}</button>
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
  const ate = useAte(today);
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
                  {/^r\d+$/.test(r.id)
                    ? <div className="n">{r.emoji ?? "🍽"} {r.name}{n !== 1 ? ` × ${num(n)}` : ""}</div>
                    : <Link className="n plan-dish" href={`/food/cook?r=${r.id}&n=${Math.max(1, Math.round(n))}`}>{r.emoji ?? "🍽"} {r.name}{n !== 1 ? ` × ${num(n)}` : ""} ›</Link>}
                  <div className="note">{Math.round(r.kcal * n)} ккал · Б {Math.round(r.protein * n)} · Ж {Math.round(r.fat * n)} · У {Math.round(r.carbs * n)}</div>
                </div>
                {isToday && (
                  <button className={"chip" + (ate.state(meal, id) === "done" ? " on" : "")} disabled={!!ate.state(meal, id)}
                    onClick={async () => { setErr(""); try { await ate.eat(meal, r, n); } catch (e) { setErr("Не записалось: " + (e instanceof Error ? e.message : String(e))); } }}>
                    {ate.state(meal, id) === "done" ? "Записано" : ate.state(meal, id) === "busy" ? "…" : "Съел"}
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
        {isToday ? " «Съел» записывает блюдо в дневник питания." : ""} Нажмите на блюдо — откроется готовка по шагам.
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
          {!/^r\d+$/.test(r.id) && <Link className="btn" style={{ textAlign: "center" }} href={`/food/cook?r=${r.id}&n=${r.portions}`}>Готовить по шагам</Link>}
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
        <p className="note">Сумма — целыми упаковками, как в чеке; запасы (масло, мёд, протеин) в неё не входят. Цены — примерная оценка для Москвы, не из магазина. Точные цены и наличие смотрите в приложении «Пятёрочки» или на <a className="link" href="https://5ka.ru" target="_blank" rel="noreferrer">5ka.ru</a>.</p>
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
