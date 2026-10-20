"use client";
import { useEffect, useState } from "react";

/** Form state that survives going back and forth between steps (this tab only). */
export function usePersisted<T>(key: string, initial: T): [T, (v: T | ((old: T) => T)) => void] {
  const [v, setV] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try { const raw = sessionStorage.getItem(`likha-form-${key}`); if (raw) setV({ ...initial, ...JSON.parse(raw) }); } catch { /* ignore */ }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (!loaded) return;
    try { sessionStorage.setItem(`likha-form-${key}`, JSON.stringify(v)); } catch { /* ignore */ }
  }, [key, v, loaded]);
  return [v, setV];
}
