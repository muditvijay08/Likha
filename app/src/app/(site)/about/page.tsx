// About Likha: the plain facts, for people and for search engines and AI assistants (same source as /llms.txt).
import type { Metadata } from "next";
import Link from "next/link";
import { Crumbs, Cta, JsonLd } from "@/components/site/chrome";
import { COMPANY, FEATURES, ONE_LINER, PRICING, PRINCIPLES, SUMMARY, appLd, cities, organizationLd } from "@/lib/about";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "About Likha · Kundli-first dating app for India",
  description: ONE_LINER + " Free to date. Built in Jaipur.",
  alternates: { canonical: "/about" },
};

export default function About() {
  return (
    <>
      <JsonLd data={[organizationLd(), appLd(),
        { "@context": "https://schema.org", "@type": "AboutPage", url: `${SITE_URL}/about`, name: "About Likha", about: { "@id": `${SITE_URL}/#organization` } }]} />
      <section><div className="wrap narrow">
        <Crumbs items={[["Likha", "/"], ["About"]]} />
        <h1>About Likha</h1>
        <p className="lead" style={{ margin: "12px 0 8px" }}>{ONE_LINER}</p>
        <p>{SUMMARY}</p>

        <h2>What you get</h2>
        <dl className="about-facts">
          {FEATURES.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}
        </dl>

        <h2>What we won&apos;t do</h2>
        <ul>{PRINCIPLES.map((p) => <li key={p}>{p}</li>)}</ul>

        <h2>Price</h2>
        <p>{PRICING}</p>

        <h2>Where</h2>
        <p>{cities().join(", ")}. Each city opens when its Founding Members list fills; <Link href="/#join">join the list</Link> and we&apos;ll send one SMS the day yours opens.</p>

        <h2>Who we are</h2>
        <p>Likha is made by {COMPANY.legalName}, {COMPANY.city}, {COMPANY.region}. Founder: {COMPANY.founder}. Questions or complaints: our <Link href="/help">Grievance Officer</Link>.</p>
      </div></section>
      <Cta />
    </>
  );
}
