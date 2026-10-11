"use client";

import { Ring } from "@/components/charts";
import { Card, ErrorCard, Header, Loading } from "@/components/ui";
import { lastWith, num, useSummary } from "@/lib/data";
import { acwrState, dayInsight, readinessColor } from "@/lib/insights";

// Цель и вводные из ответов владельца (11.10.2026). На этапе 3 они переедут в БД
// и будут редактироваться здесь же.
const GOAL = {
  title: "Мышечная масса и выносливость",
  horizon: "6 месяцев, до апреля 2027",
  where: "Тренажёрный зал",
  level: "Средний опыт",
};

const SOON = [
  ["Ваш зал", "Сфотографируйте тренажёры. Тренер распознает их и соберёт список доступных упражнений."],
  ["План на день", "Каждое утро: упражнения, подходы, вес и отдых с учётом готовности и нагрузки за неделю."],
  ["Техника", "Картинка или анимация к каждому упражнению и короткие подсказки по технике."],
  ["Оценка прогресса", "После тренировки отмечаете веса и повторы. Раз в неделю тренер подводит итог и корректирует программу."],
];

export default function Coach() {
  const { data, error, reload } = useSummary(60);
  if (error) return <ErrorCard error={error} onRetry={reload} />;
  const load = data ? lastWith(data.load, (l) => l.readiness) : undefined;
  const r = load?.readiness != null ? Math.round(load.readiness) : null;
  const insight = data ? dayInsight(data.days, load) : null;
  const st = acwrState(data?.load[data.load.length - 1]?.acwr);

  return (
    <>
      <Header eyebrow="персональный тренер" title="Тренер" />
      <Card title="Цель" color="move">
        <div className="val m" style={{ fontSize: 22 }}>{GOAL.title}</div>
        <div className="note">
          {GOAL.horizon} · {GOAL.where} · {GOAL.level}
        </div>
      </Card>

      {!data ? (
        <Loading n={1} />
      ) : (
        <Card title="Сегодня" color={readinessColor(r)}>
          <div className="hero">
            <Ring value={r} color={`var(--${readinessColor(r)})`} size={96} label="готовн." />
            <div className="coach">
              <b>{insight?.head}</b> {insight?.body}
              <div className="note" style={{ marginTop: 6 }}>
                Нагрузка: {st.label.toLowerCase()} (ACWR {num(data.load[data.load.length - 1]?.acwr, 2)}).
              </div>
            </div>
          </div>
        </Card>
      )}

      <h2 className="h2">Скоро</h2>
      <Card>
        <div className="badge-soon">Этап 3, после подключения Claude API</div>
        <div className="list">
          {SOON.map(([t, d]) => (
            <div className="li" key={t} style={{ gridTemplateColumns: "1fr" }}>
              <div className="n">{t}</div>
              <div className="note">{d}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
