"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { Place } from "@/lib/api";
import { searchPlaces, type Suggestion } from "@/lib/places";
import { Pin } from "./ui";

/** City search with keyboard support and Google attribution. */
export function PlaceInput({ id, label, value, onPick, placeholder, required }: {
  id: string; label: string; value: Place | null; onPick(p: Place): void; placeholder?: string; required?: boolean;
}) {
  const [text, setText] = useState(value?.label ?? "");
  const [list, setList] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const seq = useRef(0);

  useEffect(() => { if (value) setText(value.label); }, [value]);

  useEffect(() => {
    if (!open) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      const r = await searchPlaces(text);
      if (my === seq.current) { setList(r); setActive(0); }
    }, 200);
    return () => clearTimeout(t);
  }, [text, open]);

  async function pick(s: Suggestion) {
    const p = await s.resolve();
    setText(p.label); setOpen(false); setList([]);
    onPick(p);
  }

  const boldMatch = (s: Suggestion) => {
    const i = s.label.toLowerCase().indexOf(text.trim().toLowerCase());
    if (i !== 0 || !text.trim()) return <span>{s.label}</span>;
    const n = text.trim().length;
    return <span><strong>{s.label.slice(0, n)}</strong>{s.label.slice(n)}</span>;
  };

  return (
    <div className="field">
      <label htmlFor={id} className="label">{label}{required && <span style={{ color: "var(--g)" }}> *</span>}</label>
      <input id={id} className="input" value={text} placeholder={placeholder} autoComplete="off" role="combobox"
        aria-expanded={open && list.length > 0} aria-controls={listId} aria-autocomplete="list"
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!list.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter") { e.preventDefault(); pick(list[active]); }
          if (e.key === "Escape") setOpen(false);
        }} />
      {open && list.length > 0 && (
        <div className="listbox" role="listbox" id={listId} aria-label="Place suggestions">
          {list.map((s, i) => (
            <button key={s.label} type="button" role="option" aria-selected={i === active} className="option"
              onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}>
              <Pin color={i === active ? "var(--g)" : "var(--muted)"} />{boldMatch(s)}
            </button>
          ))}
          <div className="attribution">Places by Google Maps</div>
        </div>
      )}
    </div>
  );
}
