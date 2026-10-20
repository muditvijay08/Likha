"use client";
// K1 Be a Cupid: share your own link; earn when the people you bring verify and when they first pay. Only for people you bring in yourself.
import Link from "next/link";
import { useEffect, useState } from "react";
import { BackButton, ErrorNote, useAction } from "@/components/ui";
import { rupees } from "@/components/app";
import { api, type CupidState } from "@/lib/api";

const TERMS = "I will only share my link with people I know or my own followers, say clearly it is my referral link, never promise anyone a match, and never create accounts myself. " +
  "Earnings are paid only for real people who verify, after a 30-day hold. Likha may hold or cancel earnings that look fake. You only earn for people you bring in yourself.";
const STATUS: Record<string, string> = { joined: "Joined", verified: "Verified", paid: "First payment", blocked: "Not counted" };

export default function Cupid() {
  const [c, setC] = useState<CupidState | null>(null);
  const [agree, setAgree] = useState(false);
  const [code, setCode] = useState(""); const [label, setLabel] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  useEffect(() => { api().cupid().then(setC).catch(() => {}); }, []);
  if (!c) return <div className="app-body pad"><div className="skel" style={{ height: 300 }} /></div>;
  if (!c.is_cupid) return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/menu" /><h1>Be a Cupid</h1></div>
      <div style={{ padding: 18, borderRadius: 22, background: "linear-gradient(135deg, #FFE7B8, #FFD3E0)" }} className="stack">
        <strong className="serif" style={{ fontSize: 22 }}>Bring your people to Likha. Earn real money.</strong>
        <span style={{ fontSize: 14 }}>{rupees(c.signup_paise ?? 2000)} when someone you bring passes the selfie check, and {rupees(c.first_paid_paise ?? 5000)} when they first pay.</span>
      </div>
      <ul className="sub" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 13 }}>
        <li>You get your own likha.in/c/ link to share.</li><li>Earnings are held 30 days, then you can withdraw to UPI from ₹500.</li>
        <li>PAN needed for payouts. 2% TDS applies once you pass ₹20,000 in a financial year.</li><li>You earn only for people you bring yourself. Nothing for people they bring.</li></ul>
      {!c.enabled ? <div className="note"><span>Be a Cupid isn&apos;t open right now.</span></div> : <>
        <label className="row" style={{ gap: 10, fontSize: 13, alignItems: "flex-start" }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} /><span>{TERMS}</span></label>
        <ErrorNote error={error} />
        <button type="button" className="btn" disabled={!agree || busy} onClick={() => run(async () => setC(await api().becomeCupid()))}>Become a Cupid</button>
      </>}
    </div>
  );
  const m = c.money!;
  const share = (url: string) => `https://wa.me/?text=${encodeURIComponent(`I'm on Likha, the kundli-first dating app. This is my Cupid referral link: ${url}`)}`;
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/menu" /><h1>Be a Cupid</h1></div>
      <Link href="/cupid/payout" className="stack" style={{ gap: 4, padding: 18, borderRadius: 22, background: "var(--ink)", color: "#fff", textDecoration: "none" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "#FFD98A" }}>READY TO WITHDRAW</span>
        <strong className="serif" style={{ fontSize: 30 }}>{rupees(m.withdrawable_paise)}</strong>
        <span style={{ fontSize: 12, color: "#C9BDEB" }}>{rupees(m.on_hold_paise)} on hold · {rupees(m.paid_paise)} paid out · Withdraw and payout details ›</span>
      </Link>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {[["Joined", c.people!.joined], ["Verified", c.people!.verified], ["Paid", c.people!.paid]].map(([l, n]) => (
          <div key={String(l)} className="stack" style={{ alignItems: "center", padding: "12px 6px", borderRadius: 16, background: "var(--rose-soft)" }}>
            <strong className="serif" style={{ fontSize: 22 }}>{n}</strong><span className="small">{l}</span></div>))}
      </div>
      <section className="stack" style={{ gap: 8 }} aria-label="Your links">
        <strong style={{ fontSize: 14 }}>Your links</strong>
        {c.links!.map((l) => (
          <div key={l.id} className="card stack" style={{ gap: 6, borderRadius: 18 }}>
            <span className="row" style={{ justifyContent: "space-between" }}><strong>{l.label}</strong><span className="small">{l.clicks} clicks · {l.joined} joined</span></span>
            <span className="small" style={{ wordBreak: "break-all" }}>{l.url}</span>
            <div className="grid2"><button type="button" className="btn ghost" onClick={() => { navigator.clipboard?.writeText(l.url); setCopied(l.id); }}>{copied === l.id ? "Copied" : "Copy"}</button>
              <a className="btn" href={share(l.url)} target="_blank" rel="noopener noreferrer">WhatsApp</a></div>
          </div>
        ))}
        <details className="card" style={{ borderRadius: 18 }}><summary style={{ fontWeight: 600, cursor: "pointer" }}>Add a link for a channel</summary>
          <div className="stack" style={{ gap: 8, marginTop: 10 }}>
            <div className="field"><label className="label" htmlFor="c-label">Name it</label><input id="c-label" className="input" maxLength={30} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Instagram bio" /></div>
            <div className="field"><label className="label" htmlFor="c-code">likha.in/c/</label><input id="c-code" className="input" maxLength={24} value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} placeholder="riya-insta" autoComplete="off" /></div>
            <ErrorNote error={error} />
            <button type="button" className="btn" disabled={busy || code.trim().length < 3} onClick={() => run(async () => { await api().createCupidLink(code, label, "/"); setCode(""); setLabel(""); setC(await api().cupid()); })}>Create link</button>
          </div></details>
      </section>
      {(c.recent ?? []).length > 0 && <section className="stack" style={{ gap: 8 }} aria-label="Recent">
        <strong style={{ fontSize: 14 }}>Recent</strong>
        <div className="listcard">{c.recent!.map((r, i) => <div key={i}><span>{r.initial}.</span><span className="small">{STATUS[r.status] ?? r.status}</span></div>)}</div></section>}
      <details className="card" style={{ borderRadius: 18 }}><summary style={{ fontWeight: 600, cursor: "pointer" }}>Cupid rules you agreed to</summary>
        <p className="sub" style={{ margin: "8px 0 0", fontSize: 13 }}>{TERMS}</p></details>
      <span className="small" style={{ textAlign: "center" }}>Say clearly it&apos;s your referral link. Never promise anyone a match.</span>
    </div>
  );
}
