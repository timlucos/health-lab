"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Md } from "@/components/Md";
import { Card, ErrorCard, Header, Loading } from "@/components/ui";
import { useAiReports, useAiSpend } from "@/lib/data";
import { KIND, modelName, rub } from "@/lib/ai";

export default function ReportsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Reports />
    </Suspense>
  );
}

const FILTERS: [string, string][] = [["", "Все"], ["health", "Здоровье"], ["weekly", "Неделя"], ["workout", "Тренировки"], ["daily", "День"], ["chat", "Вопросы"], ["mealplan", "Рацион"], ["food", "Еда"]];

const when = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

/** Все разборы ИИ, сохранённые как сессии: когда, что, какой моделью и сколько стоило. */
function Reports() {
  const k = useSearchParams().get("k") ?? "";
  const router = useRouter();
  const list = useAiReports(k || null, 100);
  const spend = useAiSpend();
  const [open, setOpen] = useState<number | null>(null);

  if (list.error) return <ErrorCard error={list.error} onRetry={list.reload} />;
  const rows = [...(list.data ?? [])].reverse();

  return (
    <>
      <Header eyebrow="тренер" title="Разборы">
        <Link href="/coach" className="muted small">‹ Тренер</Link>
      </Header>

      {spend.data && (
        <Card>
          <div className="stats">
            <div><div className="k">В этом месяце</div><div className="v">{rub(spend.data.month_rub) || "0 ₽"}</div></div>
            <div><div className="k">Запросов</div><div className="v">{spend.data.month_n}</div></div>
            <div><div className="k">В среднем</div><div className="v">{rub(spend.data.avg_rub) || "—"}</div></div>
          </div>
          <p className="note">Совет на день, вопросы и разбор тренировки делает DeepSeek (≈0,3–1 ₽). Недельный разбор, здоровье и рацион — Claude (≈3–25 ₽).</p>
        </Card>
      )}

      <div className="chips" style={{ flexWrap: "wrap" }}>
        {FILTERS.map(([key, label]) => (
          <button key={key} className={"chip" + (k === key ? " on" : "")} onClick={() => router.replace(key ? `/coach/reports?k=${key}` : "/coach/reports")}>{label}</button>
        ))}
      </div>

      {!list.data ? <Loading n={3} /> : rows.length === 0 ? (
        <Card><p className="note">Пока пусто. Каждый разбор и ответ ИИ сохраняется здесь: дата, модель и цена.</p></Card>
      ) : (
        rows.map((r, i) => {
          const meta = KIND[r.kind] ?? { label: r.kind, color: "air" };
          const isOpen = open === r.id || (open == null && i === 0 && r.kind !== "food" && r.kind !== "mealplan");
          const prev = rows.slice(i + 1).find((x) => x.kind === r.kind);
          return (
            <Card key={r.id} title={meta.label} color={meta.color} right={<span className="muted small">{rub(r.cost_rub)}</span>}>
              <button className="report-head" onClick={() => setOpen(isOpen ? -1 : r.id)} aria-expanded={isOpen}>
                <span>{when(r.created_at)}{r.model ? ` · ${modelName(r.model)}` : ""}</span>
                <span className="muted">{isOpen ? "Свернуть" : "Открыть"}</span>
              </button>
              {r.question && r.kind !== "mealplan" && <div className="bubble me" style={{ alignSelf: "stretch" }}>{r.question}</div>}
              {isOpen && (r.kind === "food" ? <FoodAnswer text={r.answer} /> : r.kind === "mealplan" ? (
                <Link className="link" href={`/food/plan?id=${r.answer.match(/\d+/)?.[0] ?? ""}`}>Открыть рацион ›</Link>
              ) : <Md text={r.answer} />)}
              {isOpen && prev && (r.kind === "weekly" || r.kind === "health") && (
                <button className="link" onClick={() => setOpen(prev.id)}>Прошлый такой разбор: {when(prev.created_at)}</button>
              )}
            </Card>
          );
        })
      )}
    </>
  );
}

function FoodAnswer({ text }: { text: string }) {
  try {
    const j = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "") as { items?: { name: string; grams: number; kcal_100: number }[]; name?: string; kcal?: number; note?: string };
    if (j.items) return <p className="note">{j.items.map((x) => `${x.name} ${Math.round(x.grams)} г ≈ ${Math.round((x.kcal_100 * x.grams) / 100)} ккал`).join(" · ")}{j.note ? `. ${j.note}` : ""}</p>;
    if (j.name) return <p className="note">{j.name}: {j.kcal} ккал на 100 г</p>;
  } catch {}
  return <p className="note">{text.slice(0, 300)}</p>;
}
