import type { Metadata } from "next";
import Link from "next/link";
import { Crumbs, Cta } from "@/components/site/chrome";
import { PairPicker } from "@/components/site/client";
import { RASHIS, pair } from "@/lib/rashi";

export const metadata: Metadata = {
  title: "Rashi compatibility · All 78 Vedic Moon-sign pairs",
  description: "Moon-sign (rashi) compatibility for every pair, from Mesh and Mesh to Meen and Meen: Graha Maitri, Bhakoot and doshas, worked out with the classical rules.",
  alternates: { canonical: "/compatibility" },
};

export default function Compatibility() {
  return (
    <>
      <section className="hero"><div className="wrap grid">
        <div className="copy">
          <Crumbs items={[["Likha", "/"], ["Compatibility"]]} />
          <span className="eyebrow">Rashi compatibility</span>
          <h1>How do your Moon signs match?</h1>
          <p className="lead">Pick two Moon signs to see Graha Maitri and Bhakoot: the 12 of 36 Guna points that come from Moon signs, with the classical dosha rules.</p>
        </div>
        <PairPicker />
      </div></section>
      <section className="tight"><div className="wrap">
        <div className="sec-head"><h2>Every pair</h2></div>
        <div style={{ overflowX: "auto" }}>
          <table className="t" style={{ minWidth: 760 }}><thead><tr><th></th>{RASHIS.map((r) => <th key={r.slug}>{r.hi}</th>)}</tr></thead><tbody>
            {RASHIS.map((a) => <tr key={a.slug}><th>{a.hi}</th>{RASHIS.map((b) => { const p = pair(a.i, b.i);
              return <td key={b.slug}><Link href={`/compatibility/${p.slug}`} aria-label={`${a.hi} and ${b.hi}: ${p.points} of 12`}>{p.points}</Link></td>; })}</tr>)}
          </tbody></table>
        </div>
        <p className="small" style={{ marginTop: 10 }}>Moon-sign points out of 12 (Graha Maitri 5 + Bhakoot 7, cancelled doshas restored). The full match also needs both nakshatras.</p>
      </div></section>
      <Cta />
    </>
  );
}
