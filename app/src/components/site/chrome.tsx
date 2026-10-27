// Website header, footer and small shared pieces (server components: rendered into the HTML for search engines).
import Link from "next/link";
import type { ReactNode } from "react";
import { CITY_PAGES, GUIDES, SITE_URL } from "@/lib/site";
import { RASHIS } from "@/lib/rashi";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="wrap bar">
        <Link href="/" className="wordmark" aria-label="Likha home">Likha<span>.</span></Link>
        <nav aria-label="Main">
          <Link href="/how-it-works">How it works</Link>
          <Link href="/safety">Safety</Link>
          <Link href="/check-your-crush">Check your crush</Link>
          <Link href="/kundli-matching">Kundli matching</Link>
          <Link href="/compatibility">Compatibility</Link>
          <Link href="/get-the-app">Get the app</Link>
        </nav>
        <Link href="/start" className="signin">Sign in</Link>
        <Link href="/#join" className="pill-btn">Join the list</Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="cols">
          <div>
            <div className="wordmark">Likha<span>.</span></div>
            <p className="deva" lang="hi">जो लिखा है, वो मिलेगा</p>
            <p style={{ fontSize: 14, maxWidth: 300 }}>Real people, matched by your kundli. Dating is free. For people 18 and over.</p>
          </div>
          <div><h4>Likha</h4>
            <Link href="/how-it-works">How it works</Link><Link href="/safety">Safety</Link><Link href="/check-your-crush">Check your crush</Link>
            <Link href="/faq">Questions</Link><Link href="/get-the-app">Get the app</Link><Link href="/start">Sign in</Link></div>
          <div><h4>Guides</h4>{GUIDES.map((g) => <Link key={g.href} href={g.href}>{g.title}</Link>)}
            <Link href="/rashi">All 12 rashis</Link></div>
          <div><h4>Cities</h4>{CITY_PAGES.map((c) => <Link key={c.slug} href={`/dating/${c.slug}`}>Dating in {c.name}</Link>)}</div>
        </div>
        <div className="legal">
          <span>A Young Attitude Group company, Jaipur</span>
          <span style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <Link href="/legal/terms">Terms</Link><Link href="/legal/privacy">Privacy</Link><Link href="/legal/refunds">Refunds</Link>
            <Link href="/legal/disclaimer">Disclaimer</Link><Link href="/help">Grievance Officer</Link></span>
        </div>
      </div>
    </footer>
  );
}

export function Crumbs({ items }: { items: [string, string?][] }) {
  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        {items.map(([label, href], i) => <span key={label}>{i > 0 && <span aria-hidden="true">› </span>}{href ? <Link href={href}>{label}</Link> : <span aria-current="page">{label}</span>}</span>)}
      </nav>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "BreadcrumbList",
        itemListElement: items.map(([name, href], i) => ({ "@type": "ListItem", position: i + 1, name, ...(href ? { item: `${SITE_URL}${href}` } : {}) })) }} />
    </>
  );
}

export function JsonLd({ data }: { data: unknown }) {
  // JSON-LD for search engines; "<" is escaped so text can never close the script tag
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function Cta({ title = "See your full 36-Guna match", sub = "Make your kundli free, then meet real people matched by it. Dating on Likha is free.", href = "/#join", label = "Join Likha" }:
  { title?: string; sub?: string; href?: string; label?: string }) {
  return (
    <section className="tight"><div className="wrap"><div className="cta">
      <div><h2>{title}</h2><p>{sub}</p></div>
      <Link href={href} className="pill-btn lg">{label}</Link>
    </div></div></section>
  );
}

export function Faq({ items }: { items: [string, string][] }) {
  return (
    <>
      <div>{items.map(([q, a]) => <details key={q} className="faq"><summary>{q}</summary><p>{a}</p></details>)}</div>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }} />
    </>
  );
}

export function RashiLinks({ title = "Find your rashi on the wheel" }: { title?: string }) {
  return (
    <section className="wheel-sec"><div className="wrap grid">
      <div className="sec-head" style={{ marginBottom: 0 }}>
        <h2>{title}</h2>
        <p className="lead">Your rashi is your Moon sign: the heart of a Vedic chart and of kundli matching. Each one loves a little differently.</p>
        <p><Link href="/compatibility">See how every pair of signs gets along</Link></p>
      </div>
      <nav className="wheel" aria-label="The 12 rashis">
        {RASHIS.map((r) => <Link key={r.slug} href={`/rashi/${r.slug}`} style={{ ["--a" as string]: `${r.i * 30}deg` }}><b>{r.hi}</b><small>{r.en}</small></Link>)}
        <div className="hub"><Link href="/moon-sign-calculator">Don&apos;t know yours? Find it</Link></div>
      </nav>
    </div></section>
  );
}

export function Article({ children }: { children: ReactNode }) {
  return <div className="prose">{children}</div>;
}

export const Icon = {
  stars: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3l2.4 5.6L20 9.3l-4.3 3.9 1.2 5.8L12 16l-4.9 3 1.2-5.8L4 9.3l5.6-.7z" /></svg>,
  shield: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>,
  sun: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" /></svg>,
  heart: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" /></svg>,
  chat: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 5h16v11H8l-4 4z" /></svg>,
  users: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.5c2.6.1 4.6 1.7 5.5 4.5" /></svg>,
};
