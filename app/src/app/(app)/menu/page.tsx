"use client";
// N1 Menu: profile, wallet, tier, every feature, and the account links.
import Link from "next/link";
import { Avatar, Chevron, TIER_LABEL, featureOn, useApp } from "@/components/app";
import { InstallCard } from "@/components/install";
import { api } from "@/lib/api";

const GROUPS: [string, [string, string, string][]][] = [
  ["Your stars", [["/my-kundli", "My Kundli", "Chart, dasha and who suits you"], ["/matches", "Golden Hours", "Best times to talk"], ["/kick", "Daily Kick", "Your day, decoded"], ["/store", "Astro Store", "Readings"]]],
  ["Meet people", [["/me/values", "Life and values", "Sharpen your real-life match reasons"], ["/maasi", "Rishta Maasi", "3 hand-picked people every Sunday"], ["/travel", "Travel Mode", "Match in a city before you land"], ["/boost", "Boost", "Be seen first for an hour"], ["/saathi", "Saathi", "A virtual companion to talk to"]]],
  ["Together", [["/universe", "Our Universe", "Readings for the two of you"], ["/story", "Our Story", "Your timeline"], ["/couple", "Couple Mode", "For matched pairs"], ["/gift", "Gift a Reading", "For someone special"]]],
];
const LINKS: [string, string, string?][] = [
  ["/family", "Family view", "New"], ["/toolkit", "Your cosmic toolkit"], ["/inbox", "Inbox"], ["/plans", "My plans"], ["/cupid", "Be a Cupid", "Earn ₹"], ["/invite", "Invite and earn credits"],
  ["/settings", "Settings"], ["/privacy", "Privacy and safety"], ["/why", "Why Likha"], ["/help", "Help"],
];

export default function Menu() {
  const { home, features } = useApp();
  const signOut = async () => { await api().signOut(); location.href = "/login"; };
  return (
    <div className="app-body" style={{ gap: 14 }}>
      <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 28, fontWeight: 600 }}>Menu</h1>
      <Link href="/me" className="rowlink" style={{ gap: 14, padding: 14 }}>
        <Avatar name={home?.first_name ?? "?"} size={54} />
        <span className="t" style={{ gap: 4 }}><strong style={{ fontSize: 16 }}>{home?.first_name ?? "…"}</strong>
          <span className="row" style={{ gap: 8, fontSize: 12 }}>
            <span style={{ flex: 1, height: 6, borderRadius: 999, background: "#EBE6DF" }}><span style={{ display: "block", width: `${home?.pct ?? 0}%`, height: 6, borderRadius: 999, background: "var(--saffron)" }} /></span>
            Profile {home?.pct ?? 0}%</span></span>
      </Link>
      <div className="grid2" style={{ gap: 10 }}>
        <Link href="/wallet" style={{ display: "flex", flexDirection: "column", gap: 2, padding: "12px 14px", borderRadius: 12, background: "var(--ink)", color: "#fff", textDecoration: "none" }}>
          <span style={{ fontSize: 11, color: "#D8D2CB", fontWeight: 700 }}>WALLET</span><strong style={{ fontSize: 20 }}>{home?.balance ?? "…"} credits</strong></Link>
        <Link href="/tiers" style={{ display: "flex", flexDirection: "column", gap: 2, padding: "12px 14px", borderRadius: 12, background: "#fff", border: "1px solid var(--line)", color: "var(--ink)", textDecoration: "none" }}>
          <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>YOUR TIER</span><strong style={{ fontSize: 17 }}>{home && TIER_LABEL[home.tier] ? TIER_LABEL[home.tier] : "No tier yet"}</strong></Link>
      </div>
      {GROUPS.map(([title, items]) => {
        const shown = items.filter(([href]) => featureOn(features, href));
        if (!shown.length) return null;
        return (
          <section key={title} aria-label={title} className="stack" style={{ gap: 8 }}>
            <h2 style={{ margin: "6px 2px 0", font: "700 12px var(--sans)", letterSpacing: ".1em", color: "var(--muted)" }}>{title.toUpperCase()}</h2>
            <div className="listcard">
              {shown.map(([href, t, sub]) => (
                <Link key={href} href={href} style={{ alignItems: "center" }}>
                  <span className="stack" style={{ gap: 1, flex: 1, minWidth: 0 }}><strong style={{ fontSize: 15 }}>{t}</strong><span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>{sub}</span></span>
                  <Chevron />
                </Link>
              ))}
            </div>
          </section>
        );
      })}
      <InstallCard />
      <div className="listcard">
        {LINKS.map(([href, t, badge]) => (
          <Link key={t} href={href}>{t}<span className="row" style={{ marginLeft: "auto", gap: 8 }}>
            {badge && <span style={{ padding: "2px 8px", borderRadius: 999, background: "var(--green-soft)", color: "#1F5E49", fontSize: 12, fontWeight: 700 }}>{badge}</span>}<Chevron /></span></Link>
        ))}
        <button type="button" onClick={signOut} style={{ background: "none", border: 0, font: "600 14px var(--sans)", color: "var(--muted)", textAlign: "left" }}>Sign out</button>
      </div>
      <Link href="/legal/terms" className="small" style={{ textAlign: "center" }}>Terms · Privacy · Refunds</Link>
    </div>
  );
}
