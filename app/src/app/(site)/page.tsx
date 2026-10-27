// L9 Founding Members website (likha.in). Server-rendered for search engines; the form and city counts load in the browser.
// Design: night sky over the Pink City. The kundli in the hero draws itself once; everything else stays still.
import type { Metadata } from "next";
import Link from "next/link";
import { Cta, Faq, JsonLd, RashiLinks } from "@/components/site/chrome";
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

// North Indian chart: houses run anticlockwise from the top diamond. Sign numbers as on a real chart (Simha lagna).
const HOUSES: [number, number][] = [[200, 118], [110, 52], [52, 110], [118, 200], [52, 290], [110, 352], [200, 282], [290, 352], [348, 290], [282, 200], [348, 110], [290, 52]];

function KundliArt() {
  return (
    <div className="kundli-art" role="img" aria-label="A North Indian kundli chart with 27 of 36 Gunas matched, between two sample profiles">
      <svg className="chart" viewBox="0 0 400 400" aria-hidden="true">
        <path className="ln" pathLength={1} d="M20 20H380V380H20Z" />
        <path className="ln soft" pathLength={1} d="M20 20L380 380" />
        <path className="ln soft" pathLength={1} d="M380 20L20 380" />
        <path className="ln" pathLength={1} d="M200 20L380 200L200 380L20 200Z" />
        <circle cx="200" cy="200" r="74" fill="#1C1442" stroke="rgba(255,176,32,.5)" strokeWidth="1.2" />
        {HOUSES.map(([x, y], i) => <text key={i} className="glyph" x={x} y={y} textAnchor="middle" dominantBaseline="middle">{((i + 4) % 12) + 1}</text>)}
        <path className="moon" d="M128 222a12 12 0 1 0 12 -16a9 9 0 1 1 -12 16z" />
        <path className="moon" d="M300 222a12 12 0 1 0 12 -16a9 9 0 1 1 -12 16z" />
      </svg>
      <div className="gunas"><b className="count" aria-hidden="true" /><span>of 36 Gunas</span></div>
      <div className="k-card her"><span className="av" style={{ background: "#FFE4EC", color: "#E8457A" }}>R</span><span>Riya, 26<small>Jodi Score 92%</small></span></div>
      <div className="k-card him"><span className="av" style={{ background: "#E3ECFF", color: "#2F6FE0" }}>A</span><span>Aarav, 28<small>Meen Moon</small></span></div>
      <span className="sample">Sample profiles</span>
    </div>
  );
}

function Phone() {
  return (
    <figure style={{ margin: 0 }}>
      <div className="phone" aria-hidden="true"><div className="scr">
        <div className="photo">R<span className="score">92% Jodi</span></div>
        <div className="body">
          <span className="name">Riya, 26</span>
          <div className="facts"><span>Kanya Moon</span><span>Hasta</span><span>27 of 36 Gunas</span><span>Not Manglik</span></div>
          <span className="why">Two earth Moons: steady, loyal, practical. Talk about plans early and you&apos;ll get on easily.</span>
          <div className="acts"><span>Pass</span><span className="like">Like</span></div>
        </div>
      </div></div>
      <figcaption className="phone-cap">A sample profile, as you&apos;ll see it in the app</figcaption>
    </figure>
  );
}

