"use client";
// W4 Tiers: real activity earns lower prices. Updated on the 1st of each month from the last 30 days.
import { useEffect, useState } from "react";
import { BackButton } from "@/components/ui";
import { Progress } from "@/components/app";
import { api, type TierInfo } from "@/lib/api";

const PERKS: Record<string, string> = {
  tara: "Verified, complete profile, active weekly.",
  graha: "Real conversations and a Kick streak. Boosted in Discover.",
  surya: "Top of the feed and a free Kick Pass day each month.",
};

export default function Tiers() {
  const [t, setT] = useState<TierInfo | null>(null);
  useEffect(() => { api().wallet().then((w) => setT(w.tier)).catch(() => {}); }, []);
  if (!t) return <div className="app-body pad"><div className="skel" style={{ height: 500 }} /></div>;
  const order = ["none", "tara", "graha", "surya"];
  const mine = order.indexOf(t.tier);
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/wallet" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}><h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 24, fontWeight: 600 }}>Your tier</h1>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Real activity earns lower prices</span></div></div>
      {t.tiers.map((x) => {
        const i = order.indexOf(x.key), here = i === mine, done = i < mine;
        return (
          <article key={x.key} style={{ padding: 16, borderRadius: 20, display: "flex", flexDirection: "column", gap: 8,
            background: here ? "#F4EFFF" : "#fff", border: here ? "1.5px solid #9C88E6" : "1px solid var(--line)", opacity: done ? 0.75 : 1 }}>
            <div className="row" style={{ justifyContent: "space-between" }}><strong className="serif" style={{ fontSize: 20 }}>{x.label}</strong>
              <span style={{ fontSize: 13, fontWeight: 700, color: here ? "#5B44C9" : "var(--muted)" }}>{here ? `You're here · ${x.discount}% off` : `${x.discount}% off`}</span></div>
            <span style={{ fontSize: 13, color: "#3D3560" }}>{x.min_conversations > 0 ? `${x.min_conversations}+ real conversations and a ${x.min_streak_days}-day Kick streak. ` : ""}{PERKS[x.key]}</span>
            {done && <span style={{ fontSize: 12, fontWeight: 700, color: "#1F5E49" }}>Unlocked</span>}
            {i > mine && x.min_conversations > 0 && <>
              <Progress label="Real conversations" value={t.conversations} max={x.min_conversations} />
              <Progress label="Daily Kick streak" value={t.streak} max={x.min_streak_days} />
            </>}
            {i > mine && x.min_conversations === 0 && t.qualifies_for !== "none" && <span style={{ fontSize: 12, fontWeight: 700, color: "#1F5E49" }}>You qualify. It switches on the 1st.</span>}
          </article>
        );
      })}
      <section className="stack" style={{ padding: "14px 16px", borderRadius: 18, background: "#fff", border: "1px solid var(--line)", gap: 6, fontSize: 13, lineHeight: 1.45 }}>
        <strong style={{ fontSize: 14 }}>How it works</strong>
        <span>A real conversation is 5+ messages from each of you. Likes alone don&apos;t count.</span>
        <span>Tiers update on the 1st of each month, based on the last 30 days.</span>
        <span>An upheld report pauses your tier for 90 days.</span>
      </section>
    </div>
  );
}
