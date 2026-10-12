import { num, type AiReport } from "./data";

/** Подписи и цвета видов разборов ИИ. */
export const KIND: Record<AiReport["kind"], { label: string; color: string }> = {
  daily: { label: "Совет на день", color: "ring1" },
  workout: { label: "Разбор тренировки", color: "load" },
  weekly: { label: "Недельный разбор", color: "ring2" },
  health: { label: "Разбор здоровья", color: "ring3" },
  chat: { label: "Вопрос тренеру", color: "air" },
  food: { label: "Распознавание еды", color: "food" },
  mealplan: { label: "Рацион на неделю", color: "food" },
};
export const modelName = (m: string | null | undefined) => (!m ? "" : /claude/i.test(m) ? "Claude" : /deepseek/i.test(m) ? "DeepSeek" : /gpt/i.test(m) ? "GPT" : /gemini/i.test(m) ? "Gemini" : m);
export const rub = (v: number | null | undefined) => (v == null ? "" : `${num(v, v < 10 ? 2 : 1)} ₽`);
