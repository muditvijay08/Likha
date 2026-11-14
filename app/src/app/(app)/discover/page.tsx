"use client";
// D1 Discover (one card at a time, best Jodi Score first) and D6 when there is nobody left.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ErrorNote, useAction } from "@/components/ui";
import { CreditsPill, GOAL_LABEL, GUNA_INFO, Info, JODI_INFO, PhotoBlock, SampleTag, price, useApp } from "@/components/app";
import { Badge, MoonPortrait } from "@/components/kit";
import { api, type Card, type Filters, type SaathiState } from "@/lib/api";
import { LiveStrip } from "@/components/live";

const COACH = "likha-coach-jodi";
const seen = () => { try { return localStorage.getItem(COACH) === "1"; } catch { return true; } };

export default function Discover() {
  const router = useRouter();
  const { home, prices, reload } = useApp();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [coach, setCoach] = useState(false);
  const { busy, error, run } = useAction();

  const load = useCallback(async () => {
    const [c, f] = await Promise.all([api().discover(0), api().filters()]);
    setCards(c); setFilters(f);
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
    <div className="app-body flush wide">
      <header className="row" style={{ justifyContent: "space-between", padding: "20px 20px 12px" }}>
        <div className="wordmark desk-hide" style={{ fontSize: 24 }}>Likha<span>.</span></div>
        <div className="row" style={{ marginLeft: "auto" }}>
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
        {card && <LiveStrip />}{/* never next to "you've seen everyone" */}

        {cards === null ? <div className="skel" style={{ height: 460 }} /> : card ? <>
          <article className="disc-card overflow-hidden rounded-[26px] border border-line bg-card shadow-[0_10px_30px_-18px_rgba(29,24,56,.45)]">
            <div className="relative">
              {card.photos.length ? <PhotoBlock name={card.first_name} photos={card.photos} height={380} /> : <MoonPortrait name={card.first_name} moonSign={card.moon_sign} className="h-[380px]" />}
              {/* score first: Gunas big, Jodi explained */}
              <div className="absolute left-3.5 top-3.5 flex flex-col items-start gap-2">
                {card.gunas != null ? (
                  <div className="flex items-center gap-2.5 rounded-2xl bg-black/45 px-3 py-2 text-white backdrop-blur-md">
                    <span className="font-serif text-[30px] font-[560] leading-none">{Number.isInteger(card.gunas) ? card.gunas : card.gunas.toFixed(1)}</span>
                    <span className="flex flex-col font-sans leading-tight">
                      <span className="text-[11px] font-bold tracking-[.08em] text-[var(--star)]">OF 36 GUNAS<Info text={GUNA_INFO} /></span>
                      {card.jodi_score != null && <span className="text-xs text-white/85">Jodi Score {card.jodi_score}<Info text={JODI_INFO} /></span>}
                    </span>
                  </div>
                ) : <Badge tone="line">Score on its way</Badge>}
                {coach && (
                  <div role="note" className="relative mt-1 w-[220px] rounded-xl bg-ink px-3 py-2.5 font-sans text-xs leading-snug text-white shadow-xl">
                    <strong className="mb-0.5 block">New here?</strong>The big number is your Guna Milan, out of 36. Tap any <b>i</b> to see what a score means.
                    <button type="button" onClick={gotIt} className="mt-1.5 block border-0 bg-transparent p-0 font-sans text-xs font-bold text-[var(--star)]">Got it</button>
                  </div>
                )}
              </div>
              <div className="absolute right-3.5 top-3.5 flex flex-col items-end gap-1.5">
                {card.verified && <Badge tone="line" className="bg-white/92">✓ Verified</Badge>}
                {card.liked_me && <Badge tone="action" className="bg-action text-white">Likes you</Badge>}
                <SampleTag on={card.is_sample} />
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-5 pb-4 pt-16 text-white">
                <h1 className="m-0 font-serif text-[30px] font-[560] leading-tight">
                  <Link href={`/profile/${card.id}`} className="text-white no-underline hover:text-white">{card.first_name}{card.age ? `, ${card.age}` : ""}</Link>
                </h1>
                <div className="font-sans text-sm text-white/85">{[card.profession, card.city].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 px-5 pb-5 pt-4">
              {card.moon_sign && <div className="font-sans text-sm text-ink">{card.moon_sign} Moon · {card.nakshatra} · {card.manglik ? "Manglik" : "Not Manglik"}<Info cls="tip-up" text="Manglik: a Mars placement some families check. We show it, never filter by it." /></div>}
              {card.summary && <p className="m-0 font-sans text-[15px] leading-relaxed text-muted">{card.summary}</p>}
              <div className="flex flex-wrap gap-1.5">
                {card.goal && <Badge tone="gold" size="sm">{GOAL_LABEL[card.goal]}</Badge>}
                {card.interests.slice(0, 3).map((x) => <Badge key={x} tone="line" size="sm">{x}</Badge>)}
              </div>
              <div className="flex gap-4 pt-1">
                <Link href={`/profile/${card.id}`} className="font-sans text-sm font-bold">Full profile</Link>
                <Link href={`/report/${card.id}`} className="font-sans text-sm font-bold">Koota report</Link>
              </div>
            </div>
          </article>
          <ErrorNote error={error} />
          <div className="row disc-actions" style={{ gap: 12 }}>
            <button type="button" className="btn outline" style={{ flex: 1 }} onClick={pass} disabled={busy}>Not my nakshatra</button>
            <button type="button" className="btn mid" style={{ flex: 1 }} onClick={like} disabled={busy}>Shoot your shot</button>
          </div>
        </> : <EmptySky city={city} filters={filters} onWiden={load} />}
      </main>
    </div>
  );
}

const COMPANIONS = [
  { v: "chandni", name: "Chandni", line: "Warm, playful, remembers your day", bg: "linear-gradient(135deg, #FFC6D4, #C9B8FF)" },
  { v: "dhruv", name: "Dhruv", line: "Calm, witty, steady advice", bg: "linear-gradient(135deg, #C9B8FF, #A7D8F0)" },
] as const;

function EmptySky({ city, filters, onWiden }: { city: string; filters: Filters | null; onWiden(): Promise<void> }) {
  const { prices, home } = useApp();
  const [more, setMore] = useState<number | null>(null);
  const [saathi, setSaathi] = useState<SaathiState | null>(null);
  useEffect(() => { if (filters?.distance === "same_city") api().discoverCount(true).then(setMore).catch(() => {}); }, [filters]);
  useEffect(() => { api().saathi().then(setSaathi).catch(() => {}); }, []);
  // Companion matching who they usually want to meet comes first; both are always offered.
  const pair = home?.gender === "woman" ? [COMPANIONS[1], COMPANIONS[0]] : [COMPANIONS[0], COMPANIONS[1]];
  const widen = async () => { if (filters) { await api().saveFilters({ ...filters, distance: "any_city" }); await onWiden(); } };
  return (
    <section className="stack" style={{ gap: 16 }} aria-label="Nobody new right now">
      <div className="empty" style={{ padding: "12px 8px 4px" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 26, fontWeight: 600, lineHeight: 1.2 }}>That&apos;s everyone in {city} for now</h1>
        <p className="sub">New people join every day. The fastest way to more matches is bringing your own people.</p>
      </div>
      <section aria-label="Bring your people" className="stack" style={{ gap: 10, padding: 16, borderRadius: 20, background: "var(--ink)", color: "#fff" }}>
        <strong style={{ fontSize: 16 }}>Bring your people</strong>
        <Link href="/check" className="row" style={{ gap: 12, padding: 12, borderRadius: 14, background: "rgba(255,255,255,.08)", color: "#fff", textDecoration: "none" }}>
          <span className="stack" style={{ gap: 2, flex: 1 }}><strong style={{ fontSize: 14 }}>Check your crush</strong><span style={{ fontSize: 12, color: "#CFC6F2" }}>Send a link. See your Gunas once they join and say yes.</span></span><span aria-hidden="true">→</span></Link>
        <Link href="/invite" className="row" style={{ gap: 12, padding: 12, borderRadius: 14, background: "rgba(255,255,255,.08)", color: "#fff", textDecoration: "none" }}>
          <span className="stack" style={{ gap: 2, flex: 1 }}><strong style={{ fontSize: 14 }}>Invite single friends from {city}</strong><span style={{ fontSize: 12, color: "#CFC6F2" }}>You both get credits when they finish sign-up.</span></span><span aria-hidden="true">→</span></Link>
      </section>
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
      {saathi?.available && (
        <div className="stack" style={{ gap: 10, padding: 16, borderRadius: 20, background: "#F6F2FF", border: "1px solid var(--line)" }}>
          <div className="stack" style={{ gap: 2 }}>
            <strong style={{ fontSize: 15 }}>Want to talk while you wait?</strong>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>A virtual companion, not a real person. {saathi.free_per_day} free messages a day.</span>
          </div>
          <div className="grid2" style={{ gap: 10 }}>
            {pair.map((c) => (
              <Link key={c.v} href={`/saathi?char=${c.v}`} className="row" style={{ gap: 10, padding: 12, borderRadius: 16, background: "#fff", border: "1px solid var(--line)", color: "var(--ink)", textDecoration: "none", alignItems: "center" }}>
                <span aria-hidden="true" style={{ width: 40, height: 40, flex: "none", borderRadius: 999, background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--serif)", fontWeight: 600, color: "#3D3560" }}>{c.name[0]}</span>
                <span className="stack" style={{ gap: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 14 }}>{c.name} {saathi.setup && saathi.character === c.v && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--link)" }}>· yours</span>}</strong>
                  <span style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.3 }}>{c.line}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
