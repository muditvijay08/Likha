"use client";
// C4 Couple Mode: free, and both must confirm. Both profiles leave Discover. Couple Mode Plus (₹149/month, one pays, both get it) adds the perks.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BackButton, ErrorNote, useAction } from "@/components/ui";
import { rupees } from "@/components/app";
import { Pair } from "@/components/couple";
import { api, type CoupleState } from "@/lib/api";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function Couple() {
  const { match } = useParams<{ match: string }>();
  const [c, setC] = useState<CoupleState | null>(null);
  const [ending, setEnding] = useState(false);
  const { busy, error, run } = useAction();
  const load = useCallback(() => api().couple(match).then(setC).catch(() => {}), [match]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!c?.confirmed_me || c.started_at) return; const t = setTimeout(load, 3000); return () => clearTimeout(t); }, [c, load]);
  if (!c) return <div className="app-body pad"><div className="skel" style={{ height: 300 }} /></div>;
  const on = !!c.started_at;
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href={`/universe/${match}`} /><h1>Couple Mode</h1></div>
      <Pair me={c.me_name} other={c.other_name} line={on ? `Together on Likha since ${day(c.started_at!)}` : `Matched ${day(c.matched_at)} · ${c.jodi_score ?? "–"}% Jodi Score`} />
      {on ? <>
        <div className="card stack" style={{ gap: 6, borderRadius: 20, background: "var(--green-soft)" }}>
          <strong>Couple Mode is on</strong><span className="sub">You&apos;ve both left Discover and new likes are paused. Your chat, readings and Our Story stay.</span></div>
        <section className="stack" style={{ gap: 8, padding: 16, borderRadius: 20, background: "linear-gradient(135deg, #FFE7B8, #FFD3E0)" }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "var(--rose-ink)" }}>COUPLE MODE PLUS</span>
          {c.plus ? <><strong style={{ fontSize: 16 }}>On until {day(c.plus_until!)}</strong><span style={{ fontSize: 13 }}>20% off every Our Universe reading and Guru Ji, for both of you.</span></>
            : <><strong style={{ fontSize: 16 }}>{rupees(c.plus_price_paise)} a month, one pays, both get it</strong>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}><li>20% off Our Stars, Our Alignment, Imagine Us and Seven Questions</li><li>20% off Guru Ji questions</li><li>Paid month by month. Nothing renews by itself.</li></ul>
              <Link className="btn" href="/checkout?type=subscription&key=couple_mode">Get Plus for {rupees(c.plus_price_paise)}</Link></>}
        </section>
        <Link className="rowlink" href={`/story/${match}`}><span className="t"><strong>Our Story</strong><span>Your timeline, and add your own moments</span></span></Link>
        <Link className="rowlink" href="/checkout?type=subscription&key=next_12_months"><span className="t"><strong>Our Next 12 Months</strong><span>A love forecast for the year ahead · {rupees(c.year_price_paise)}</span></span></Link>
        {ending ? <div className="card stack" style={{ gap: 8, borderRadius: 18 }}>
            <strong>End Couple Mode?</strong><span className="sub">Both of you go back into Discover. Your chat and Our Story stay.</span>
            <div className="grid2"><button type="button" className="btn ghost" onClick={() => setEnding(false)}>Keep it on</button>
              <button type="button" className="btn" disabled={busy} onClick={() => run(async () => { await api().endCouple(match); setEnding(false); await load(); })}>End it</button></div></div>
          : <button type="button" className="btn text" onClick={() => setEnding(true)}>End Couple Mode</button>}
      </> : c.confirmed_me ? (
        <div className="card stack" style={{ alignItems: "center", textAlign: "center", gap: 10, padding: 24, borderRadius: 22 }}>
          <span className="spinner" aria-hidden="true" /><strong>Waiting for {c.other_name} to confirm</strong>
          <span className="sub">We&apos;ve let them know. Nothing changes until they say yes too.</span></div>
      ) : <>
        <div style={{ padding: 18, borderRadius: 22, background: "#EDE6FF" }} className="stack">
          <strong className="serif" style={{ fontSize: 22 }}>Found your person?</strong>
          <span style={{ fontSize: 13, color: "#3D3560" }}>Turn on Couple Mode together. It&apos;s free.</span>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}><li>Both your profiles leave Discover</li><li>New likes pause; your chats stay</li>
            <li>Our Story keeps your timeline</li><li>Either of you can end it any time</li></ul>
        </div>
        <ErrorNote error={error} />
        <div className="grow" />
        <button type="button" className="btn" disabled={busy} onClick={() => run(async () => { await api().confirmCouple(match); await load(); })}>Start Couple Mode with {c.other_name}</button>
        <span className="small" style={{ textAlign: "center" }}>{c.confirmed_other ? `${c.other_name} already said yes.` : `${c.other_name} is asked to confirm too.`}</span>
      </>}
    </div>
  );
}
