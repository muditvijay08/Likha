import type { Metadata } from "next";
import Link from "next/link";
import { Crumbs, Cta, Faq } from "@/components/site/chrome";

export const metadata: Metadata = {
  title: "Manglik dosha explained · What it is and why Likha never filters by it",
  description: "Manglik (Mangal) dosha in plain words: which Mars placements count, the classical exceptions, what it means for matching, and why Likha shows it but never hides anyone because of it.",
  alternates: { canonical: "/manglik-dosha" },
};

export default function Manglik() {
  return (
    <>
      <section><div className="wrap narrow">
        <Crumbs items={[["Likha", "/"], ["Guides"], ["Manglik dosha"]]} />
        <span className="eyebrow">Guide</span>
        <h1 style={{ marginTop: 10 }}>Manglik dosha, without the fear</h1>
        <p className="lead" style={{ marginTop: 14 }}>A lot of people worry about being Manglik. Here is what it actually means, and how Likha handles it.</p>
      </div></section>
      <section className="tight"><div className="wrap narrow prose">
        <h2>What it is</h2>
        <p>Someone is called Manglik when Mars (Mangal) sits in certain houses of their birth chart: traditionally the 1st, 2nd, 4th, 7th, 8th or 12th, counted from the ascendant (and often also checked from the Moon and Venus).
          Mars is a planet of energy and drive, so the old idea is that its placement can bring heat into a marriage.</p>
        <h2>It&apos;s very common</h2>
        <p>Because six of the twelve houses count, a large share of people are Manglik by the simplest rule. That&apos;s one reason classical texts list many exceptions.</p>
        <h2>The classical exceptions</h2>
        <ul>
          <li>Both partners are Manglik: traditionally, the effects balance out.</li>
          <li>Mars is in its own sign or exalted, or in certain signs for certain houses.</li>
          <li>Other planets in the chart, such as Jupiter, aspect or support Mars.</li>
        </ul>
        <p>Astrologers apply these differently, which is why two people can give different answers for the same chart.</p>
        <h2>How Likha handles it</h2>
        <p>Many families check Manglik status, so Likha shows it on every profile, worked out from your real chart, with the main exceptions applied.
          <strong> We never use it as a filter.</strong> No one is hidden from you, or you from them, for being Manglik. It&apos;s one factor of many, and the two of you decide what matters.</p>
        <p>We also don&apos;t sell remedies, pujas or gemstones, and we never make predictions about anyone&apos;s health or life.</p>
        <p>Want the bigger picture? Read <Link href="/kundli-matching">how kundli matching works</Link>.</p>
      </div></section>
      <section><div className="wrap narrow">
        <div className="sec-head"><h2>Questions</h2></div>
        <Faq items={[
          ["Can a Manglik marry a non-Manglik?", "Yes. Many couples do. Traditional matching suggests looking at the exceptions and the whole chart rather than one factor. It's your choice and your family's."],
          ["Does Manglik dosha go away after 28?", "Some traditions say its effect lessens with age; texts don't agree on this. Likha shows your chart as it is and doesn't make that call for you."],
          ["Will being Manglik hurt my matches on Likha?", "No. Likha never filters by Manglik status. People see it on your profile, along with everything else about your match."],
        ]} />
      </div></section>
      <Cta />
    </>
  );
}
