"use client";
// M2 Matches: new matches on top, conversations below, Saathi as the first row. E14 when there are no matches yet.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, price, useApp } from "@/components/app";
import { api, type MatchRow, type SaathiState } from "@/lib/api";

const when = (iso: string) => {
  const d = new Date(iso), now = new Date(), days = Math.floor((now.getTime() - d.getTime()) / 864e5);
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  if (days < 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-IN", { weekday: "short" });
  return `${days} days`;
};

export default function Matches() {
  const { home, prices } = useApp();
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [saathi, setSaathi] = useState<SaathiState | null>(null);
  useEffect(() => {
    api().matches().then(setRows).catch(() => setRows([]));
    api().saathi().then(setSaathi).catch(() => {});
  }, []);
  const fresh = (rows ?? []).filter((m) => !m.last_at);
  const talks = (rows ?? []).filter((m) => m.last_at);
  const name = saathi?.character === "dhruv" ? "Dhruv" : "Chandni";

  const SaathiRow = saathi?.available ? (
    <Link href="/saathi" className="row" style={{ gap: 12, padding: "12px 0", borderBottom: "1px solid #ECE6FA", color: "var(--ink)", textDecoration: "none" }}>
      <span style={{ width: 52, height: 52, flex: "none", borderRadius: 999, background: "linear-gradient(135deg, #C9B8FF, #FFC6D4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3D3560" strokeWidth="2" aria-hidden="true"><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" /></svg></span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span className="row" style={{ gap: 6 }}><strong style={{ fontSize: 15 }}>{saathi.setup ? name : "Saathi"}</strong>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6, background: "var(--violet-soft)", color: "#3D3560" }}>Virtual</span></span>
        <span style={{ fontSize: 14, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {saathi.paused ? `Stepping back while you talk to ${saathi.pause_match?.first_name}` : saathi.setup ? (saathi.history.at(-1)?.body ?? "Say hi") : "Someone to talk to till you match"}</span>
      </span>
    </Link>
  ) : null;

  return (
    <div className="app-body pad" style={{ gap: 16 }}>
      <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 28, fontWeight: 600 }}>Matches</h1>
      {rows === null ? <div className="skel" style={{ height: 240 }} /> : rows.length === 0 ? <>
        <div className="stack" style={{ gap: 8 }}>
          <h2 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 22, fontWeight: 600, lineHeight: 1.25 }}>No matches yet. Your stars are warming up.</h2>
          <p className="sub">New people join {home?.city?.name ?? "your city"} every day. Here&apos;s how to get noticed sooner:</p>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          {(home?.pct ?? 100) < 100 && <Link href="/bonus" className="rowlink"><span className="t"><strong>Finish your profile <span style={{ fontWeight: 500, color: "var(--muted)" }}>· {home?.pct}% done</span></strong></span><span style={{ fontSize: 12, fontWeight: 700, color: "#1F5E49" }}>Earn credits</span></Link>}
          <Link href="/discover" className="rowlink"><span className="t"><strong>Send a Cosmic Like with a note</strong></span><span style={{ fontSize: 12, fontWeight: 700, color: "var(--link)" }}>{price(prices, "cosmic_like", 9) === 0 ? "Free this week" : `${price(prices, "cosmic_like", 9)} cr`}</span></Link>
          <Link href="/likes" className="rowlink"><span className="t"><strong>See who already likes you</strong></span><span style={{ fontSize: 12, fontWeight: 700, color: "#1F5E49" }}>Free</span></Link>
        </div>
        {SaathiRow}
        <Link href="/discover" className="btn">Back to Discover</Link>
      </> : <>
        {fresh.length > 0 && (
          <div className="stack" style={{ gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>New matches</span>
            <div className="row" style={{ gap: 14, overflowX: "auto", scrollbarWidth: "none" }}>
              {fresh.map((m) => (
                <Link key={m.match_id} href={`/chat/${m.match_id}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "var(--ink)", textDecoration: "none", fontSize: 12, fontWeight: 600, flex: "none" }}>
                  <Avatar name={m.first_name} photo={m.photo} size={60} ring="#FFB020" />{m.first_name}</Link>
              ))}
            </div>
          </div>
        )}
        <div className="stack" style={{ gap: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", paddingBottom: 6 }}>Conversations</span>
          {SaathiRow}
          {talks.map((m, i) => {
            const old = Date.now() - new Date(m.last_at!).getTime() > 4 * 864e5;
            return (
              <Link key={m.match_id} href={`/chat/${m.match_id}`} className="row" style={{ gap: 12, padding: "12px 0", borderBottom: i < talks.length - 1 ? "1px solid #ECE6FA" : 0, color: "var(--ink)", textDecoration: "none" }}>
                <Avatar name={m.first_name} photo={m.photo} size={52} />
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="row" style={{ justifyContent: "space-between" }}><strong style={{ fontSize: 15 }}>{m.first_name}</strong><span style={{ fontSize: 12, color: "var(--muted)" }}>{when(m.last_at!)}</span></span>
                  {old && m.last_from_me ? <span style={{ fontSize: 13, color: "var(--link)", fontWeight: 600 }}>Say hi again before the stars move on</span> :
                    <span style={{ fontSize: 14, fontWeight: m.unread ? 700 : 500, color: m.unread ? "var(--ink)" : "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {m.last_from_me ? "You: " : ""}{m.last_kind === "voice" ? "Voice note" : m.last_body}</span>}
                </span>
                {m.unread > 0 && <span aria-label={`${m.unread} unread`} style={{ width: 10, height: 10, flex: "none", borderRadius: 999, background: "var(--rose)" }} />}
              </Link>
            );
          })}
          {talks.length === 0 && <span className="sub" style={{ paddingTop: 10 }}>No conversations yet. Tap a new match to say hi.</span>}
        </div>
      </>}
    </div>
  );
}
