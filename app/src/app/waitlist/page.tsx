"use client";
// O12 Waitlist: member's city is not live yet
import { useEffect, useState } from "react";
import { BackButton, Screen } from "@/components/ui";
import { api, type CityQueue } from "@/lib/api";
import { useGuard } from "@/lib/guard";

export default function Waitlist() {
  useGuard();
  const [q, setQ] = useState<CityQueue | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { api().cityQueue().then(setQ).catch(() => {}); }, []);

  const link = q?.invite_code ? `https://likha.in/i/${q.invite_code}` : "";
  const share = `Join me on Likha, the kundli dating app. ${q?.city ?? "Our city"} opens at ${q?.threshold ?? 1000} members: ${link}`;
  const pct = q ? Math.min(100, Math.round((q.members / q.threshold) * 100)) : 0;

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  }

  return (
    <Screen style={{ gap: 18 }}>
      <BackButton href="/preferences" />
      <div className="wordmark">Likha<span>.</span></div>
      <div className="stack">
        <h1 className="h1 big">{q?.city ?? "Your city"}, your stars are aligning</h1>
        <p className="sub">We open a city once {q?.threshold.toLocaleString("en-IN") ?? "1,000"} Founding Members join, so your feed is full from day one.</p>
      </div>

      <section aria-label="Your place in line" style={{ borderRadius: 20, padding: 18, display: "flex", flexDirection: "column", gap: 12, background: "var(--ink)", color: "#fff" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
          <span className="stack" style={{ gap: 2 }}><span className="small" style={{ color: "#C9BDEB" }}>Your place in {q?.city ?? "line"}</span>
            <strong style={{ fontFamily: "var(--serif)", fontSize: 34 }}>#{q?.position ?? "…"}</strong></span>
          <span style={{ padding: "4px 10px", borderRadius: 999, background: "var(--saffron)", color: "var(--ink)", fontSize: 12, fontWeight: 700 }}>Founding Member</span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: "#3D3560" }}><div style={{ width: `${pct}%`, height: 8, borderRadius: 999, background: "var(--saffron)" }} /></div>
        <div className="row small" style={{ justifyContent: "space-between", color: "#C9BDEB" }}><span>{q?.members.toLocaleString("en-IN") ?? "…"} joined</span>
          <span>{q?.threshold.toLocaleString("en-IN") ?? "1,000"} unlocks {q?.city ?? "the city"}</span></div>
      </section>

      {link && (
        <section aria-label="Invite friends" className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <strong>Invite friends, open {q?.city} sooner</strong>
          <span className="small">Every friend who joins brings the unlock closer, and you both get 20 credits when they verify.</span>
          <div className="row">
            <span style={{ flex: 1, minWidth: 0, height: 44, borderRadius: 12, background: "#F7F5FC", display: "flex", alignItems: "center", padding: "0 12px",
              fontSize: 13, fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{link.replace("https://", "")}</span>
            <button type="button" className="chip" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          </div>
        </section>
      )}

      <div className="small" style={{ textAlign: "center" }}>Live now: <strong>{q?.live_cities.join(", ") || "Jaipur"}</strong> · Next: {q?.next_cities.join(", ") || "soon"}</div>
      <div className="grow" />
      <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
      <div className="small" style={{ textAlign: "center" }}>We&apos;ll tell you the moment {q?.city ?? "your city"} unlocks.</div>
    </Screen>
  );
}
