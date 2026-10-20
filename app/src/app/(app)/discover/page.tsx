"use client";
// D1 Discover (one card at a time, best Jodi Score first) and D6 when there is nobody left.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ErrorNote, useAction } from "@/components/ui";
import { CreditsPill, GOAL_LABEL, Info, PhotoBlock, SampleTag, TIER_LABEL, price, useApp } from "@/components/app";
import { api, type Card, type Filters, type Pulse } from "@/lib/api";

const COACH = "likha-coach-jodi";
const seen = () => { try { return localStorage.getItem(COACH) === "1"; } catch { return true; } };

export default function Discover() {
  const router = useRouter();
  const { home, prices, reload } = useApp();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [coach, setCoach] = useState(false);
  const { busy, error, run } = useAction();

  const load = useCallback(async () => {
    const [c, f, p] = await Promise.all([api().discover(0), api().filters(), api().pulse()]);
    setCards(c); setFilters(f); setPulse(p);
  }, []);
  useEffect(() => { load().catch(() => setCards([])); setCoach(!seen()); }, [load]);

  const card = cards?.[0];
  const next = async () => {
    const rest = (cards ?? []).slice(1);
    setCards(rest);
    if (rest.length < 3) { const more = await api().discover(0); setCards(more); }
  };
  const pass = () => card && run(async () => { await api().pass(card.id); await next(); });
  const like = () => card && run(async () => {
    const r = await api().like(card.id);
    await reload();
    if (r.matched && r.match_id) router.push(`/match/${r.match_id}`); else await next();
  });
  const gotIt = () => { setCoach(false); try { localStorage.setItem(COACH, "1"); } catch { /* private mode */ } };

  const city = home?.city?.name ?? "your city";
  return (
    <div className="app-body flush">
      <header className="row" style={{ justifyContent: "space-between", padding: "20px 20px 12px" }}>
        <div className="wordmark" style={{ fontSize: 24 }}>Likha<span>.</span></div>
        <div className="row">
          <CreditsPill label="credits" />
          <Link href="/filters" className="iconbtn tip tip-r" data-tip="Filters" aria-label="Filters">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
          </Link>
        </div>
      </header>
      {filters && (
        <div className="row" style={{ padding: "0 20px", fontSize: 12, color: "var(--muted)", flexWrap: "wrap" }}>
          <span style={{ padding: "6px 10px", borderRadius: 999, background: "#fff" }}>{city} · {filters.distance === "same_city" ? "Same city" : "Any city"}</span>
          <span style={{ padding: "6px 10px", borderRadius: 999, background: "#fff" }}>{filters.goals.length === 1 ? GOAL_LABEL[filters.goals[0]] : "Dating and matchmaking"}</span>
        </div>
      )}

      <main style={{ flex: 1, padding: "14px 20px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        {pulse && (
          <div role="status" className="row" style={{ gap: 10, padding: "10px 12px", borderRadius: 14, background: "#fff", border: "1px solid var(--line)", boxShadow: "0 6px 18px rgba(30,24,56,0.08)", fontSize: 13 }}>
            <span style={{ width: 8, height: 8, flex: "none", borderRadius: 999, background: "#2F9E6E", boxShadow: "0 0 0 4px var(--green-soft)" }} />
            <span style={{ flex: 1 }}><strong>Live in {pulse.city}:</strong> {pulse.matches_last_hour === 1 ? "two people just matched" : `${pulse.matches_last_hour} new matches`}{pulse.top_score ? ` at ${pulse.top_score}%` : ""} · {pulse.minutes_ago < 1 ? "just now" : `${pulse.minutes_ago} min ago`}</span>
            <Info cls="tip-r" text="Real matches from the last hour, no names. Never made up." />
          </div>
        )}

        {cards === null ? <div className="skel" style={{ height: 460 }} /> : card ? <>
          <article style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 24, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <PhotoBlock name={card.first_name} photos={card.photos} height={300}>
              <div style={{ position: "absolute", top: 14, left: 14, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                {card.jodi_score != null ? (
                  <div style={{ background: "var(--saffron)", color: "var(--ink)", borderRadius: 12, padding: "8px 12px", display: "flex", flexDirection: "column", fontFamily: "var(--sans)" }}>
                    <span className="serif" style={{ fontSize: 28, fontWeight: 600, lineHeight: 1 }}>{card.jodi_score}%</span>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>written in the stars<Info text="Jodi Score: how well your two kundlis match, out of 100." /></span>
                  </div>
                ) : <div style={{ background: "#fff", borderRadius: 12, padding: "8px 12px", font: "700 12px var(--sans)", color: "var(--ink)" }}>Score on its way</div>}
                {card.gunas != null && <div style={{ background: "rgba(255,255,255,0.92)", color: "var(--ink)", borderRadius: 999, padding: "6px 10px", font: "600 12px var(--sans)" }}>{card.gunas} / 36 Gunas<Info text="Guna Milan: the traditional 36-point kundli match. 18 or more is seen as good." /></div>}
                {coach && (
                  <div role="note" style={{ position: "relative", width: 210, marginTop: 6, padding: "10px 12px", borderRadius: 12, background: "var(--ink)", color: "#fff", font: "400 12px/1.4 var(--sans)", boxShadow: "0 8px 20px rgba(30,24,56,0.25)" }}>
                    <span aria-hidden="true" style={{ position: "absolute", top: -6, left: 22, width: 12, height: 12, background: "var(--ink)", transform: "rotate(45deg)" }} />
                    <strong style={{ display: "block", marginBottom: 2 }}>New here?</strong>The big number is your Jodi Score. Tap any <b>i</b> to learn what it means.
                    <button type="button" onClick={gotIt} style={{ display: "block", marginTop: 6, padding: 0, background: "transparent", border: 0, color: "var(--saffron)", font: "700 12px var(--sans)" }}>Got it</button>
                  </div>
                )}
              </div>
              <div style={{ position: "absolute", top: 14, right: 14, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                {card.verified && <span style={{ background: "rgba(255,255,255,0.92)", borderRadius: 999, padding: "6px 10px", font: "600 12px var(--sans)", color: "var(--ink)", display: "flex", gap: 6, alignItems: "center" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#E07B00" strokeWidth="2.4" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>Verified</span>}
                {card.liked_me && <span style={{ background: "var(--rose)", borderRadius: 999, padding: "6px 10px", font: "700 12px var(--sans)", color: "#fff" }}>Likes you</span>}
                <SampleTag on={card.is_sample} />
              </div>
            </PhotoBlock>
            <div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="row" style={{ alignItems: "baseline", justifyContent: "space-between" }}>
                <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 26, fontWeight: 600 }}><Link href={`/profile/${card.id}`} style={{ color: "var(--ink)", textDecoration: "none" }}>{card.first_name}{card.age ? `, ${card.age}` : ""}</Link></h1>
                {TIER_LABEL[card.tier] && <span className="tag tier">{TIER_LABEL[card.tier]}</span>}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{[card.city, card.profession].filter(Boolean).join(" · ")}</div>
              {card.moon_sign && <div style={{ fontSize: 13 }}>{card.moon_sign} Moon · {card.nakshatra} nakshatra · {card.manglik ? "Manglik" : "Not Manglik"}<Info cls="tip-up" text="Manglik: a Mars placement some families check. We show it, never filter by it." /></div>}
              {card.summary && <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.5, color: "#3D3560" }}>Why the stars like you two: {card.summary}</p>}
              <div className="row" style={{ gap: 14 }}>
                <Link href={`/profile/${card.id}`} style={{ fontSize: 13, fontWeight: 600 }}>Full profile</Link>
                <Link href={`/report/${card.id}`} style={{ fontSize: 13, fontWeight: 600 }}>Full compatibility report · {price(prices, "full_report", 29)} credits</Link>
              </div>
            </div>
          </article>
          <ErrorNote error={error} />
          <div className="row" style={{ gap: 12 }}>
            <button type="button" className="btn outline" style={{ flex: 1 }} onClick={pass} disabled={busy}>Not my nakshatra</button>
            <button type="button" className="btn mid" style={{ flex: 1 }} onClick={like} disabled={busy}>Shoot your shot</button>
          </div>
        </> : <EmptySky city={city} filters={filters} onWiden={load} />}
      </main>
    </div>
  );
}

function EmptySky({ city, filters, onWiden }: { city: string; filters: Filters | null; onWiden(): Promise<void> }) {
  const { prices } = useApp();
  const [more, setMore] = useState<number | null>(null);
  useEffect(() => { if (filters?.distance === "same_city") api().discoverCount(true).then(setMore).catch(() => {}); }, [filters]);
  const widen = async () => { if (filters) { await api().saveFilters({ ...filters, distance: "any_city" }); await onWiden(); } };
  return (
    <section className="stack" style={{ gap: 16 }} aria-label="Nobody new right now">
      <div className="empty" style={{ padding: "12px 8px 4px" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 26, fontWeight: 600, lineHeight: 1.2 }}>You&apos;ve seen every star in {city} tonight</h1>
        <p className="sub">New ones rise tomorrow. Or widen your sky now:</p>
      </div>
      <div className="stack" style={{ gap: 10 }}>
        {filters?.distance === "same_city" && (
          <button type="button" className="rowlink" onClick={widen} style={{ textAlign: "left", font: "inherit" }}>
            <span className="t"><strong>Switch to Any city</strong><span>{more === null ? "People in other live cities" : more > 0 ? `+${more} people in other cities` : "Nobody new there yet either"}</span></span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#1F5E49" }}>Free</span>
          </button>
        )}
        <Link href="/filters" className="rowlink"><span className="t"><strong>Adjust your filters</strong><span>Age, languages, height and more</span></span><span style={{ fontSize: 12, fontWeight: 700, color: "#1F5E49" }}>Free</span></Link>
        <Link href="/tiers" className="rowlink"><span className="t"><strong>Top matches across India</strong><span>Highest Jodi Scores, any city</span></span><span style={{ fontSize: 12, fontWeight: 700, color: "var(--link)" }}>{price(prices, "top_matches_india", 49)} / week</span></Link>
        <Link href="/travel" className="rowlink"><span className="t"><strong>Travel Mode</strong><span>Going somewhere soon? Match there first</span></span><span style={{ fontSize: 12, fontWeight: 700, color: "var(--link)" }}>{price(prices, "travel_mode", 29)} / trip</span></Link>
      </div>
    </section>
  );
}
