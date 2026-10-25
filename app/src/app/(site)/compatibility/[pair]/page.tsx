import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crumbs, Cta, Faq } from "@/components/site/chrome";
import { ALL_PAIRS, BAND_WORD, BHAKOOT_MEANING, ELEMENT_WORD, RASHIS, elementLine, pair, pairFromSlug, relation } from "@/lib/rashi";

export const dynamicParams = false;
export function generateStaticParams() { return ALL_PAIRS.map((p) => ({ pair: p.slug })); }

const names = (p: ReturnType<typeof pair>) => p.a.i === p.b.i ? `${p.a.en} and ${p.a.en} (${p.a.hi} and ${p.a.hi})` : `${p.a.en} and ${p.b.en} (${p.a.hi} and ${p.b.hi})`;

export async function generateMetadata({ params }: { params: Promise<{ pair: string }> }): Promise<Metadata> {
  const p = pairFromSlug((await params).pair);
  if (!p) return {};
  return {
    title: `${names(p)} compatibility · Vedic Moon signs`,
    description: `${p.a.hi} and ${p.b.hi} rashi compatibility: ${p.points} of 12 Moon-sign Guna points. Graha Maitri ${p.maitri}/5, Bhakoot ${p.bhakoot.pair}${p.bhakoot.dosha ? (p.bhakoot.cancelled ? " (dosha cancelled)" : " (dosha)") : ""}. What works, what to watch, and how to see the full 36.`,
    alternates: { canonical: `/compatibility/${p.slug}` },
  };
}

const REL: Record<string, string> = { F: "a friend", N: "neutral", E: "an enemy", same: "itself" };

export default async function PairPage({ params }: { params: Promise<{ pair: string }> }) {
  const p = pairFromSlug((await params).pair);
  if (!p) notFound();
  const { a, b, bhakoot: bk } = p;
  const same = a.i === b.i;
  const bkPoints = bk.dosha && bk.cancelled ? 7 : bk.points;
  const others = RASHIS.filter((r) => r.i !== b.i).slice(0, 12);
  return (
    <>
      <section><div className="wrap narrow">
        <Crumbs items={[["Likha", "/"], ["Compatibility", "/compatibility"], [same ? `${a.hi} and ${a.hi}` : `${a.hi} and ${b.hi}`]]} />
        <span className="eyebrow">Rashi compatibility</span>
        <h1 style={{ marginTop: 10 }}>{names(p)} compatibility</h1>
        <p className="lead" style={{ marginTop: 14 }}>What two Moon signs alone say, using the classical Ashtakoot rules.</p>
      </div></section>
      <section className="tight"><div className="wrap narrow">
        <div className="panel" style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
          <div className="score" aria-label={`${p.points} of 12 Moon-sign points`}><b>{p.points}</b><span>/ 12</span></div>
          <div className="stack" style={{ gap: 8, flex: 1, minWidth: 220 }}>
            <span className={`badge ${p.band === "strong" || p.band === "good" ? "green" : p.band === "mixed" ? "" : "rose"}`} style={{ alignSelf: "flex-start" }}>{BAND_WORD[p.band]}</span>
            <span className="sub">Graha Maitri {p.maitri} of 5 · Bhakoot {bkPoints} of 7{bk.dosha ? (bk.cancelled ? " (dosha cancelled)" : " (Bhakoot dosha)") : ""}. The other 24 Gunas depend on your two nakshatras.</span>
          </div>
        </div>
      </div></section>
      <section className="tight"><div className="wrap narrow prose">
        <h2>Your elements</h2>
        <p>{a.hi} is a {a.element} sign and {b.hi} is a {b.element} sign. {elementLine(a.element, b.element)}</p>
        <h2>Graha Maitri: {p.maitri} of 5</h2>
        <p>{same ? `Both Moons are ruled by ${a.lord}, which gives the full 5 points: you value the same things.`
          : a.lord === b.lord ? `Both signs are ruled by ${a.lord}, which gives the full 5 points: you value the same things.`
          : `${a.hi} is ruled by ${a.lord} and ${b.hi} by ${b.lord}. ${a.lord} sees ${b.lord} as ${REL[relation(a.lord, b.lord)]}, and ${b.lord} sees ${a.lord} as ${REL[relation(b.lord, a.lord)]}. `
            + (p.maitri >= 4 ? "That's a warm friendship between your minds." : p.maitri >= 3 ? "A fair, easygoing friendship." : p.maitri >= 1 ? "Some friction in how you think; patience helps." : "Your minds work very differently; understanding has to be built.")}</p>
        <h2>Bhakoot: {bk.pair}{bk.dosha ? (bk.cancelled ? ", dosha cancelled" : ", Bhakoot dosha") : ""}</h2>
        <p>{BHAKOOT_MEANING[bk.pair]}</p>
        {bk.dosha && <p>{bk.cancelled ? `The dosha is cancelled because ${bk.cancelled}, so the 7 points are counted back.` : "There's no classical cancellation for this pair, so it scores 0 of 7. Other parts of the chart can still balance it."}</p>}
        <h2>What this doesn&apos;t tell you</h2>
        <p>Moon signs decide 12 of the 36 Gunas. The other 24 (Tara, Yoni, Gana and Nadi) come from your nakshatras, and Nadi alone is worth 8.
          Two people with these signs can score anywhere from low to excellent. And no score is a promise: how you treat each other matters most.</p>
        <p><Link href={`/rashi/${a.slug}`}>More about {a.hi}</Link>{!same && <> · <Link href={`/rashi/${b.slug}`}>More about {b.hi}</Link></>} · <Link href="/kundli-matching">How kundli matching works</Link></p>
      </div></section>
      <section><div className="wrap narrow">
        <Faq items={[
          [`Are ${a.hi} and ${b.hi} compatible?`, `By Moon signs alone they score ${p.points} of 12 points (${BAND_WORD[p.band].toLowerCase()}). The full answer needs both nakshatras, which decide the other 24 Gunas.`],
          [`Is there Bhakoot dosha between ${a.hi} and ${b.hi}?`, bk.dosha ? `Their signs are ${bk.pair} apart, which is a Bhakoot dosha position. ${bk.cancelled ? `It's cancelled because ${bk.cancelled}.` : "There's no classical cancellation for this pair."}` : `No. Their signs are ${bk.pair} apart, which is a favourable position (7 of 7).`],
        ]} />
      </div></section>
      <section className="tight"><div className="wrap">
        <div className="sec-head"><h2>{a.hi} with other signs</h2></div>
        <div className="grid4">{others.map((o) => { const q = pair(a.i, o.i); return <Link key={o.slug} className="tile" href={`/compatibility/${q.slug}`}><strong>{a.hi} and {o.hi}</strong><span>{q.points} / 12 · {BAND_WORD[q.band]}</span></Link>; })}</div>
      </div></section>
      <Cta title={`See your full match, not just ${a.hi} and ${b.hi}`} />
    </>
  );
}
