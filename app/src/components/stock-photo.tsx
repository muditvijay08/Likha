"use client";
// A stock mood photo (lib/photos.ts). If it can't load, it disappears and the warm background behind it shows instead.
// A photo that failed before the page became interactive is caught on mount (onError would have been missed).
import { useEffect, useRef, useState } from "react";
import { PHOTOS, pexels, pexelsSet, type PhotoKey } from "@/lib/photos";

export function StockPhoto({ name, sizes = "(max-width: 900px) 100vw, 33vw", style, eager = false }:
  { name: PhotoKey; sizes?: string; style?: React.CSSProperties; eager?: boolean }) {
  const [gone, setGone] = useState(false);
  const ref = useRef<HTMLImageElement | null>(null);
  useEffect(() => { const i = ref.current; if (i && i.complete && i.naturalWidth === 0) setGone(true); }, []);
  const p = PHOTOS[name];
  if (gone) return null;
  return (
    <img ref={ref} src={pexels(p.id, 800)} srcSet={pexelsSet(p.id)} sizes={sizes} alt={p.alt} loading={eager ? "eager" : "lazy"} decoding="async"
      onError={() => setGone(true)}
      style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", color: "transparent", ...style }} />
  );
}
