"use client";

import { useEffect, useState } from "react";

/**
 * Анимация техники: кадры «старт» и «финиш» сменяют друг друга, как GIF.
 * Нажатие открывает кадры на весь экран; нажатие по кадру — увеличение в 2,5 раза в точке касания.
 */
export function ExerciseMotion({ images, alt, size = "card", playing = true }: { images: string[]; alt: string; size?: "card" | "hero" | "wide"; playing?: boolean }) {
  const [frame, setFrame] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!playing || open || images.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % images.length), 1100);
    return () => clearInterval(t);
  }, [images.length, playing, open]);
  if (!images.length) return <div className={"motion " + size} aria-hidden />;
  return (
    <>
      <button type="button" className={"motion " + size} onClick={() => setOpen(true)} aria-label={`${alt}: открыть кадры крупно`}>
        {images.map((src, i) => (
          <img key={src} src={src} alt={i === 0 ? alt : ""} loading="lazy" decoding="async" style={{ opacity: i === frame ? 1 : 0 }} />
        ))}
        <span className="motion-zoom" aria-hidden>⤢</span>
      </button>
      {open && <Viewer images={images} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

function Viewer({ images, alt, onClose }: { images: string[]; alt: string; onClose: () => void }) {
  const [zoom, setZoom] = useState<{ i: number; x: number; y: number } | null>(null);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={alt}>
      <div className="viewer-top">
        <b>{alt}</b>
        <button type="button" className="link" onClick={onClose}>Закрыть</button>
      </div>
      <p className="note">Нажмите на кадр, чтобы приблизить. {images.length > 1 ? "Кадр 1 — старт, кадр 2 — финиш движения." : ""}</p>
      <div className="viewer-frames">
        {images.map((src, i) => {
          const z = zoom?.i === i ? zoom : null;
          return (
            <figure key={src}>
              <button
                type="button"
                className="viewer-img"
                onClick={(e) => {
                  if (z) return setZoom(null);
                  const r = e.currentTarget.getBoundingClientRect();
                  setZoom({ i, x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
                }}
                aria-label={z ? "Отдалить" : "Приблизить"}
              >
                <img src={src} alt={`${alt}, кадр ${i + 1}`} style={z ? { transform: "scale(2.5)", transformOrigin: `${z.x}% ${z.y}%` } : undefined} />
              </button>
              <figcaption className="note">{images.length > 1 ? (i === 0 ? "Старт" : i === images.length - 1 ? "Финиш" : `Кадр ${i + 1}`) : ""}</figcaption>
            </figure>
          );
        })}
      </div>
      <a className="btn ghost" style={{ textAlign: "center" }} href={`https://www.youtube.com/results?search_query=${encodeURIComponent(alt + " техника выполнения")}`} target="_blank" rel="noreferrer">
        Видео техники на YouTube
      </a>
    </div>
  );
}
