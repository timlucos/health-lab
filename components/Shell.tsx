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
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "link" | "sent">("password");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const remember = (addr: string) => {
    try {
      localStorage.setItem("hl-email", addr);
    } catch {}
  };

  // Вход по паролю работает прямо в приложении с экрана «Домой» (у него своя память, отдельная от Safari).
  // Ссылка из письма нужна один раз: войти в Safari и задать пароль.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const addr = email.trim().toLowerCase();
    remember(addr);
    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({ email: addr, password });
      if (error) setMsg(/invalid/i.test(error.message) ? "Почта или пароль не подошли. Если пароля ещё нет, войдите по ссылке и задайте его." : error.message);
    } else {
      const { error } = await supabase.auth.signInWithOtp({ email: addr, options: { emailRedirectTo: window.location.origin } });
      if (error) setMsg(/rate|seconds/i.test(error.message) ? "Письмо уже отправлено. Новое можно запросить через минуту." : error.message);
      else setMode("sent");
    }
    setBusy(false);
  }

  return (
    <div className="center">
      <form className="login" onSubmit={submit}>
        <img className="logo" src="/icon.svg" alt="" />
        <h1 className="title" style={{ fontSize: 28 }}>
          Health Lab
        </h1>
        {mode === "sent" ? (
          <>
            <p className="note" style={{ fontSize: 15 }}>
              Ссылка отправлена на {email}. Откройте её в Safari, задайте пароль в приложении, и дальше входите по паролю.
            </p>
            <button type="button" className="link" onClick={() => setMode("password")}>
              Войти по паролю
            </button>
          </>
        ) : (
          <>
            <input className="field" type="email" required autoComplete="username" inputMode="email" placeholder="почта" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Почта" />
            {mode === "password" && (
              <input className="field" type="password" required autoComplete="current-password" placeholder="пароль" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Пароль" />
            )}
            <button className="btn" disabled={busy || !email || (mode === "password" && !password)}>
              {busy ? "Секунду…" : mode === "password" ? "Войти" : "Получить ссылку"}
            </button>
            <button type="button" className="link" onClick={() => (setMode(mode === "password" ? "link" : "password"), setMsg(""))}>
              {mode === "password" ? "Нет пароля? Войти по ссылке из письма" : "Войти по паролю"}
            </button>
          </>
        )}
        {msg && <p className="note" style={{ color: "var(--bad)" }}>{msg}</p>}
      </form>
    </div>
  );
}

/** Задать или сменить пароль. Показывается на «Сегодня», пока пароля нет, и всегда в «Данных». */
export function PasswordCard({ onlyIfMissing = false }: { onlyIfMissing?: boolean }) {
  const [has, setHas] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setHas(!!data.user?.user_metadata?.has_password));
  }, []);
  if (has === null || (onlyIfMissing && has)) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const { error } = await supabase.auth.updateUser({ password: pw, data: { has_password: true } });
    if (error) {
      setState("error");
      setMsg(/should be|characters|weak/i.test(error.message) ? "Пароль слишком простой: нужно не меньше 6 символов." : error.message);
    } else {
      setState("done");
      setHas(true);
      setPw("");
    }
  }

  return (
    <form className="card" onSubmit={save} style={onlyIfMissing ? { border: "1px solid color-mix(in srgb, var(--air) 40%, transparent)" } : undefined}>
      <span className="card-t" style={{ color: "var(--air)" }}>
        <i />
        {has ? "Сменить пароль" : "Задайте пароль"}
      </span>
      {state === "done" ? (
        <p className="note">Пароль сохранён. Теперь откройте приложение с экрана «Домой» и войдите с почтой и этим паролем, один раз.</p>
      ) : (
        <>
          {!has && <p className="note">С паролем приложение на экране «Домой» входит один раз и дальше помнит вас.</p>}
          <input className="field" type="password" autoComplete="new-password" minLength={6} required placeholder="новый пароль" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="Новый пароль" />
          <button className="btn" disabled={state === "busy" || pw.length < 6}>
            {state === "busy" ? "Сохраняю…" : "Сохранить пароль"}
          </button>
          {state === "error" && <p className="note" style={{ color: "var(--bad)" }}>{msg}</p>}
        </>
      )}
    </form>
  );
}
