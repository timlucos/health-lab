"use client";

import { useEffect, useState } from "react";

/** Анимация техники: картинки «старт» и «финиш» сменяют друг друга, как GIF. */
export function ExerciseMotion({ images, alt, size = "card", playing = true }: { images: string[]; alt: string; size?: "card" | "hero"; playing?: boolean }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!playing || images.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % images.length), 1100);
    return () => clearInterval(t);
  }, [images.length, playing]);
  if (!images.length) return <div className={"motion " + size} aria-hidden />;
  return (
    <div className={"motion " + size}>
      {images.map((src, i) => (
        <img key={src} src={src} alt={i === 0 ? alt : ""} loading="lazy" decoding="async" style={{ opacity: i === frame ? 1 : 0 }} />
      ))}
    </div>
  );
}
