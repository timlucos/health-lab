"use client";

import { useEffect, useRef, useState } from "react";

/** Сканер штрихкодов камерой. На iPhone встроенного BarcodeDetector нет, поэтому ZXing (WASM) с нашего сервера. */
export function BarcodeScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState("");
  const done = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let live = true;
    (async () => {
      try {
        const { BarcodeDetector, setZXingModuleOverrides } = await import("barcode-detector/ponyfill");
        setZXingModuleOverrides({ locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? "/zxing_reader.wasm" : prefix + path) });
        const det = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
        if (!live || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = async () => {
          if (!live || done.current || !video.current) return;
          try {
            const found = await det.detect(video.current);
            const code = found.find((b) => /^\d{8,14}$/.test(b.rawValue))?.rawValue;
            if (code) {
              done.current = true;
              navigator.vibrate?.(60);
              onCode(code);
              return;
            }
          } catch {}
          timer = setTimeout(tick, 200);
        };
        tick();
      } catch (e) {
        setErr(e instanceof Error && e.name === "NotAllowedError" ? "Нет доступа к камере. Разрешите камеру для сайта в настройках Safari или введите код вручную." : "Камера недоступна. Введите код вручную.");
      }
    })();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <div className="scanner">
      {err ? <p className="note" style={{ color: "var(--warn)" }}>{err}</p> : (
        <>
          <video ref={video} playsInline muted />
          <div className="scanner-frame" aria-hidden />
          <p className="note">Наведите камеру на штрихкод упаковки.</p>
        </>
      )}
    </div>
  );
}
