"use client";

import { useEffect, useState } from "react";
import { Card } from "./ui";
import { supabase } from "@/lib/supabase";
import { mutate, useRpc } from "@/lib/data";

type State = "loading" | "unsupported" | "install" | "denied" | "off" | "on";

function b64ToBytes(b64: string) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** Утренняя сводка: подписка на уведомления (на iPhone — только из приложения на экране «Домой»). */
export function PushCard() {
  const info = useRpc<{ public_key: string | null; devices: number }>("hl_push_info", {});
  const [st, setSt] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        const ios = /iPhone|iPad/.test(navigator.userAgent);
        const standalone = (navigator as { standalone?: boolean }).standalone || matchMedia("(display-mode: standalone)").matches;
        setSt(ios && !standalone ? "install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setSt("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setSt(sub ? "on" : "off");
    })().catch(() => setSt("unsupported"));
  }, []);

  async function call(action: string) {
    const { data, error } = await supabase.functions.invoke("morning", { body: { action } });
    if (error) {
      let detail = "";
      try { detail = (await (error as { context?: Response }).context?.json())?.detail ?? ""; } catch {}
      throw new Error(detail || error.message);
    }
    return data;
  }

  async function enable() {
    setBusy(true);
    setMsg("");
    try {
      if ((await Notification.requestPermission()) !== "granted") return setSt("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const key = info.data?.public_key ?? (await call("vapid")).public_key;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
      await mutate("hl_push_save", { sub: sub.toJSON(), ua: navigator.userAgent.slice(0, 200) });
      await call("test");
      setSt("on");
      setMsg("Готово: пришло тестовое уведомление.");
      info.reload();
    } catch (e) {
      setMsg("Не получилось: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function now() {
    setBusy(true);
    setMsg("Готовлю сводку… до минуты.");
    try {
      const r = await call("now");
      setMsg(r?.sent ? "Сводка отправлена." : "Сводка готова, но уведомление не доставлено.");
    } catch (e) {
      setMsg("Не получилось: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  if (st === "loading") return null;
  return (
    <Card title="Утренняя сводка" color="ring2">
      {st === "install" && <p className="note">На iPhone уведомления работают только из приложения на экране «Домой»: в Safari нажмите «Поделиться» → «На экран Домой», откройте оттуда и включите здесь. Нужна iOS 16.4 или новее.</p>}
      {st === "unsupported" && <p className="note">Этот браузер не умеет получать уведомления. На iPhone откройте приложение с экрана «Домой».</p>}
      {st === "denied" && <p className="note">Уведомления запрещены. Включите их: Настройки iPhone → Уведомления → Здоровье Лаб.</p>}
      {st === "off" && (
        <>
          <p className="note">Каждое утро в 7:40: готовность, сон и совет тренера на день — тренироваться или отдыхать, белок, вода, когда лечь. Совет делает DeepSeek, ≈ 1 ₽ в день.</p>
          <button className="btn" onClick={enable} disabled={busy}>{busy ? "Включаю…" : "Включить уведомления"}</button>
        </>
      )}
      {st === "on" && (
        <>
          <p className="note">Включено: сводка приходит каждое утро в 7:40 по Москве.</p>
          <button className="btn ghost" onClick={now} disabled={busy}>Прислать сводку сейчас</button>
        </>
      )}
      {msg && <p className="note">{msg}</p>}
    </Card>
  );
}
