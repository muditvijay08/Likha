import type { Metadata } from "next";
import Link from "next/link";
import { Crumbs, Cta, Faq, JsonLd } from "@/components/site/chrome";
import { KOOTAS } from "@/lib/rashi";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Kundli matching explained · 36 Gunas and the 8 kootas (Ashtakoot Guna Milan)",
  description: "How kundli matching works: the 8 kootas of Ashtakoot Guna Milan, what each one measures, what 18, 25 and 33 Gunas mean, Nadi and Bhakoot dosha, and how Likha uses it.",
  alternates: { canonical: "/kundli-matching" },
};

export default function KundliMatching() {
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Article", headline: "Kundli matching explained: the 36 Gunas and 8 kootas",
        author: { "@type": "Organization", name: "Likha" }, publisher: { "@type": "Organization", name: "Likha" }, mainEntityOfPage: `${SITE_URL}/kundli-matching`, inLanguage: "en-IN" }} />
      <section><div className="wrap narrow">
        <Crumbs items={[["Likha", "/"], ["Guides"], ["Kundli matching"]]} />
        <span className="eyebrow">Guide</span>
        <h1 style={{ marginTop: 10 }}>Kundli matching, explained simply</h1>
        <p className="lead" style={{ marginTop: 14 }}>Kundli milan, or Guna Milan, compares two birth charts across eight areas called kootas. Together they add up to 36 points, called Gunas.</p>
      </div></section>
      <section className="tight"><div className="wrap narrow prose">
        <h2>Where the match comes from</h2>
        <p>North Indian matching (Ashtakoot) is read from the <strong>Moon</strong>: the sign the Moon was in when you were born (your rashi) and the nakshatra, or birth star, it was in.
          That&apos;s why you need a birth date, time and place: the Moon moves through a whole sign in about two and a half days, and through a nakshatra in about a day.
          Don&apos;t know yours? <Link href="/moon-sign-calculator">Find your Moon sign</Link>.</p>
        <h2>The 8 kootas</h2>
        <table className="t"><thead><tr><th>Koota</th><th>Points</th><th>What it looks at</th><th>Comes from</th></tr></thead><tbody>
          {KOOTAS.map(([k, pts, what, from]) => <tr key={k}><td><strong>{k}</strong></td><td>{pts}</td><td>{what}</td><td>{from === "moon" ? "Moon signs" : "Nakshatras"}</td></tr>)}
          <tr><td><strong>Total</strong></td><td><strong>36</strong></td><td colSpan={2}>Nadi and Bhakoot carry the most weight.</td></tr>
        </tbody></table>
        <h2>What the total means</h2>
        <ul>
          <li><strong>33 to 36:</strong> traditionally an excellent match.</li>
          <li><strong>25 to 32:</strong> traditionally a good match.</li>
          <li><strong>18 to 24:</strong> traditionally acceptable.</li>
          <li><strong>Under 18:</strong> below the traditional mark. Many happy couples are here too.</li>
        </ul>
        <p>The Gunas are a starting point, not a verdict. Two people who talk honestly will always do better than a perfect score.</p>
        <h2>Doshas and their cancellations</h2>
        <p><strong>Nadi dosha</strong> means both people share the same Nadi (0 of 8 points). Classical texts cancel it when, for example, the nakshatra is the same but the Moon sign differs, or the Moon sign is the same but the nakshatra differs.</p>
        <p><strong>Bhakoot dosha</strong> comes from how far apart the two Moon signs are: 2/12, 5/9 and 6/8 positions score 0 of 7. It&apos;s cancelled when both signs share a ruling planet or their rulers are friends.
          See any pair on our <Link href="/compatibility">Moon-sign compatibility</Link> pages.</p>
        <p><strong>Manglik</strong> isn&apos;t one of the 8 kootas. It&apos;s a separate check of where Mars sits. <Link href="/manglik-dosha">Read about Manglik dosha</Link>.</p>
        <h2>How Likha uses it</h2>
        <p>Likha works out both charts from astronomical data and shows the full Guna Milan, each koota and any doshas on every profile. Cancelled doshas get their points back, as the classical rules say.
          Your <strong>Jodi Score</strong> adds other chart factors to the Gunas. Your birth details are never shown to anyone.</p>
      </div></section>
      <section><div className="wrap narrow">
        <div className="sec-head"><h2>Questions</h2></div>
        <Faq items={[
          ["How many Gunas are needed for marriage?", "Traditionally 18 or more of 36 is considered acceptable, 25 or more good, and 33 or more excellent. It's a guide used by many families, not a rule of law or a guarantee."],
          ["Can kundli matching be done without a birth time?", "Partly. The Moon sign is usually clear from the date alone, but the nakshatra can change during the day, so 24 of the 36 points need a birth time to be reliable."],
          ["Is Guna Milan the same as Porutham?", "No. Porutham is the South Indian method with its own set of checks. Likha uses North Indian Ashtakoot Guna Milan."],
          ["Is kundli matching scientific?", "It's a tradition, not a science. We show it because many people and families value it, and we're honest that a good score is a good start, not a promise."],
        ]} />
      </div></section>
      <Cta />
    </>
  );
}
