"use client";
// H1 Home: love weather, today's timeline (computed here from the city's sunrise, Rahu Kaal and horas), top picks, likes, Golden Hour.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Avatar, Chevron, Coin, Info, price, useApp } from "@/components/app";
import { api, type Announcement, type ConsentReq, type DueCheckin, type MatchRow } from "@/lib/api";
import { KIND_TITLE } from "@/components/couple";
import { clock, dayPlan, fmt, goldenHours, localParts, range } from "@/lib/panchang";

const pos = (m: number) => Math.max(0, Math.min(100, ((m - 360) / 1080) * 100));        // 6 AM .. midnight

export default function Home() {
  const { home, prices } = useApp();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [asks, setAsks] = useState<ConsentReq[]>([]);
  const [due, setDue] = useState<DueCheckin[]>([]);
  const [notice, setNotice] = useState<Announcement | null>(null);
  useEffect(() => {
    api().myAnnouncement().then((a) => { let seen = ""; try { seen = localStorage.getItem("likha-banner-closed") ?? ""; } catch {} if (a && a.id !== seen) setNotice(a); }).catch(() => {});
  }, []);
  const closeNotice = () => { try { if (notice) localStorage.setItem("likha-banner-closed", notice.id); } catch {} setNotice(null); };
  useEffect(() => { api().consentRequests().then(setAsks).catch(() => {}); api().dueCheckins().then(setDue).catch(() => {}); }, []);
  useEffect(() => { api().matches().then(setMatches).catch(() => {}); const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);

  const city = home?.city;
  const plan = useMemo(() => city ? dayPlan(city.lat, city.lng, city.timezone, now) : null, [city, now]);
  const golden = useMemo(() => city && matches.length ? goldenHours(city.lat, city.lng, city.timezone, now, 3)[0] : null, [city, matches.length, now]);
  const lp = city ? localParts(city.timezone, now) : null;
  const dateLabel = city ? new Intl.DateTimeFormat("en-IN", { timeZone: city.timezone, weekday: "short", day: "numeric", month: "short" }).format(now) : "";

  if (!home) return <div className="app-body"><div className="skel" style={{ height: 60 }} /><div className="skel" style={{ height: 150 }} /><div className="skel" style={{ height: 90 }} /></div>;
  const k = home.kick;
  const vibe = k?.teaser.vibe ?? null;
  const love = plan?.love;

  return (
    <div className="app-body">
      <header className="row" style={{ justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>{dateLabel}{city ? ` · ${city.name}` : ""}</div>
          <h1 style={{ margin: "2px 0 0", fontFamily: "var(--serif)", fontSize: 26, fontWeight: 600 }}>Hey {home.first_name}</h1>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <span className="pillbtn tip tip-r" tabIndex={0} data-tip={home.streak ? `${home.streak}-day Kick streak. Keep it going to move up a tier.` : "Open your Daily Kick each day to start a streak."}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E07B00" strokeWidth="2.2" aria-hidden="true"><path d="M12 3c2 4 6 5 6 10a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 4 4 0-3 0-5 0-7z" /></svg>{home.streak}
          </span>
          <Link href="/wallet" className="pillbtn credits tip tip-r" data-tip="Your credits. 1 credit = ₹1"><Coin />{home.balance}</Link>
          <Link href="/inbox" className="pillbtn bell tip tip-r" data-tip={home.notices ? `${home.notices} new: likes, matches and readings` : "Activity: likes, matches and readings"}
            aria-label={home.notices ? `Activity, ${home.notices} new` : "Activity"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10.3 20a1.9 1.9 0 0 0 3.4 0" /></svg>
            {!!home.notices && <span className="bell-dot" aria-hidden="true">{home.notices > 9 ? "9+" : home.notices}</span>}
          </Link>
        </div>
      </header>

      {notice && (
        <div className="row" role="note" aria-label="Announcement" style={{ gap: 10, padding: "12px 14px", borderRadius: 18, background: "#FFF3D6" }}>
          {notice.link ? <Link href={notice.link} style={{ flex: 1, color: "var(--ink)", fontWeight: 600, fontSize: 14, textDecoration: "none" }}>{notice.text}</Link>
            : <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{notice.text}</span>}
          <button type="button" onClick={closeNotice} aria-label="Close announcement" className="tip tip-r" data-tip="Close" style={{ background: "none", border: 0, fontSize: 18, color: "var(--muted)" }}>×</button>
        </div>
      )}
      {asks.map((q) => (
        <Link key={q.id} href={`/ask/${q.id}`} className="rowlink" style={{ background: "#EDE6FF" }}>
          <span className="t"><strong>{q.from_name} wants to read {KIND_TITLE[q.kind] ?? "a reading"} with you</strong><span>Your say. They&apos;re only charged if you agree.</span></span><Chevron /></Link>
      ))}
      {due.slice(0, 1).map((d) => (
        <Link key={d.match_id} href={`/together/${d.match_id}?day=${d.day_mark}&name=${encodeURIComponent(d.other_name)}`} className="rowlink" style={{ background: "var(--rose-soft)" }}>
          <span className="t"><strong>{d.day_mark} days with {d.other_name}</strong><span>How&apos;s it going? Just for you, they never see it.</span></span><Chevron /></Link>
      ))}
      <Link href="/kick" aria-label="Today's love weather" style={{ display: "flex", gap: 16, alignItems: "center", padding: 18, borderRadius: 26,
        background: "linear-gradient(135deg, #FFE7B8 0%, #FFD3E0 55%, #E3D8FF 100%)", color: "var(--ink)", textDecoration: "none" }}>
        <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden="true" style={{ flex: "none" }}>
          <circle cx="56" cy="56" r="46" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="10" />
          {vibe !== null && <circle cx="56" cy="56" r="46" fill="none" stroke="#E0457B" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(vibe / 10) * 289} 289`} transform="rotate(-90 56 56)" />}
          <text x="56" y="60" textAnchor="middle" fontFamily="Fraunces, Georgia, serif" fontSize="32" fontWeight="600" fill="#1E1838">{vibe ?? "…"}</text>
          <text x="56" y="78" textAnchor="middle" fontFamily="Manrope, sans-serif" fontSize="11" fontWeight="700" fill="#5E5780">of 10</text>
        </svg>
        <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "#A3164C" }}>TODAY&apos;S LOVE WEATHER<Info cls="tip-r" text="Your love energy today, 1 to 10, from today's Moon and your birth star (Tara bala)." /></span>
          <strong style={{ fontFamily: "var(--serif)", fontSize: 21, lineHeight: 1.2 }}>{k?.teaser.love_weather ?? "Your Kick is being written"}</strong>
          <span style={{ fontSize: 13, color: "#3D3560" }}>{k?.teaser.line ?? "It arrives early every morning. Check back soon."}</span>
        </span>
      </Link>

      {home.feature && (
        <Link href={home.feature.link || "/menu"} style={{ display: "flex", gap: 12, alignItems: "center", padding: "14px 16px", borderRadius: 20, background: "var(--ink)", color: "#fff", textDecoration: "none" }}>
          <span style={{ width: 42, height: 42, flex: "none", borderRadius: 14, background: "var(--saffron)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E1838" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span>
          <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "#FFD98A" }}>DAY {home.feature.day} · NEW FOR YOU</span>
            <strong style={{ fontSize: 15 }}>{home.feature.title}</strong>
            <span style={{ fontSize: 12, color: "#C9BDEB" }}>{home.feature.body}</span>
          </span>
          <Chevron color="#fff" />
        </Link>
      )}

      {plan && lp && (
        <section aria-label="Your day" className="stack">
          <div className="sec-title"><strong>Your day in the stars</strong><Link href="/kick">{k?.unlocked ? "Full Kick" : `Full Kick · ${home.kick_pass ? "Pass" : `${price(prices, "daily_kick", home.kick_price)} cr`}`}</Link></div>
          <div style={{ position: "relative", height: 40, borderRadius: 12, background: "#fff", border: "1px solid var(--line)", overflow: "hidden" }}>
            <span title={`Rahu Kaal ${range(plan.rahu[0], plan.rahu[1])}`} style={{ position: "absolute", left: `${pos(plan.rahu[0])}%`, width: `${pos(plan.rahu[1]) - pos(plan.rahu[0])}%`, top: 0, bottom: 0, background: "repeating-linear-gradient(45deg, #ECE6FA 0 4px, #F7F4FD 4px 8px)" }} />
            {plan.office && <span title={k?.unlocked ? `Office best ${range(plan.office.start, plan.office.end)}` : "Office best, see times in your Kick"} style={{ position: "absolute", left: `${pos(plan.office.start)}%`, width: `${pos(plan.office.end) - pos(plan.office.start)}%`, top: 0, bottom: 0, background: "#DCEBFF" }} />}
            {love && <span title={`Lucky love window ${range(love.start, love.end)}`} style={{ position: "absolute", left: `${pos(love.start)}%`, width: `${pos(love.end) - pos(love.start)}%`, top: 0, bottom: 0, background: "var(--saffron)" }} />}
            {lp.minutes >= 360 && <>
              <span style={{ position: "absolute", left: `${pos(lp.minutes)}%`, top: 0, bottom: 0, width: 2, background: "var(--ink)" }} />
              <span style={{ position: "absolute", left: `clamp(0px, calc(${pos(lp.minutes)}% - 16px), calc(100% - 34px))`, top: 3, padding: "1px 5px", borderRadius: 6, background: "var(--ink)", color: "#fff", fontSize: 10, fontWeight: 700 }}>Now</span>
            </>}
          </div>
          <div className="row" style={{ justifyContent: "space-between", fontSize: 10, color: "var(--muted)" }}><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>12 AM</span></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 11, color: "#3D3560" }}>
            {love && <span className="row" style={{ gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--saffron)" }} />Love window {fmt(love.start)}</span>}
            {plan.office && <span className="row" style={{ gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#DCEBFF" }} />Office best</span>}
            <span className="row" style={{ gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#ECE6FA" }} />Rahu Kaal, skip big moves<Info cls="tip-up tip-r" text={`Rahu Kaal today: ${range(plan.rahu[0], plan.rahu[1])}. About 90 minutes a day seen as unlucky for new starts.`} /></span>
          </div>
        </section>
      )}

      <section aria-label="Stars aligned today" className="stack" style={{ gap: 10 }}>
        <div className="sec-title"><strong>Stars aligned for you today</strong><Link href="/discover">See all</Link></div>
        {home.top.length ? (
          <div className="row" style={{ gap: 12, overflowX: "auto", scrollbarWidth: "none" }}>
            {home.top.map((c) => (
              <Link key={c.id} href={`/profile/${c.id}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "var(--ink)", textDecoration: "none", flex: "none", width: 66 }}>
                <span style={{ width: 64, height: 64, borderRadius: 999, background: `conic-gradient(#FFB020 0 ${(c.jodi_score ?? 0) * 3.6}deg, #ECE6FA ${(c.jodi_score ?? 0) * 3.6}deg 360deg)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Avatar name={c.first_name} photo={c.photos[0]} size={56} style={{ border: "2px solid #fff", fontSize: 22 }} />
                </span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{c.first_name}</span>
                <span style={{ marginTop: -6, fontSize: 11, color: "var(--link)", fontWeight: 700 }}>{c.jodi_score != null ? `${c.jodi_score}%` : "…"}</span>
              </Link>
            ))}
          </div>
        ) : <Link href="/discover" className="small">No new people right now. Widen your filters on Discover.</Link>}
      </section>

      <div className="grid2" style={{ gap: 10 }}>
        <Link href="/likes" style={{ display: "flex", flexDirection: "column", gap: 4, padding: 14, borderRadius: 20, background: "var(--rose-soft)", color: "var(--ink)", textDecoration: "none" }}>
          <span className="serif" style={{ fontSize: 26, fontWeight: 600, color: "var(--rose)" }}>{home.likes_count}</span>
          <strong style={{ fontSize: 14 }}>{home.likes_count === 1 ? "person likes you" : "people like you"}</strong><span style={{ fontSize: 12, color: "#8A3A55" }}>See them, it&apos;s free</span>
        </Link>
        {golden && matches[0] ? (
          <Link href={`/match/${matches[0].match_id}`} style={{ display: "flex", flexDirection: "column", gap: 4, padding: 14, borderRadius: 20, background: "var(--saffron-soft)", color: "var(--ink)", textDecoration: "none" }}>
            <span className="serif" style={{ fontSize: 26, fontWeight: 600, color: "var(--link)" }}>{clock(golden.start, city!.timezone).slice(0, -3)}</span>
            <strong style={{ fontSize: 14 }}>Golden Hour with {matches[0].first_name}</strong><span style={{ fontSize: 12, color: "var(--saffron-ink)" }}>{golden.day === "Tonight" ? "Text first tonight?" : `${golden.day}. Plan a chat?`}</span>
          </Link>
        ) : (
          <Link href="/kick" style={{ display: "flex", flexDirection: "column", gap: 4, padding: 14, borderRadius: 20, background: "var(--saffron-soft)", color: "var(--ink)", textDecoration: "none" }}>
            <span className="serif" style={{ fontSize: 26, fontWeight: 600, color: "var(--link)" }}>{love ? fmt(love.start).replace(/ (AM|PM)$/, "") : "…"}</span>
            <strong style={{ fontSize: 14 }}>Your lucky window</strong><span style={{ fontSize: 12, color: "var(--saffron-ink)" }}>Best time today to say hi</span>
          </Link>
        )}
      </div>

      <Link href="/check" className="rowlink">
        <span style={{ width: 40, height: 40, flex: "none", borderRadius: 999, background: "#F3EEFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E0457B" strokeWidth="2" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg></span>
        <span className="t"><strong>Got a crush outside the app?</strong><span>Check your Jodi Score with anyone · {price(prices, "check_anyone", 29)} cr</span></span>
        <Chevron />
      </Link>
    </div>
  );
}
