import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crumbs, Cta, Faq } from "@/components/site/chrome";
import { CityUnlocks, WaitlistForm } from "@/components/site/client";
import { CITY_PAGES } from "@/lib/site";

export const dynamicParams = false;
export function generateStaticParams() { return CITY_PAGES.map((c) => ({ city: c.slug })); }
const find = (s: string) => CITY_PAGES.find((c) => c.slug === s);

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const c = find((await params).city);
  if (!c) return {};
  return {
    title: `Kundli-matched dating in ${c.name} · Likha`,
    description: `Meet real people in ${c.name}, matched by your kundli. See Guna Milan and Jodi Score on every profile. Dating is free. Join the ${c.name} Founding Members.`,
    alternates: { canonical: `/dating/${c.slug}` },
  };
}

export default async function CityPage({ params }: { params: Promise<{ city: string }> }) {
  const c = find((await params).city);
  if (!c) notFound();
  return (
    <>
      <section className="hero"><div className="wrap grid">
        <div className="copy">
          <Crumbs items={[["Likha", "/"], ["Cities"], [c.name]]} />
          <span className="eyebrow">{c.name} · {c.region}</span>
          <h1>Kundli-matched dating in {c.name}</h1>
          <p className="lead">{c.blurb} On Likha every profile shows how your charts match, so you start with people who suit you.</p>
          <CityUnlocks />
        </div>
        <div id="join"><WaitlistForm /></div>
      </div></section>
      <section className="tight"><div className="wrap narrow prose">
        <h2>First-date ideas in {c.name}</h2>
        <p>Somewhere public and easy to leave: {c.spots.join(", ")}. Plan the date in the app, pick a good evening from your Golden Hours, and share it with someone you trust.</p>
        <p><Link href="/safety">How Likha keeps dates safe</Link> · <Link href="/how-it-works">How Likha works</Link></p>
      </div></section>
      <section><div className="wrap narrow">
        <Faq items={[
          [`Is Likha live in ${c.name}?`, `The city counter above shows the latest. If ${c.name} isn't open yet, join the Founding Members and we'll send you one SMS the day it opens.`],
          [`Is Likha free in ${c.name}?`, "Yes. Making your kundli, liking, matching and chatting are free everywhere. Some extras are paid, and you always see the price first."],
        ]} />
      </div></section>
      <Cta href="#join" label="Join" />
    </>
  );
}
