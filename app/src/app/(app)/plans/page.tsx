"use client";
// L4 Plans and history: prepaid plans, every credit in and out with the running balance, and GST invoices.
import Link from "next/link";
import { useEffect, useState } from "react";
import { BackButton } from "@/components/ui";
import { rupees } from "@/components/app";
import { api, type History } from "@/lib/api";

const sec = { fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "var(--muted)" } as const;
const d = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function Plans() {
  const [h, setH] = useState<History | null>(null);
  useEffect(() => { api().history().then(setH).catch(() => {}); }, []);
  if (!h) return <div className="app-body pad"><div className="skel" style={{ height: 400 }} /></div>;
  const active = h.plans.filter((p) => p.status === "active" && Date.parse(p.until) > Date.now());
  return (
    <div className="app-body pad" style={{ gap: 12 }}>
      <div className="titlebar"><BackButton href="/wallet" /><h1>Plans and history</h1></div>
      <span style={sec}>ACTIVE</span>
      {active.length === 0 ? <div className="rowlink"><span className="t"><strong>No active plans</strong><span>Kick Pass, Rishta Maasi, Couple Mode</span></span><Link href="/store" style={{ fontWeight: 700, fontSize: 14 }}>Explore</Link></div>
      : active.map((p) => (
        <div key={p.id} className="stack" style={{ gap: 6, padding: "14px 16px", borderRadius: 18, background: "#fff", border: "1.5px solid var(--saffron)" }}>
          <div className="row" style={{ justifyContent: "space-between" }}><strong>{p.label}</strong><strong>{rupees(p.price_paise)} / {p.interval}</strong></div>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Prepaid until {d(p.until)}. It doesn&apos;t renew by itself; we remind you 2 days before.</span>
          <Link href={`/checkout?type=subscription&key=${p.key}`} className="linkbtn" style={{ fontSize: 13 }}>Add another {p.interval}</Link>
        </div>
      ))}
      <span style={{ ...sec, marginTop: 6 }}>CREDIT HISTORY</span>
      <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 18, fontSize: 13 }}>
        <div style={{ display: "grid", gridTemplateColumns: "58px 1fr 52px 52px", gap: 8, padding: "10px 14px", ...sec, fontSize: 10 }}><span>DATE</span><span>ITEM</span><span style={{ textAlign: "right" }}>CR</span><span style={{ textAlign: "right" }}>BAL</span></div>
        {h.ledger.length === 0 ? <div style={{ padding: "10px 14px" }} className="small">No credit activity yet.</div> : h.ledger.map((l, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "58px 1fr 52px 52px", gap: 8, padding: "10px 14px", borderTop: "1px solid var(--line-soft)" }}>
            <span style={{ color: "var(--muted)" }}>{d(l.at)}</span><span>{l.reason}</span>
            <span style={{ textAlign: "right", fontWeight: 700, color: l.delta > 0 ? "#1F5E49" : "var(--ink)" }}>{l.delta > 0 ? "+" : "−"}{Math.abs(l.delta)}</span>
            <span style={{ textAlign: "right", color: "var(--muted)" }}>{l.balance}</span></div>
        ))}
      </div>
      <span id="invoices" style={{ ...sec, marginTop: 6 }}>GST INVOICES</span>
      {h.invoices.length === 0 ? <span className="small">Invoices appear here after a payment.</span> :
        <div className="listcard">{h.invoices.map((iv) => <Link key={iv.id} href={`/invoice/${iv.id}`}><span className="stack" style={{ gap: 1 }}><span>{iv.item}</span><span className="small">{iv.invoice_no} · {d(iv.at)}</span></span><strong>{rupees(iv.amount_paise)}</strong></Link>)}</div>}
      <Link href="/help?topic=payments" className="small" style={{ textAlign: "center", paddingTop: 8 }}>Payment problem?</Link>
    </div>
  );
}
