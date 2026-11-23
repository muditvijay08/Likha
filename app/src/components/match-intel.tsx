"use client";
// Match Intelligence on screen: "Why this match? Real life". Separate from the kundli. Every line traces back to something
// one of you shared; anything missing says so. Shown on full profiles, with a one-line summary on Discover cards.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, type Card } from "@/lib/api";
import { compare, summaryLine, type Intel, type Item, type Side } from "@/lib/match-intel";

// my side, loaded once per page view and shared by every card
let mine: Promise<Side | null> | null = null;
export function loadMySide(): Promise<Side | null> {
  if (!mine) mine = (async () => {
    try {
      const [p, cat] = await Promise.all([api().myProfile(), api().interests().catch(() => [])]);
      const label = new Map(cat.map((i) => [i.id, i.label]));
      return {
        first_name: p.first_name, goal: p.goal, diet: p.diet, city: p.city, interests: p.interests.map((id) => label.get(id)).filter(Boolean) as string[],
        life: { drinking: p.drinking, smoking: p.smoking, kids: p.kids, relocate: p.relocate, marriage_timeline: p.marriage_timeline ?? null,
                languages: p.languages, hometown: p.hometown, workout: p.workout, family_setup: p.family_setup ?? null, career_plan: p.career_plan ?? null,
                comm_style: p.comm_style ?? null, conflict_style: p.conflict_style ?? null, weekend_style: p.weekend_style ?? null,
                money_style: p.money_style ?? null, life_values: p.life_values ?? [] },
      };
    } catch { mine = null; return null; }
  })();
  return mine;
}
/** call after the member edits their answers */
export const forgetMySide = () => { mine = null; };

export const sideOf = (c: Card): Side => ({ first_name: c.first_name, goal: c.goal, diet: c.diet, city: c.city, interests: c.interests ?? [], life: c.life ?? null });

export function useIntel(them: Card | null): Intel | null {
  const [me, setMe] = useState<Side | null>(null);
  useEffect(() => { let on = true; loadMySide().then((s) => { if (on) setMe(s); }); return () => { on = false; }; }, []);
  return useMemo(() => (me && them ? compare(me, sideOf(them)) : null), [me, them]);
}

export function IntelLine({ card }: { card: Card }) {
  const x = useIntel(card);
  if (!x) return null;
  return <span className="intel-line" data-verdict={x.verdict}>{summaryLine(x)}</span>;
}

const GROUPS: { status: Item["status"]; title: string; mark: string }[] = [
  { status: "align", title: "What lines up", mark: "✓" },
  { status: "talk", title: "Worth a conversation", mark: "•" },
  { status: "differ", title: "Where you differ", mark: "×" },
];

export function WhyThisMatch({ card, chatHref }: { card: Card; chatHref?: string | null }) {
  const x = useIntel(card);
  const [showUnknown, setShowUnknown] = useState(false);
  if (!x) return <div className="skel" style={{ height: 160 }} />;
  const unknown = x.items.filter((i) => i.status === "unknown");
  const theirMissing = unknown.filter((i) => i.missing === "them" || i.missing === "both").length;
  return (
    <section aria-label="Why this match: real life" className="intel">
      <div className="stack" style={{ gap: 4 }}>
        <span className="kicker" style={{ color: "var(--muted)" }}>Why this match · Real life</span>
        <h2 className="intel-head">{x.headline}</h2>
        <span className="small">Compared on {x.shared} of {x.total} things you both shared. Separate from the kundli.</span>
      </div>
      <div className="intel-bar" role="img" aria-label={`${x.counts.align} line up, ${x.counts.talk} to talk about, ${x.counts.differ} differ, ${x.counts.unknown} not known yet`}>
        {(["align", "talk", "differ", "unknown"] as const).map((s) => x.counts[s] ? <span key={s} data-s={s} style={{ flex: x.counts[s] }} /> : null)}
      </div>
      {GROUPS.map((g) => {
        const rows = x.items.filter((i) => i.status === g.status);
        if (!rows.length) return null;
        return (
          <div key={g.status} className="stack" style={{ gap: 0 }}>
            <h3 className="intel-group" data-s={g.status}><span aria-hidden="true">{g.mark}</span>{g.title}<span className="n">{rows.length}</span></h3>
            {rows.map((i) => (
              <div key={i.key} className="intel-row">
                <span className="area">{i.area}{i.weight === "big" && g.status !== "align" ? <em> · big one</em> : null}</span>
                <span className="text">{i.text}</span>
              </div>
            ))}
          </div>
        );
      })}
      {unknown.length > 0 && (
        <div className="stack" style={{ gap: 0 }}>
          <button type="button" className="intel-group as-btn" data-s="unknown" aria-expanded={showUnknown} onClick={() => setShowUnknown((v) => !v)}>
            <span aria-hidden="true">?</span>Not known yet<span className="n">{unknown.length}</span><span className="chev" aria-hidden="true">{showUnknown ? "–" : "+"}</span>
          </button>
          {showUnknown && unknown.map((i) => (
            <div key={i.key} className="intel-row"><span className="area">{i.area}</span><span className="text">{i.text}</span></div>
          ))}
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {x.myMissing.length > 0 && <Link href="/me/values" className="btn sm">Add your answers · 2 min</Link>}
            {theirMissing > 0 && chatHref && <Link href={chatHref} className="btn sm outline">Ask {card.first_name}</Link>}
          </div>
        </div>
      )}
      <p className="small" style={{ margin: 0 }}>Based only on what you both chose to share. Likha never scores religion or caste, and never guesses.</p>
    </section>
  );
}
