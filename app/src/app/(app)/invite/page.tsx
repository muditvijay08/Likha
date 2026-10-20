"use client";
// E13 Invite friends: they join with your link or code; you both get credits once they verify their selfie.
import { useEffect, useState } from "react";
import { BackButton } from "@/components/ui";
import { ago } from "@/components/app";
import { api, type Invites } from "@/lib/api";

const STATUS: Record<string, string> = { joined: "Joined, verifying", rewarded: "Verified · credits added", blocked: "Not counted", pending: "Invited" };

export default function Invite() {
  const [v, setV] = useState<Invites | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { api().invites().then(setV).catch(() => {}); }, []);
  if (!v) return <div className="app-body pad"><div className="skel" style={{ height: 300 }} /></div>;
  const link = `https://likha.in/i/${v.code ?? ""}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(`I'm on Likha, the kundli-first dating app. Join with my link and we both get ${v.friend_reward} credits: ${link}`)}`;
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/menu" /><h1>Invite friends</h1></div>
      <div style={{ padding: 18, borderRadius: 22, background: "linear-gradient(135deg, #EDE6FF, #E4F4EE)" }} className="stack">
        <strong className="serif" style={{ fontSize: 22 }}>{v.reward} credits for you, {v.friend_reward} for them</strong>
        <span style={{ fontSize: 13, color: "#3D3560" }}>When a friend joins with your link and passes the selfie check. Up to {v.max_per_month} friends a month.</span>
      </div>
      <div className="card stack" style={{ gap: 6, borderRadius: 18 }}>
        <span className="label">Your code</span>
        <strong style={{ fontSize: 22, letterSpacing: ".04em" }}>{v.code ?? "…"}</strong>
        <span className="small" style={{ wordBreak: "break-all" }}>{link}</span>
      </div>
      <a className="btn" href={wa} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
      <button type="button" className="btn ghost" onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</button>
      <section className="stack" style={{ gap: 8 }} aria-label="Friends who joined">
        <strong style={{ fontSize: 14 }}>Friends who joined{v.earned ? ` · ${v.earned} credits earned` : ""}</strong>
        {v.invites.length === 0 ? <span className="sub">No one yet. Share your link to start.</span> : (
          <div className="listcard">{v.invites.map((i, n) => <div key={n}><span>{i.first_name ?? "A friend"}</span><span className="small">{STATUS[i.status] ?? i.status} · {ago(i.at)}</span></div>)}</div>
        )}
      </section>
      <span className="small" style={{ textAlign: "center" }}>Please only invite people you know. Accounts made to collect credits are removed.</span>
    </div>
  );
}
