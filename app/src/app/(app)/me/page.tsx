"use client";
// P1 Me: your profile at a glance, what's left to complete, and your account links.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, Chevron, TIER_LABEL } from "@/components/app";
import { api, type MyProfile } from "@/lib/api";

export default function Me() {
  const [p, setP] = useState<MyProfile | null>(null);
  useEffect(() => { api().myProfile().then(setP).catch(() => {}); }, []);
  if (!p) return <div className="app-body"><div className="skel" style={{ height: 400 }} /></div>;
  return (
    <div className="app-body" style={{ gap: 16 }}>
      <div className="row" style={{ gap: 14 }}>
        <Avatar name={p.first_name} photo={p.photos[0]?.url} size={72} />
        <div className="stack" style={{ flex: 1, gap: 4 }}>
          <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 26, fontWeight: 600 }}>{p.first_name}{p.age ? `, ${p.age}` : ""}</h1>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {TIER_LABEL[p.tier] && <span className="tag tier">{TIER_LABEL[p.tier]}</span>}
            {p.selfie_status === "passed" ? (p.selfie_auto ? null : <span className="tag v">Verified</span>) : <Link href="/account-status" className="tag" style={{ textDecoration: "none", color: "var(--saffron-ink)" }}>Selfie being checked</Link>}
            {p.paused && <span className="tag">Paused</span>}
          </div>
        </div>
        <Link href="/me/edit" className="btn ghost" style={{ width: "auto", height: 40, padding: "0 16px", fontSize: 14 }}>Edit</Link>
      </div>
      {p.profile_complete_pct < 100 && (
        <Link href="/me/edit" className="stack" style={{ gap: 8, padding: "14px 16px", borderRadius: 18, background: "var(--saffron-soft)", color: "var(--ink)", textDecoration: "none" }}>
          <div className="row" style={{ justifyContent: "space-between" }}><strong>Profile {p.profile_complete_pct}% complete</strong>{p.bonus_waiting ? <span style={{ fontSize: 13, color: "var(--saffron-ink)", fontWeight: 700 }}>{p.bonus_waiting} credits waiting</span> : null}</div>
          <div style={{ height: 6, borderRadius: 999, background: "#fff" }}><div style={{ width: `${p.profile_complete_pct}%`, height: 6, borderRadius: 999, background: "var(--saffron)" }} /></div>
        </Link>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        {[["/wallet", p.balance.toLocaleString("en-IN"), "credits"], ["/kick", `${p.streak} ${p.streak === 1 ? "day" : "days"}`, "Kick streak"], ["/matches", String(p.matches), "matches"]].map(([h, v, l]) => (
          <Link key={l} href={h} className="stack" style={{ gap: 2, padding: "12px 10px", borderRadius: 16, background: "#fff", border: "1px solid var(--line)", textAlign: "center", color: "var(--ink)", textDecoration: "none" }}>
            <strong style={{ fontSize: 18 }}>{v}</strong><span style={{ fontSize: 12, color: "var(--muted)" }}>{l}</span></Link>
        ))}
      </div>
      <nav aria-label="Profile menu" className="listcard">
        {[["/me/preview", "Preview my profile"], ["/my-kundli", "My Kundli"], ["/tiers", "Tier and discounts"], ["/plans", "Plans and credit history"],
          ["/settings", "Settings"], ["/privacy", "Privacy and safety"], ["/help", "Help"]].map(([h, t]) => <Link key={h} href={h}>{t}<Chevron /></Link>)}
      </nav>
    </div>
  );
}
