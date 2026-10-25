import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crumbs, Cta, Faq } from "@/components/site/chrome";
import { BAND_WORD, ELEMENT_WORD, RASHIS, nakshatrasOf, pair, rashiBySlug } from "@/lib/rashi";

export const dynamicParams = false;
export function generateStaticParams() { return RASHIS.map((r) => ({ sign: r.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ sign: string }> }): Promise<Metadata> {
  const r = rashiBySlug((await params).sign);
  if (!r) return {};
  return {
    title: `${r.hi} rashi (${r.en} Moon sign) in love and compatibility`,
    description: `${r.hi} (${r.deva}, ${r.en}) Moon sign: a ${r.element} sign ruled by ${r.lord}. What a ${r.hi} Moon needs in love, its nakshatras, and its best and hardest Moon-sign matches.`,
    alternates: { canonical: `/rashi/${r.slug}` },
  };
}

export default async function RashiPage({ params }: { params: Promise<{ sign: string }> }) {
  const r = rashiBySlug((await params).sign);
  if (!r) notFound();
  const pairs = RASHIS.map((o) => ({ o, p: pair(r.i, o.i) })).sort((a, b) => b.p.points - a.p.points || a.o.i - b.o.i);
  const best = pairs.filter((x) => x.o.i !== r.i).slice(0, 3);
  return (
    <>
      <section><div className="wrap narrow">
        <Crumbs items={[["Likha", "/"], ["Rashis", "/rashi"], [`${r.hi} (${r.en})`]]} />
        <span className="eyebrow">Moon sign · {r.deva}</span>
        <h1 style={{ marginTop: 10 }}>{r.hi} rashi in love</h1>
        <p className="lead" style={{ marginTop: 14 }}>{r.en} Moon · {ELEMENT_WORD[r.element]} · {r.quality} · ruled by {r.lord} · the {r.symbol}</p>
      </div></section>
      <section className="tight"><div className="wrap narrow prose">
        <p>{r.love}</p>
        <p><strong>What a {r.hi} Moon needs:</strong> {r.needs}</p>
        <h2>Nakshatras in {r.hi}</h2>
        <p>{nakshatrasOf(r.i).join(", ")}. Your nakshatra decides 24 of the 36 Guna points, so two {r.hi} Moons can match very differently.</p>
        <h2>Best Moon-sign matches for {r.hi}</h2>
        <p>Counting only what Moon signs decide (Graha Maitri and Bhakoot, 12 of 36 points), {r.hi} gets on most easily with {best.map((b) => `${b.o.hi} (${b.o.en})`).join(", ")}.</p>
        <table className="t"><thead><tr><th>With</th><th>Moon-sign points</th><th>In short</th></tr></thead><tbody>
          {pairs.map(({ o, p }) => <tr key={o.slug}><td><Link href={`/compatibility/${p.slug}`}>{o.hi} ({o.en})</Link></td><td>{p.points} / 12</td><td>{BAND_WORD[p.band]}</td></tr>)}
        </tbody></table>
        <p className="small">Sorted by Moon-sign points. The full match also needs both nakshatras.</p>
      </div></section>
      <section><div className="wrap narrow">
        <Faq items={[
          [`Who should a ${r.hi} rashi marry?`, `By Moon signs alone, ${best.map((b) => b.o.hi).join(", ")} are the easiest matches for ${r.hi}. But 24 of the 36 Gunas come from nakshatras, so check the full kundli match before deciding anything.`],
          [`Which planet rules ${r.hi}?`, `${r.lord}. Its friendships with other planets decide the Graha Maitri koota (up to 5 points).`],
          [`Is ${r.hi} my Sun sign or Moon sign?`, `In Vedic astrology, rashi means Moon sign. Your Sun sign is often different. Find your Moon sign with our free calculator.`],
        ]} />
      </div></section>
      <Cta title={`Meet people who suit a ${r.hi} Moon`} />
    </>
  );
}
