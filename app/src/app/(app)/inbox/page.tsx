"use client";
// L3 Activity: likes, matches, readings and account notes in one list. Likes never show who it was (see them free in Likes).
import Link from "next/link";
import { useEffect, useState } from "react";
import { BackButton } from "@/components/ui";
import { ago, useApp } from "@/components/app";
import { api, type Notice } from "@/lib/api";

const TABS = [["all", "All"], ["likes", "Likes"], ["readings", "Readings"], ["account", "Account"]] as const;
const DOT: Record<string, string> = { like: "var(--rose)", match: "var(--rose)", message: "var(--rose)", reading_ready: "#7E5BEF", crush_joined: "#7E5BEF", gift_opened: "#7E5BEF",
  payment: "var(--green)", tier: "var(--saffron)", checkin: "var(--red)" };

export default function Inbox() {
  const { reload } = useApp();
  const [list, setList] = useState<Notice[] | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("all");
  useEffect(() => { api().notices().then(setList).catch(() => setList([])); }, []);
  const readAll = async () => { await api().markAllRead(); setList((l) => l?.map((n) => ({ ...n, read: true })) ?? null); reload().catch(() => {}); };
  const shown = (list ?? []).filter((n) => tab === "all" || n.group === tab);
  const today = shown.filter((n) => new Date(n.created_at).toDateString() === new Date().toDateString());
  const earlier = shown.filter((n) => !today.includes(n));
  const Row = ({ n }: { n: Notice }) => {
    const inner = <>
      <span style={{ width: 36, height: 36, flex: "none", borderRadius: 12, background: "#F3EEFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
        {n.type === "tier" && n.data.discount ? `${n.data.discount}%` : <span style={{ width: 10, height: 10, borderRadius: 999, background: DOT[n.type] ?? "var(--muted)" }} />}</span>
      <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}><strong style={{ fontSize: 14, fontWeight: n.read ? 600 : 800 }}>{n.title}</strong>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{n.body} · {ago(n.created_at) === "New" ? "just now" : `${ago(n.created_at)} ago`}</span></span>
      {!n.read && <span aria-label="Unread" style={{ width: 8, height: 8, borderRadius: 999, background: "var(--rose)", flex: "none" }} />}
    </>;
    return n.data.link ? <Link href={n.data.link} className="row" style={{ gap: 12, padding: "12px 16px", color: "var(--ink)", textDecoration: "none" }}>{inner}</Link>
      : <div className="row" style={{ gap: 12, padding: "12px 16px" }}>{inner}</div>;
  };
  const section = (label: string, xs: Notice[]) => xs.length > 0 && <>
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "var(--muted)" }}>{label}</span>
    <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 18 }}>{xs.map((n, i) => <div key={n.id} style={{ borderTop: i ? "1px solid var(--line-soft)" : 0 }}><Row n={n} /></div>)}</div>
  </>;
  return (
    <div className="app-body pad" style={{ gap: 12 }}>
      <div className="titlebar"><BackButton href="/menu" /><h1>Activity</h1><button type="button" className="linkbtn" onClick={readAll}>Mark all read</button></div>
      <div role="tablist" className="row" style={{ gap: 6, overflowX: "auto" }}>
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className="chip sm" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {list === null ? <div className="skel" style={{ height: 300 }} /> : shown.length === 0 ? <div className="empty card"><strong>Nothing here yet</strong><span className="sub">Likes, matches and readings show up here.</span></div> : <>
        {section("TODAY", today)}{section("EARLIER", earlier)}
      </>}
    </div>
  );
}
