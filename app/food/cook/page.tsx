"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, ErrorCard, Header, Loading } from "@/components/ui";
import { localToday, mutate, num, useRecipes } from "@/lib/data";
import { FOOD_EMOJI, scaledQty, stepArt } from "@/lib/cookart";
import { MEALS, mealNow } from "@/lib/nutrition";

// Режим готовки (просьба 13.10): блюдо открывается и ведёт по шагам — картинка шага, крупный текст, таймер,
// экран не гаснет. Количество продуктов пересчитывается на нужное число порций.

export default function CookPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Cook />
    </Suspense>
  );
}

function Cook() {
  const qs = useSearchParams();
  const slug = qs.get("r");
  const rs = useRecipes();
  const r = rs.data?.find((x) => x.slug === slug);
  const [n, setN] = useState<number | null>(null);
  const [step, setStep] = useState(-1);
  const [got, setGot] = useState<Record<number, boolean>>({});
  const [msg, setMsg] = useState("");
  useWakeLock(step >= 0);

  useEffect(() => {
    if (r && n == null) setN(Math.max(1, Math.round(Number(qs.get("n")) || r.servings)));
  }, [r, n, qs]);

  if (rs.error) return <ErrorCard error={rs.error} onRetry={rs.reload} />;
  if (!rs.data) return <Loading n={3} />;
  if (!r) return <Card><p className="note">Рецепт не найден. <Link className="link" href="/food/recipes">Все рецепты ›</Link></p></Card>;

  const portions = n ?? r.servings;
  const f = portions / Math.max(r.servings, 1);
  const s = step >= 0 ? r.steps[step] : null;
  const art = s ? stepArt(s, r.ingredients) : null;

  async function eat() {
    setMsg("");
    try {
      await mutate("hl_food_add", { d: localToday(), meal: mealNow(), items: [{ name: r!.name, grams: r!.portion_g ?? 300, kcal: r!.kcal, protein: r!.protein, fat: r!.fat, carbs: r!.carbs, product_id: null, source: "recipe" }] });
      await mutate("hl_recipe_mark", { s: r!.slug, fav_: null, cooked_: true }).catch(() => {});
      setMsg(`Порция записана в «${MEALS.find((m) => m.key === mealNow())?.label}».`);
    } catch (e) {
      setMsg("Не записалось: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <>
      <Header eyebrow="готовим" title={<span>{r.emoji ?? "🍽"} {r.name}</span>}>
        <Link href="/food/recipes" className="muted small">‹ Рецепты</Link>
      </Header>

      {step < 0 ? (
        <>
          <Card color="food" title="На порцию" right={r.time_min ? <span className="muted small">{r.time_min} мин</span> : undefined}>
            <div className="macro-row">
              <div><b>{Math.round(r.kcal)}</b><small>ккал</small></div>
              <div><b>{num(r.protein, 0)}</b><small>белок</small></div>
              <div><b>{num(r.fat, 0)}</b><small>жиры</small></div>
              <div><b>{num(r.carbs, 0)}</b><small>углев.</small></div>
            </div>
            <div className="row-between">
              <span className="note">Порций</span>
              <div className="stepper">
                <button className="chip" onClick={() => setN(Math.max(1, portions - 1))} aria-label="Меньше порций">−</button>
                <b>{portions}</b>
                <button className="chip" onClick={() => setN(Math.min(14, portions + 1))} aria-label="Больше порций">+</button>
              </div>
            </div>
          </Card>

          <Card title="Продукты" color="move" right={<span className="muted small">{Object.values(got).filter(Boolean).length}/{r.ingredients.length}</span>}>
            <div className="ingr-grid">
              {r.ingredients.map((i, k) => (
                <button key={k} className={"ingr-tile" + (got[k] ? " on" : "")} onClick={() => setGot((x) => ({ ...x, [k]: !x[k] }))} aria-pressed={!!got[k]}>
                  <span className="ingr-emoji" aria-hidden>{FOOD_EMOJI[i.key] ?? "🥄"}</span>
                  <span className="ingr-name">{i.name}</span>
                  <span className="muted small">{scaledQty(i, f)}</span>
                </button>
              ))}
            </div>
            <p className="note">Нажмите на продукт, когда он на столе.</p>
          </Card>

          <Card title="Шаги" color="temp">
            <ol className="steps">{r.steps.map((x, k) => <li key={k}>{x}</li>)}</ol>
            {r.tip && <p className="note">💡 {r.tip}</p>}
          </Card>
          <button className="btn" onClick={() => setStep(0)}>Начать готовить</button>
        </>
      ) : (
        <>
          <div className="cook-progress" aria-hidden>{r.steps.map((_, k) => <i key={k} className={k <= step ? "on" : ""} />)}</div>
          <Card className="cook-step">
            <div className="muted small">Шаг {step + 1} из {r.steps.length}</div>
            {art && (art.foods.length > 0 || art.acts.length > 0) && (
              <div className="cook-art" aria-hidden>
                {art.foods.length > 0 && <span className="cook-foods">{art.foods.join(" ")}</span>}
                {art.foods.length > 0 && art.acts.length > 0 && <span className="cook-arrow">→</span>}
                {art.acts.map((a) => <span key={a.l} className="cook-act"><span>{a.e}</span><small>{a.l}</small></span>)}
              </div>
            )}
            <p className="cook-text">{s}</p>
            {art?.min ? <Timer key={step} min={art.min} /> : null}
          </Card>
          <div className="row2">
            <button className="btn ghost" onClick={() => setStep(step - 1)}>{step === 0 ? "К продуктам" : "Назад"}</button>
            {step < r.steps.length - 1
              ? <button className="btn" onClick={() => setStep(step + 1)}>Дальше</button>
              : <button className="btn" onClick={() => { setStep(-1); eat(); }}>Готово, съел порцию</button>}
          </div>
          {r.tip && step === r.steps.length - 1 && <p className="note">💡 {r.tip}</p>}
          <p className="note" style={{ textAlign: "center" }}>Экран не погаснет, пока вы готовите.</p>
        </>
      )}
      {msg && <p className="note" style={{ color: msg.startsWith("Не") ? "var(--bad)" : "var(--ok)" }}>{msg}</p>}
    </>
  );
}

/** Таймер шага: по окончании — вибрация и звуковой сигнал. */
function Timer({ min }: { min: number }) {
  const [left, setLeft] = useState<number | null>(null);
  const end = useRef(0);
  useEffect(() => {
    if (left == null || left <= 0) return;
    const h = setInterval(() => {
      const l = Math.max(0, Math.round((end.current - Date.now()) / 1000));
      setLeft(l);
      if (l === 0) {
        navigator.vibrate?.([300, 150, 300, 150, 300]);
        try {
          const ctx = new AudioContext();
          const o = ctx.createOscillator();
          o.frequency.value = 880;
          o.connect(ctx.destination);
          o.start();
          o.stop(ctx.currentTime + 0.6);
        } catch {}
      }
    }, 500);
    return () => clearInterval(h);
  }, [left]);
  if (left == null) return <button className="btn ghost" onClick={() => { end.current = Date.now() + min * 60e3; setLeft(min * 60); }}>⏲ Таймер на {min} мин</button>;
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, "0");
  return (
    <div className="row-between">
      <span className="cook-timer" style={{ color: left === 0 ? "var(--ok)" : undefined }}>{left === 0 ? "Готово!" : `${mm}:${ss}`}</span>
      <button className="link" onClick={() => setLeft(null)}>Сбросить</button>
    </div>
  );
}

/** Не даём экрану погаснуть во время готовки (iOS 16.4+ и Chrome). */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    const get = () => (navigator as Navigator & { wakeLock: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    get();
    const vis = () => document.visibilityState === "visible" && get();
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      lock?.release().catch(() => {});
    };
  }, [on]);
}
