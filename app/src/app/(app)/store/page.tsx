"use client";
// Astro Store: Check With Anyone first, then readings and plans. Credit prices shown after the member's tier discount.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Chevron, CreditsPill, price, rupees, useApp } from "@/components/app";
import { api, type Wallet } from "@/lib/api";

export default function Store() {
  const { prices } = useApp();
  const [w, setW] = useState<Wallet | null>(null);
  useEffect(() => { api().wallet().then(setW).catch(() => {}); }, []);
  const plan = (k: string) => w?.plans.find((p) => p.key === k);
  const rows: [string, string, string, string][] = [
    ["/why-not", "Why It Didn't Work", "Your past relationship, read by the stars", `${price(prices, "why_not", 79)} cr`],
    ["/gift", "Gift a Reading", "A birthday surprise they open in the app", `${price(prices, "gift", 99)} cr`],
    ["/my-kundli?tab=suits", "Who Suits Me", "The partner your chart is looking for", `${price(prices, "who_suits_me", 49)} cr`],
    ["/maasi", "Rishta Maasi", "Your Sunday picks, three people chosen for you", plan("rishta_maasi")?.active_until ? "Active" : `${rupees(plan("rishta_maasi")?.price_paise ?? 29900)}/mo`],
    ["/checkout?type=subscription&key=kick_pass", "Kick Pass", "Your full Daily Kick, every day", plan("kick_pass")?.active_until ? "Active" : `${rupees(plan("kick_pass")?.price_paise ?? 19900)}/mo`],
  ];
  return (
    <div className="app-body" style={{ gap: 16 }}>
      <header className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 30, fontWeight: 600 }}>Astro Store</h1>
        <CreditsPill label="credits" />
      </header>
      {w && w.tier.tier !== "none" && w.tier.discount > 0 && !w.tier.paused_until &&
        <div style={{ fontSize: 13, background: "#C9B8FF", borderRadius: 12, padding: "10px 14px", fontWeight: 600 }}>{w.tier.label} tier: {w.tier.discount}% off most credit prices below</div>}
      <Link href="/check" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 20, borderRadius: 24, background: "var(--rose-soft)", border: "1px solid #FFC6D4", color: "var(--ink)", textDecoration: "none" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#D6336C", letterSpacing: ".08em" }}>MOST LOVED</span>
        <span className="serif" style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.15 }}>Check With Anyone</span>
        <span style={{ fontSize: 14, color: "#8A3A55", lineHeight: 1.45 }}>Your crush, your ex, your boss, your co-founder. See how your stars get along.</span>
        <div className="row" style={{ justifyContent: "space-between", paddingTop: 4 }}>
          <span style={{ fontSize: 13, color: "#8A3A55" }}>5-pack for {price(prices, "check_anyone_5", 119)}</span>
          <span style={{ padding: "8px 14px", borderRadius: 999, background: "#FF7A9A", fontSize: 14, fontWeight: 700 }}>{price(prices, "check_anyone", 29)} credits</span>
        </div>
      </Link>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map(([href, t, s, p]) => (
          <li key={t}><Link href={href} className="rowlink" style={{ borderRadius: 18 }}>
            <span className="t"><strong style={{ fontSize: 15 }}>{t}</strong><span style={{ fontSize: 13 }}>{s}</span></span>
            <span style={{ fontSize: 13, fontWeight: 700, color: p === "Active" ? "#1F5E49" : "var(--link)", whiteSpace: "nowrap" }}>{p}</span>
          </Link></li>
        ))}
      </ul>
      <Link href="/readings" className="rowlink"><span className="t"><strong>My readings</strong><span>Everything you&apos;ve bought, in one place</span></span><Chevron /></Link>
      <span className="small" style={{ textAlign: "center" }}>Readings show tendencies, not fate. If one can&apos;t be written, your credits come back.</span>
    </div>
  );
}
