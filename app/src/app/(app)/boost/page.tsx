"use client";
// E7 Boost: shown first in Discover in your city for 30 minutes. Now, or booked for later today (best at a Golden Hour).
import { useCallback, useEffect, useState } from "react";
import { BackButton, ErrorNote, useAction } from "@/components/ui";
import { useApp } from "@/components/app";
import { api, type BoostState } from "@/lib/api";

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);

export default function Boost() {
  const { reload } = useApp();
  const [b, setB] = useState<BoostState | null>(null);
  const [later, setLater] = useState(false);
  const [at, setAt] = useState(localInput(new Date(Date.now() + 3600e3)));
  const [now, setNow] = useState(Date.now());
  const { busy, error, run } = useAction();
  const load = useCallback(() => api().boost().then(setB).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(() => { setNow(Date.now()); }, 1000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (b?.boost?.live) { const t = setInterval(load, 15000); return () => clearInterval(t); } }, [b?.boost?.live, load]);
  const go = () => run(async () => { setB(await api().activateBoost(30, later ? new Date(at) : null)); await reload(); });
  if (!b) return <div className="app-body pad"><div className="skel" style={{ height: 300 }} /></div>;
  const live = b.boost && new Date(b.boost.starts_at).getTime() <= now;
  const left = b.boost ? Math.max(0, new Date(b.boost.ends_at).getTime() - now) : 0;
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/menu" /><h1>Boost</h1></div>
      <div style={{ padding: 20, borderRadius: 22, background: "linear-gradient(135deg, #FFD36E, #FF8A5B)", color: "var(--ink)" }} className="stack">
        {b.boost ? live ? <>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em" }}>BOOST IS ON</span>
            <strong className="serif" style={{ fontSize: 34 }} aria-live="polite">{Math.floor(left / 60e3)}:{String(Math.floor(left / 1000) % 60).padStart(2, "0")}</strong>
            <span style={{ fontSize: 14 }}>{b.boost.views} {b.boost.views === 1 ? "person has" : "people have"} opened your profile so far</span>
          </> : <>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em" }}>BOOST BOOKED</span>
            <strong className="serif" style={{ fontSize: 26 }}>Starts at {hhmm(b.boost.starts_at)}</strong>
            <span style={{ fontSize: 14 }}>Runs till {hhmm(b.boost.ends_at)}.</span>
          </> : <>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em" }}>30 MINUTES AT THE FRONT</span>
            <strong className="serif" style={{ fontSize: 24 }}>Be the first profile people see in your city</strong>
            <span style={{ fontSize: 14 }}>Your Jodi Score with each person still decides who sees you. Boost only moves you up.</span>
          </>}
      </div>
      {!b.boost && <>
        <div className="chips" role="radiogroup" aria-label="When">
          <button type="button" role="radio" aria-checked={!later} className="chip sm" aria-pressed={!later} onClick={() => setLater(false)}>Start now</button>
          <button type="button" role="radio" aria-checked={later} className="chip sm" aria-pressed={later} onClick={() => setLater(true)}>Later today</button>
        </div>
        {later && <div className="field"><label className="label" htmlFor="b-at">Start at</label>
          <input id="b-at" className="input" type="datetime-local" min={localInput(new Date())} max={localInput(new Date(Date.now() + 24 * 3600e3))} value={at} onChange={(e) => setAt(e.target.value)} />
          <span className="small">Evenings and your Golden Hours are usually busiest.</span></div>}
        <ErrorNote error={error} />
        <div className="grow" />
        <button type="button" className="btn" disabled={busy} onClick={go}>{later ? "Book Boost" : "Boost now"} · {b.price} credits</button>
      </>}
      <span className="small" style={{ textAlign: "center" }}>One Boost at a time. It runs in the city you&apos;re in, including a Travel Mode city.</span>
    </div>
  );
}
