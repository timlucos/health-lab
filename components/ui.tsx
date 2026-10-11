"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ApiError, SPANS } from "@/lib/data";
import { signOut } from "./Shell";

export function Card({ title, color, right, href, children, className = "" }: { title?: ReactNode; color?: string; right?: ReactNode; href?: string; children?: ReactNode; className?: string }) {
  const head =
    title || right ? (
      <div className="row-between">
        {title ? (
          <span className="card-t" style={color ? { color: `var(--${color})` } : undefined}>
            {color && <i />}
            {title}
          </span>
        ) : (
          <span />
        )}
        {right ?? (href ? <span className="chev" /> : null)}
      </div>
    ) : null;
  if (href)
    return (
      <Link href={href} className={"card " + className}>
        {head}
        {children}
      </Link>
    );
  return (
    <section className={"card " + className}>
      {head}
      {children}
    </section>
  );
}

export function Header({ eyebrow, title, children }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="header">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1 className="title">{title}</h1>
      {children}
    </header>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { key: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} role="tab" aria-selected={o.key === value} className={o.key === value ? "on" : ""} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export type SpanKey = (typeof SPANS)[number]["key"];
export const spanDays = (k: SpanKey) => SPANS.find((s) => s.key === k)!.days;

export function SpanSeg({ value, onChange }: { value: SpanKey; onChange: (v: SpanKey) => void }) {
  return <Seg value={value} options={SPANS} onChange={onChange} label="Период" />;
}

export function Loading({ n = 3 }: { n?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </>
  );
}

export function ErrorCard({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  if (error.code === "forbidden")
    return (
      <Card title="Нет доступа" className="error">
        <p className="note">Эта почта не владелец данных. Войдите с почтой владельца.</p>
        <button className="btn ghost" onClick={() => signOut()}>
          Выйти
        </button>
      </Card>
    );
  return (
    <Card title="Не удалось загрузить данные" className="error">
      <p className="note">{error.code === "network" ? "Нет связи с сервером." : error.message}</p>
      <button className="btn ghost" onClick={onRetry}>
        Повторить
      </button>
    </Card>
  );
}

/** Подпись отклонения от нормы: стрелка и разница. good = в какую сторону хорошо. */
export function Delta({ value, base, digits = 0, unit = "", good = "up" }: { value: number | null | undefined; base: number | null | undefined; digits?: number; unit?: string; good?: "up" | "down" | "none" }) {
  if (value == null || base == null) return null;
  const d = value - base;
  const eps = Math.max(Math.abs(base) * 0.03, 10 ** -digits);
  if (Math.abs(d) < eps) return <span className="delta muted">как обычно</span>;
  const better = good === "none" ? null : (d > 0) === (good === "up");
  const color = better == null ? "var(--muted)" : better ? "var(--ok)" : "var(--warn)";
  return (
    <span className="delta" style={{ color }}>
      {d > 0 ? "▲" : "▼"} {Math.abs(d).toLocaleString("ru-RU", { maximumFractionDigits: digits })}
      {unit} к норме
    </span>
  );
}