export default function Home() {
  return (
    <>
      <SignedInRedirect />
      <JsonLd data={[
        { "@context": "https://schema.org", "@type": "Organization", name: "Likha", url: SITE_URL, logo: `${SITE_URL}/icons/icon-512.png`,
          parentOrganization: { "@type": "Organization", name: "Young Attitude Group" }, address: { "@type": "PostalAddress", addressLocality: "Jaipur", addressRegion: "Rajasthan", addressCountry: "IN" } },
        { "@context": "https://schema.org", "@type": "WebSite", name: "Likha", url: SITE_URL, inLanguage: "en-IN" },
      ]} />

      <section className="night home-hero">
        <div className="stars" />
        <div className="wrap grid">
          <div className="copy">
            <p className="deva" lang="hi" style={{ margin: 0 }}>जो लिखा है, वो मिलेगा</p>
            <h1>{TAGLINE}</h1>
            <p className="lead">Likha is a dating app that starts with your kundli. Every profile shows how your charts match, so you meet people who suit you. Dating is free.</p>
            <div className="actions">
              <Link className="pill-btn lg" href="#join">Join the Founding Members</Link>
              <Link className="pill-btn lg ghost" href="/check-your-crush">Check your crush</Link>
            </div>
            <span className="live"><i aria-hidden="true" />Opening city by city, starting with Jaipur</span>
          </div>
          <KundliArt />
        </div>
      </section>

      <section className="founding">
        <div className="wrap grid">
          <div id="join" className="form-col" style={{ scrollMarginTop: 90 }}><WaitlistForm /></div>
          <div className="f-info">
            <h2>Each city opens when its Founding Members join</h2>
            <p className="lead">Put your name down for your city. You&apos;ll get one SMS the day it opens, and an invite link that moves you up the list for every friend who joins.</p>
            <CityUnlocks />
          </div>
        </div>
      </section>

      <section className="written">
        <div className="wrap grid">
          <div>
            <div className="sec-head"><h2>How a match is written</h2></div>
            <ol>
              <li><div><h3>Make your kundli</h3><p>Add your birth date, time and place. Likha works out your chart in a minute, free. Your birth details stay private.</p></div></li>
              <li><div><h3>See how you match</h3><p>Every profile shows your Guna Milan out of 36 and your Jodi Score, worked out from both real charts.</p></div></li>
              <li><div><h3>Like, match and chat</h3><p>If they like you back, the chat opens. Golden Hours show the best windows for the two of you to talk or meet.</p></div></li>
              <li><div><h3>Meet safely</h3><p>Share your date with someone you trust. Likha checks in afterwards, and texts them if you don&apos;t answer.</p></div></li>
            </ol>
            <p style={{ marginTop: 28 }}><Link href="/how-it-works">More about how Likha works</Link></p>
          </div>
          <Phone />
        </div>
      </section>

      <section style={{ background: "#fff" }}>
        <div className="wrap">
          <div className="sec-head"><h2>Made for how India dates</h2></div>
          <div className="promises">
            <div><h3>Real people only</h3><p>Phone sign-up and a selfie step for everyone. Likha never creates fake profiles, and a safety team reviews every report.</p></div>
            <div><h3>Women set the pace</h3><p>Women can choose to message first. Anyone can go incognito, so only people they&apos;ve liked can see them.</p></div>
            <div><h3>Manglik shown, never a filter</h3><p>Families check it, so we show it. We never hide anyone because of it, and we don&apos;t ask about caste.</p></div>
            <div><h3>Honest about the stars</h3><p>A good match is a good start, not a promise. No predictions of illness, no remedies for sale.</p></div>
          </div>
          <p style={{ marginTop: 32 }}><Link href="/safety">How Likha keeps you safe</Link></p>
        </div>
      </section>

      <section className="crush">
        <div className="wrap grid">
          <div className="stack" style={{ gap: 16 }}>
            <h2>Got a crush? See if it&apos;s written in the stars.</h2>
            <p className="lead" style={{ color: "#FFE3EC" }}>Check how your Moon signs get along for free, then send them an invite from your own WhatsApp to unlock the full match together.</p>
            <div><Link className="pill-btn lg" href="/check-your-crush">Check your crush</Link></div>
          </div>
          <div className="pair" aria-hidden="true"><span>Y</span><span>?</span></div>
        </div>
      </section>

      <RashiLinks />

      <section style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="sec-head"><h2>Kundli matching, in plain words</h2></div>
          <div className="guide-list">{GUIDES.map((g) => <Link key={g.href} href={g.href}><strong>{g.title}</strong><span>{g.sub}</span></Link>)}</div>
        </div>
      </section>

      <section style={{ background: "#fff" }}>
        <div className="wrap narrow">
          <div className="sec-head"><h2>Questions</h2></div>
          <Faq items={FAQ} />
          <p style={{ marginTop: 20 }}><Link href="/faq">All questions</Link></p>
        </div>
      </section>
      <Cta title="Be one of the first in your city" sub="Founding Members hear first, by SMS, the day their city opens." label="Join the list" />
    </>
  );
}
