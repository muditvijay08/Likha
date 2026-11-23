"use client";
// H0 Home (Nov 2026 redesign): the virtual companion first, one clear next step, then a short list of places to go.
// Progressive disclosure: the day in the stars and today's best match live on the Kundli tab (/stars), people on Discover.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Chevron, Coin, useApp } from "@/components/app";
import { KIND_TITLE } from "@/components/couple";
import { loadMySide } from "@/components/match-intel";
import { api, type Announcement, type ConsentReq, type DueCheckin, type SaathiState } from "@/lib/api";

const CHAR = { chandni: { name: "Chandni", line: "Warm, playful, remembers your day" }, dhruv: { name: "Dhruv", line: "Calm, witty, steady advice" } } as const;

function greeting(tz: string) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Home() {
  const { home } = useApp();
  const [s, setS] = useState<SaathiState | null>(null);
  const [asks, setAsks] = useState<ConsentReq[]>([]);
  const [due, setDue] = useState<DueCheckin[]>([]);
  const [notice, setNotice] = useState<Announcement | null>(null);
  const [lifeLeft, setLifeLeft] = useState(0);
  useEffect(() => {
    loadMySide().then((m) => { const l = m?.life ?? {}; setLifeLeft(["kids", "family_setup", "career_plan", "comm_style", "conflict_style", "weekend_style", "money_style"]
      .filter((k) => !(l as Record<string, unknown>)[k]).length + (l.life_values?.length ? 0 : 1)); }).catch(() => {});
    api().saathi().then(setS).catch(() => {});
    api().consentRequests().then(setAsks).catch(() => {});
    api().dueCheckins().then(setDue).catch(() => {});
    api().myAnnouncement().then((a) => { let seen = ""; try { seen = localStorage.getItem("likha-banner-closed") ?? ""; } catch {} if (a && a.id !== seen) setNotice(a); }).catch(() => {});
  }, []);
  const closeNotice = () => { try { if (notice) localStorage.setItem("likha-banner-closed", notice.id); } catch {} setNotice(null); };

  if (!home) return <div className="app-body"><div className="skel" style={{ height: 44 }} /><div className="skel" style={{ height: 300 }} /><div className="skel" style={{ height: 160 }} /></div>;
  const c = CHAR[s?.character ?? "chandni"];
  const hello = `${greeting(home.city?.timezone ?? "Asia/Kolkata")}, ${home.first_name}`;
  const best = home.top[0];

  return (
    <div className="app-body wide home2">
      <header className="row" style={{ justifyContent: "space-between", gap: 10 }}>
        <span className="wordmark" aria-hidden="true">Likha<span>.</span></span>
        <div className="row" style={{ gap: 6 }}>
          <Link href="/wallet" className="pillbtn credits tip tip-r" data-tip="Your credits. 1 credit = ₹1" aria-label={`${home.balance} credits`}><Coin />{home.balance}</Link>
          <Link href="/inbox" className="pillbtn bell tip tip-r" data-tip={home.notices ? `${home.notices} new: likes, matches and readings` : "Activity: likes, matches and readings"}
            aria-label={home.notices ? `Activity, ${home.notices} new` : "Activity"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10.3 20a1.9 1.9 0 0 0 3.4 0" /></svg>
            {!!home.notices && <span className="bell-dot" aria-hidden="true">{home.notices > 9 ? "9+" : home.notices}</span>}
          </Link>
        </div>
      </header>

      {notice && (
        <div className="row note-bar" role="note" aria-label="Announcement">
          {notice.link ? <Link href={notice.link} style={{ flex: 1, color: "var(--ink)", fontWeight: 600, fontSize: 14, textDecoration: "none" }}>{notice.text}</Link>
            : <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{notice.text}</span>}
          <button type="button" onClick={closeNotice} aria-label="Close announcement" style={{ background: "none", border: 0, fontSize: 18, color: "var(--muted)" }}>×</button>
        </div>
      )}
      {asks.map((q) => (
        <Link key={q.id} href={`/ask/${q.id}`} className="rowlink" style={{ background: "var(--ivory)" }}>
          <span className="t"><strong>{q.from_name} wants to read {KIND_TITLE[q.kind] ?? "a reading"} with you</strong><span>Your say. They&apos;re only charged if you agree.</span></span><Chevron /></Link>
      ))}
      {due.slice(0, 1).map((d) => (
        <Link key={d.match_id} href={`/together/${d.match_id}?day=${d.day_mark}&name=${encodeURIComponent(d.other_name)}`} className="rowlink" style={{ background: "var(--action-soft)" }}>
          <span className="t"><strong>{d.day_mark} days with {d.other_name}</strong><span>How&apos;s it going? Just for you, they never see it.</span></span><Chevron /></Link>
      ))}

      <section aria-label="Your companion" className="companion-hero">
        <div className="row" style={{ gap: 12 }}>
          <span className="companion-face" aria-hidden="true">{c.name[0]}</span>
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <strong style={{ fontSize: 15 }}>{c.name}</strong>
            <span className="small" style={{ fontSize: 13 }}>Virtual companion, not a real person</span>
          </div>
        </div>
        <p className="kicker" style={{ margin: "22px 0 6px", color: "var(--muted)" }}>{hello}</p>
        <h1 className="h1 hero">What&apos;s on your mind?</h1>
        <p className="sub" style={{ marginTop: 10 }}>{c.line}. Dating nerves, a text you can&apos;t word, or just your day.</p>
        <div className="stack" style={{ gap: 10, marginTop: 20 }}>
          <Link href="/saathi" className="btn">Talk to {c.name}</Link>
          <Link href="/kick" className="btn outline">Your day in the stars</Link>
        </div>
      </section>

      <section aria-label="More for you" className="stack" style={{ gap: 0 }}>
        <div className="sec-title"><strong>For you today</strong></div>
        {best && (
          <Link href="/stars" className="list-row">
            <span className="num">{best.gunas ?? "–"}<small>/36</small></span>
            <span className="t"><strong>Today&apos;s best match: {best.first_name}</strong><span>Gunas first, then why. On your Kundli tab</span></span><Chevron /></Link>
        )}
        {lifeLeft > 0 && (
          <Link href="/me/values" className="list-row"><span className="num">{lifeLeft}</span>
            <span className="t"><strong>Life and values</strong><span>Quick questions so match reasons go beyond the kundli</span></span><Chevron /></Link>
        )}
        <Link href="/saathi" className="list-row"><span className="num">01</span>
          <span className="t"><strong>Relationship coach</strong><span>Practise a first message or a tricky talk</span></span><Chevron /></Link>
        <Link href="/readings" className="list-row"><span className="num">02</span>
          <span className="t"><strong>Who suits me?</strong><span>The partner your chart leans towards</span></span><Chevron /></Link>
        <Link href="/golden" className="list-row"><span className="num">03</span>
          <span className="t"><strong>Golden Hours</strong><span>When your stars and theirs line up</span></span><Chevron /></Link>
      </section>
    </div>
  );
}
