// L9 Founding Members website (likha.in). Server-rendered for search engines; the form and city counts load in the browser.
import type { Metadata } from "next";
import Link from "next/link";
import { Cta, Faq, Icon, JsonLd, RashiLinks } from "@/components/site/chrome";
import { CityUnlocks, SignedInRedirect, WaitlistForm } from "@/components/site/client";
import { GUIDES, SITE_URL, TAGLINE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Likha · Kundli-first dating app · Swipe less, match written in the stars",
  description: "Real people, matched by your kundli. See your Guna Milan and Jodi Score on every profile. Dating is free. Join as a Founding Member: Jaipur is live, Pune, Ahmedabad and Dubai open next.",
  alternates: { canonical: "/" },
  openGraph: { title: "Likha · Kundli-first dating", description: "Real people, matched by your kundli. Dating is free.", url: "/", siteName: "Likha", locale: "en_IN", type: "website" },
};

const FAQ: [string, string][] = [
  ["Is Likha free?", "Yes. Making your kundli, liking, matching and chatting are free. Some extras, like detailed readings and Boost, are paid, and you always see the price first."],
  ["What is a kundli-first dating app?", "Instead of only photos, every profile shows how your birth charts match: the traditional 36-Guna Milan and Likha's Jodi Score. You still decide who to like; the stars just help you start with better odds."],
  ["Do other people see my birth date or time?", "No. Your birth date, time and place stay private. Others see only your Moon sign, nakshatra and how well your charts match."],
  ["Are the profiles real?", "Every member signs up with their own phone number and takes a selfie at sign-up. Likha never creates fake profiles, and our safety team reviews every report."],
  ["When does my city open?", "Each city opens when it reaches its Founding Members. Join the list and we'll send you one SMS the day your city opens."],
];

export default function Home() {
  return (
    <>
      <SignedInRedirect />
      <JsonLd data={[
        { "@context": "https://schema.org", "@type": "Organization", name: "Likha", url: SITE_URL, logo: `${SITE_URL}/icons/icon-512.png`,
          parentOrganization: { "@type": "Organization", name: "Young Attitude Group" }, address: { "@type": "PostalAddress", addressLocality: "Jaipur", addressRegion: "Rajasthan", addressCountry: "IN" } },
        { "@context": "https://schema.org", "@type": "WebSite", name: "Likha", url: SITE_URL, inLanguage: "en-IN" },
      ]} />
      <section className="hero">
        <div className="wrap grid">
          <div className="copy">
            <span className="eyebrow">Founding Members · Jaipur first</span>
            <h1>{TAGLINE}</h1>
            <p className="lead">A kundli-first dating app, made in Jaipur. Real people, matched by your kundli. Free to date.
              Each city opens when its Founding Members join.</p>
            <CityUnlocks />
          </div>
          <div id="join" style={{ scrollMarginTop: 80 }}><WaitlistForm /></div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="sec-head"><span className="eyebrow">Why Likha</span><h2>Less swiping. Better starts.</h2></div>
          <div className="grid3">
            <div className="feature"><span className="icon">{Icon.stars}</span><h3>Kundli-matched</h3>
              <p>Every profile shows your Jodi Score and Guna Milan, worked out from both of your real birth charts.</p></div>
            <div className="feature"><span className="icon v">{Icon.shield}</span><h3>Only real people</h3>
              <p>Phone sign-up and a selfie step for everyone, women-first controls, and a safety team behind every report.</p></div>
            <div className="feature"><span className="icon r">{Icon.sun}</span><h3>Your Daily Kick</h3>
              <p>A short morning reading of your day: your mood, your date score and the best time to say hi.</p></div>
          </div>
          <p style={{ marginTop: 18 }}><Link href="/how-it-works">How Likha works →</Link></p>
        </div>
      </section>

      <section className="tight">
        <div className="wrap">
          <div className="panel" style={{ display: "flex", gap: 24, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", background: "linear-gradient(135deg,#FFF0F4,#FFF9EC)" }}>
            <div style={{ maxWidth: 560 }}><span className="eyebrow">Got a crush?</span><h2 style={{ marginTop: 8 }}>Check if it&apos;s written in the stars.</h2>
              <p className="sub" style={{ marginTop: 8 }}>See how your Moon signs get along for free, then invite them to see the full match together.</p></div>
            <Link className="pill-btn lg" href="/check-your-crush">Check your crush</Link>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="sec-head"><span className="eyebrow">Learn</span><h2>Kundli matching, explained simply</h2></div>
          <div className="grid4">{GUIDES.map((g) => <Link key={g.href} className="tile" href={g.href}><strong>{g.title}</strong><span>{g.sub}</span></Link>)}</div>
        </div>
      </section>

      <RashiLinks />

      <section>
        <div className="wrap narrow">
          <div className="sec-head"><h2>Questions</h2></div>
          <Faq items={FAQ} />
          <p style={{ marginTop: 16 }}><Link href="/faq">More questions →</Link></p>
        </div>
      </section>
      <Cta title="Be one of the first in your city" sub="Founding Members hear first, by SMS, the day their city opens." />
    </>
  );
}
