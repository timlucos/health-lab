"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { clearCache } from "@/lib/data";

const I = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const TABS = [
  { href: "/", label: "Сегодня", icon: I("M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z") },
  { href: "/sleep", label: "Сон", icon: I("M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z") },
  { href: "/load", label: "Нагрузка", icon: I("M3 12h4l3-8 4 16 3-8h4") },
  { href: "/coach", label: "Тренер", icon: I("M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12") },
  { href: "/data", label: "Данные", icon: I("M4 20V10M10 20V4M16 20v-7M22 20H2") },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div className="center" aria-busy="true" />;
  if (!session) return <Login />;

  const active = (href: string) => (href === "/" ? path === "/" || path.startsWith("/day") : path.startsWith(href));
  return (
    <div className="shell">
      <nav className="tabs" aria-label="Разделы">
        <div className="brand">
          Health <span>Lab</span>
        </div>
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={"tab" + (active(t.href) ? " on" : "")} aria-current={active(t.href) ? "page" : undefined}>
            {t.icon}
            {t.label}
          </Link>
        ))}
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}

export async function signOut() {
  clearCache();
  await supabase.auth.signOut();
}

function Login() {
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem("hl-email") ?? "";
    } catch {
      return "";
    }
  });
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Вход по коду из письма прямо в приложении: у значка на экране «Домой» своя память,
  // поэтому ссылка, открытая в Safari, сюда сессию не передаёт. Сессия хранится до выхода.
  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setMsg("");
    const addr = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithOtp({ email: addr, options: { emailRedirectTo: window.location.origin, shouldCreateUser: true } });
    setBusy(false);
    if (error) return setMsg(/rate|seconds/i.test(error.message) ? "Письмо уже отправлено. Новое можно запросить через минуту." : error.message);
    try {
      localStorage.setItem("hl-email", addr);
    } catch {}
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setMsg(/expired|invalid/i.test(error.message) ? "Код не подошёл или устарел. Запросите новый." : error.message);
  }

  return (
    <div className="center">
      <form className="login" onSubmit={step === "email" ? send : verify}>
        <img className="logo" src="/icon.svg" alt="" />
        <h1 className="title" style={{ fontSize: 28 }}>
          Health Lab
        </h1>
        {step === "email" ? (
          <>
            <p className="note" style={{ fontSize: 15 }}>
              Войдите по почте. Пароль не нужен: придёт письмо с кодом. Входить нужно один раз.
            </p>
            <input className="field" type="email" required autoComplete="email" inputMode="email" placeholder="почта" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Почта" />
            <button className="btn" disabled={busy || !email}>
              {busy ? "Отправляю…" : "Получить код"}
            </button>
          </>
        ) : (
          <>
            <p className="note" style={{ fontSize: 15 }}>
              Код отправлен на {email}. Введите цифры из письма. Ссылку в письме нажимать не нужно.
            </p>
            <input
              className="field code"
              required
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={10}
              placeholder="код из письма"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              aria-label="Код из письма"
            />
            <button className="btn" disabled={busy || code.length < 6}>
              {busy ? "Проверяю…" : "Войти"}
            </button>
            <div className="row-between">
              <button type="button" className="link" onClick={() => (setStep("email"), setCode(""), setMsg(""))}>
                Другая почта
              </button>
              <button type="button" className="link" disabled={busy} onClick={() => send()}>
                Отправить код ещё раз
              </button>
            </div>
          </>
        )}
        {msg && <p className="note" style={{ color: "var(--bad)" }}>{msg}</p>}
      </form>
    </div>
  );
}
