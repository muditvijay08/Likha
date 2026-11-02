"use client";
// Live popups ("Live in Jaipur"): real activity from live_signals(), never made up, never a name.
// LiveStrip rotates through what's true right now (Discover). LivePopup shows a few once per session (Home).
import Link from "next/link";
import { useEffect, useState } from "react";
import { Info } from "@/components/app";
import { api, type Live } from "@/lib/api";

type Item = { key: string; text: React.ReactNode; href?: string };

function items(l: Live): Item[] {
  const city = l.city ?? "your city", out: Item[] = [];
  const p = l.pulse;
  if (p) out.push({ key: "pulse", text: <><strong>Live in {p.city}:</strong> {p.matches_last_hour === 1 ? "two people just matched" : `${p.matches_last_hour} new matches`}{p.top_score ? ` at ${p.top_score}%` : ""} · {p.minutes_ago < 1 ? "just now" : `${p.minutes_ago} min ago`}</> });
  if (l.online_now) out.push({ key: "online", text: <><strong>{l.online_now} people</strong> online in {city} right now</>, href: "/discover" });
  if (l.joined_today) out.push({ key: "joined", text: <><strong>{l.joined_today} new people</strong> joined {city} today</>, href: "/discover" });
  if (l.new_high_match) out.push({ key: "high", text: <>A <strong>85%+ match</strong> joined {city} this week</>, href: "/discover" });
  if (l.views_today > 0) out.push({ key: "views", text: <><strong>{l.views_today} {l.views_today === 1 ? "person" : "people"}</strong> viewed your profile today</>, href: "/me/preview" });
  return out;
}

function useLive(): Item[] {
  const [list, setList] = useState<Item[]>([]);
  useEffect(() => {
    let on = true;
    const get = () => api().live().then((l) => { if (on) setList(l ? items(l) : []); }).catch(() => {});
    get(); const t = setInterval(get, 60_000);                 // refresh every minute while the screen is open
    return () => { on = false; clearInterval(t); };
  }, []);
  return list;
}

const Dot = () => <span aria-hidden="true" style={{ width: 8, height: 8, flex: "none", borderRadius: 999, background: "#2F9E6E", boxShadow: "0 0 0 4px var(--green-soft)" }} />;
const TRUE_NOTE = "Real numbers from Likha members, no names. Never made up.";

/** One line at a time, changing every 5 seconds. Nothing shows when there is nothing true to say. */
export function LiveStrip() {
  const list = useLive();
  const [i, setI] = useState(0);
  useEffect(() => { if (list.length < 2) return; const t = setInterval(() => setI((n) => n + 1), 5_000); return () => clearInterval(t); }, [list.length]);
  if (!list.length) return null;
  const it = list[i % list.length];
  const body = <span key={it.key} className="live-in" style={{ flex: 1 }}>{it.text}</span>;
  return (
    <div role="status" aria-live="polite" className="row" style={{ gap: 10, padding: "10px 12px", borderRadius: 14, background: "#fff", border: "1px solid var(--line)", boxShadow: "0 6px 18px rgba(30,24,56,0.08)", fontSize: 13 }}>
      <Dot />
      {it.href ? <Link href={it.href} style={{ flex: 1, color: "var(--ink)", textDecoration: "none" }}>{body}</Link> : body}
      <Info cls="tip-r" text={TRUE_NOTE} />
    </div>
  );
}

/** A small card that slides in once per session, shows up to three true things, then goes. */
export function LivePopup() {
  const list = useLive();
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!list.length) return;
    try { if (sessionStorage.getItem("likha-live-popup")) return; sessionStorage.setItem("likha-live-popup", "1"); } catch { /* private mode: show once anyway */ }
    const start = setTimeout(() => setOpen(true), 1_500);
    return () => clearTimeout(start);
  }, [list.length]);
  useEffect(() => {
    if (!open) return;
    const shown = Math.min(list.length, 3);
    const t = setInterval(() => setI((n) => { if (n + 1 >= shown) { setOpen(false); return n; } return n + 1; }), 4_500);
    return () => clearInterval(t);
  }, [open, list.length]);
  if (!open || !list.length) return null;
  const it = list[i % list.length];
  return (
    <div role="status" aria-live="polite" className="live-pop">
      <Dot />
      <span key={it.key} className="live-in" style={{ flex: 1, fontSize: 13 }}>
        {it.href ? <Link href={it.href} onClick={() => setOpen(false)} style={{ color: "var(--ink)", textDecoration: "none" }}>{it.text}</Link> : it.text}
      </span>
      <button type="button" aria-label="Close" className="tip tip-r tip-up" data-tip="Close" onClick={() => setOpen(false)}
        style={{ background: "none", border: 0, fontSize: 18, lineHeight: 1, color: "var(--muted)", padding: 2 }}>×</button>
    </div>
  );
}
