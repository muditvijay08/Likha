import type { Metadata } from "next";
import Link from "next/link";
import { Crumbs, Cta } from "@/components/site/chrome";
import { ELEMENT_WORD, RASHIS } from "@/lib/rashi";

export const metadata: Metadata = {
  title: "The 12 rashis (Moon signs) in love · Vedic astrology",
  description: "All 12 Vedic Moon signs, from Mesh (Aries) to Meen (Pisces): their element, ruling planet, nakshatras, what each needs in love, and their best Moon-sign matches.",
  alternates: { canonical: "/rashi" },
};

export default function Rashis() {
  return (
    <>
      <section><div className="wrap">
        <Crumbs items={[["Likha", "/"], ["Rashis"]]} />
        <span className="eyebrow">Moon signs</span>
        <h1 style={{ marginTop: 10 }}>The 12 rashis in love</h1>
        <p className="lead" style={{ marginTop: 14 }}>Your rashi is your Moon sign: the heart of a Vedic chart and of kundli matching. <Link href="/moon-sign-calculator">Find yours</Link>.</p>
      </div></section>
      <section className="tight"><div className="wrap"><div className="grid3">
        {RASHIS.map((r) => (
          <Link key={r.slug} href={`/rashi/${r.slug}`} className="tile" style={{ padding: 20, gap: 8 }}>
            <strong style={{ fontSize: 22 }}>{r.hi} <span style={{ fontFamily: "var(--sans)", fontSize: 14, color: "var(--muted)" }}>{r.deva} · {r.en}</span></strong>
            <span>{ELEMENT_WORD[r.element]} sign · ruled by {r.lord} · the {r.symbol}</span>
            <span style={{ color: "var(--ink)" }}>{r.love}</span>
          </Link>))}
      </div></div></section>
      <Cta />
    </>
  );
}
