"use client";
// N1 Menu: profile, wallet, tier, every feature, and the account links.
import Link from "next/link";
import { Avatar, Chevron, TIER_LABEL, useApp } from "@/components/app";
import { api } from "@/lib/api";

const TILES: [string, string, string, string][] = [
  ["/kick", "Daily Kick", "Your day, decoded", "#FFF3D6"], ["/my-kundli", "My Kundli", "Chart and dasha", "#EDE6FF"], ["/store", "Astro Store", "Readings and more", "#FFF0F4"],
  ["/saathi", "Saathi", "Chat till you match", "#E4F4EE"], ["/universe", "Our Universe", "For you two", "#FFF0F4"], ["/maasi", "Rishta Maasi", "Sunday picks", "#FFF3D6"],
  ["/gift", "Gift a Reading", "For someone special", "#EDE6FF"], ["/travel", "Travel Mode", "Match in a new city", "#E4F4EE"], ["/boost", "Boost", "Be seen first", "#FFF3D6"],
  ["/story", "Our Story", "Your timeline", "#FFF0F4"], ["/couple", "Couple Mode", "For matched pairs", "#EDE6FF"], ["/matches", "Golden Hours", "Best times to talk", "#FFF3D6"],
];
const LINKS: [string, string, string?][] = [
  ["/toolkit", "Your cosmic toolkit"], ["/inbox", "Inbox"], ["/plans", "My plans"], ["/cupid", "Be a Cupid", "Earn ₹"], ["/invite", "Invite and earn credits"],
  ["/settings", "Settings"], ["/privacy", "Privacy and safety"], ["/why", "Why Likha"], ["/help", "Help"],
];

export default function Menu() {
  const { home } = useApp();
  const signOut = async () => { await api().signOut(); location.href = "/start"; };
  return (
    <div className="app-body" style={{ gap: 14 }}>
      <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 28, fontWeight: 600 }}>Menu</h1>
      <Link href="/me" className="rowlink" style={{ gap: 14, padding: 14 }}>
        <Avatar name={home?.first_name ?? "?"} size={54} />
        <span className="t" style={{ gap: 4 }}><strong style={{ fontSize: 16 }}>{home?.first_name ?? "…"}</strong>
          <span className="row" style={{ gap: 8, fontSize: 12 }}>
            <span style={{ flex: 1, height: 6, borderRadius: 999, background: "#ECE6FA" }}><span style={{ display: "block", width: `${home?.pct ?? 0}%`, height: 6, borderRadius: 999, background: "var(--saffron)" }} /></span>
            Profile {home?.pct ?? 0}%</span></span>
      </Link>
      <div className="grid2" style={{ gap: 10 }}>
        <Link href="/wallet" style={{ display: "flex", flexDirection: "column", gap: 2, padding: "12px 14px", borderRadius: 18, background: "var(--ink)", color: "#fff", textDecoration: "none" }}>
          <span style={{ fontSize: 11, color: "#C9BDEB", fontWeight: 700 }}>WALLET</span><strong style={{ fontSize: 20 }}>{home?.balance ?? "…"} credits</strong></Link>
        <Link href="/tiers" style={{ display: "flex", flexDirection: "column", gap: 2, padding: "12px 14px", borderRadius: 18, background: "#fff", border: "1px solid var(--line)", color: "var(--ink)", textDecoration: "none" }}>
          <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>YOUR TIER</span><strong style={{ fontSize: 17 }}>{home && TIER_LABEL[home.tier] ? TIER_LABEL[home.tier] : "No tier yet"}</strong></Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        {TILES.map(([href, t, s, bg]) => (
          <Link key={t} href={href} style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 8, padding: 12, borderRadius: 18, background: bg, color: "var(--ink)", textDecoration: "none", minHeight: 92 }}>
            <span className="stack" style={{ gap: 1 }}><strong style={{ fontSize: 13 }}>{t}</strong><span style={{ fontSize: 11, color: "var(--muted)" }}>{s}</span></span>
          </Link>
        ))}
      </div>
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
