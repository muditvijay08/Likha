"use client";
// K1 Be a Cupid: share your own link; earn when the people you bring verify and when they first pay. Only for people you bring in yourself.
// Rewards are credits by default (M, Nov 2026). Cash only after PAN and UPI are checked, paid after a 30-day hold.
import Link from "next/link";
import { useEffect, useState } from "react";
import { BackButton, ErrorNote, useAction } from "@/components/ui";
import { rupees } from "@/components/app";
import { api, type CupidState } from "@/lib/api";

const TERMS = "I will only share my link with people I know or my own followers, say clearly it is my referral link, never promise anyone a match, and never create accounts myself. " +
  "Rewards are given only for real people who verify. They come as credits unless I switch to cash, which needs my PAN and UPI checked and is paid after a 30-day hold. " +
  "Likha may hold or cancel rewards that look fake. I only earn for people I bring in myself.";
const cr = (paise: number) => Math.ceil(paise / 100);
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
      <div style={{ padding: 18, borderRadius: 12, background: "var(--ivory)" }} className="stack">
        <strong className="serif" style={{ fontSize: 22 }}>Bring your people to Likha. Earn credits.</strong>
        <span style={{ fontSize: 14 }}>{cr(c.signup_paise ?? 2000)} credits when someone you bring passes the selfie check, and {cr(c.first_paid_paise ?? 5000)} more when they first pay.</span>
      </div>
      <ul className="sub" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 13 }}>
        <li>You get your own likha.in/c/ link to share.</li><li>Selfie-check credits arrive right away. First-payment credits after a 30-day hold.</li>
        <li>Prefer cash? Switch once your PAN and UPI are checked: {rupees(c.signup_paise ?? 2000)} and {rupees(c.first_paid_paise ?? 5000)}, held 30 days, withdraw from ₹500. 2% TDS once you pass ₹20,000 in a financial year.</li>
        <li>You earn only for people you bring yourself. Nothing for people they bring.</li></ul>
      {!c.enabled ? <div className="note"><span>Be a Cupid isn&apos;t open right now.</span></div> : <>
        <label className="row" style={{ gap: 10, fontSize: 13, alignItems: "flex-start" }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} /><span>{TERMS}</span></label>
        <ErrorNote error={error} />
        <button type="button" className="btn" disabled={!agree || busy} onClick={() => run(async () => setC(await api().becomeCupid()))}>Become a Cupid</button>
      </>}
    </div>
  );
  const m = c.money!;
  const cash = c.reward_mode === "cash";
  const switchTo = (mode: "credits" | "cash") => run(async () => { await api().cupidRewardMode(mode); setC(await api().cupid()); });
  const share = (url: string) => `https://wa.me/?text=${encodeURIComponent(`I'm on Likha, the kundli-first dating app. This is my Cupid referral link: ${url}`)}`;
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/menu" /><h1>Be a Cupid</h1></div>
      {cash ? (
        <Link href="/cupid/payout" className="stack" style={{ gap: 4, padding: 18, borderRadius: 12, background: "var(--ink)", color: "#fff", textDecoration: "none" }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "#FFB48F" }}>READY TO WITHDRAW</span>
          <strong className="serif" style={{ fontSize: 30 }}>{rupees(m.withdrawable_paise)}</strong>
          <span style={{ fontSize: 12, color: "#D8D2CB" }}>{rupees(m.on_hold_paise)} on hold · {rupees(m.paid_paise)} paid out · Withdraw and payout details ›</span>
        </Link>
      ) : (
        <Link href="/wallet" className="stack" style={{ gap: 4, padding: 18, borderRadius: 12, background: "var(--ink)", color: "#fff", textDecoration: "none" }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "#FFB48F" }}>CREDITS EARNED</span>
          <strong className="serif" style={{ fontSize: 30 }}>{c.credits_earned ?? 0}</strong>
          <span style={{ fontSize: 12, color: "#D8D2CB" }}>Added to your wallet · First-payment rewards after a 30-day hold ›</span>
        </Link>
      )}
      <div className="card stack" style={{ gap: 8, borderRadius: 12 }} aria-label="How you get rewards">
        <span className="row" style={{ justifyContent: "space-between", gap: 8 }}><strong style={{ fontSize: 14 }}>Rewards as {cash ? "cash" : "credits"}</strong>
          {cash ? <button type="button" className="btn sm outline" disabled={busy} onClick={() => switchTo("credits")}>Switch to credits</button>
            : c.kyc === "verified" ? <button type="button" className="btn sm outline" disabled={busy} onClick={() => switchTo("cash")}>Switch to cash</button>
            : <Link href="/cupid/payout" className="btn sm outline">Add PAN for cash</Link>}</span>
        <span className="small">{cash ? "Cash is held 30 days, then you withdraw to UPI from ₹500. Switching applies to new rewards."
          : c.kyc === "verified" ? "Your PAN and UPI are checked. Cash is held 30 days, then paid to UPI. Switching applies to new rewards."
          : "Cash rewards need your PAN and UPI checked first (within 2 working days)."}</span>
        <ErrorNote error={error} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {[["Joined", c.people!.joined], ["Verified", c.people!.verified], ["Paid", c.people!.paid]].map(([l, n]) => (
          <div key={String(l)} className="stack" style={{ alignItems: "center", padding: "12px 6px", borderRadius: 16, background: "var(--rose-soft)" }}>
            <strong className="serif" style={{ fontSize: 22 }}>{n}</strong><span className="small">{l}</span></div>))}
      </div>
      <section className="stack" style={{ gap: 8 }} aria-label="Your links">
        <strong style={{ fontSize: 14 }}>Your links</strong>
        {c.links!.map((l) => (
          <div key={l.id} className="card stack" style={{ gap: 6, borderRadius: 12 }}>
            <span className="row" style={{ justifyContent: "space-between" }}><strong>{l.label}</strong><span className="small">{l.clicks} clicks · {l.joined} joined</span></span>
            <span className="small" style={{ wordBreak: "break-all" }}>{l.url}</span>
            <div className="grid2"><button type="button" className="btn ghost" onClick={() => { navigator.clipboard?.writeText(l.url); setCopied(l.id); }}>{copied === l.id ? "Copied" : "Copy"}</button>
              <a className="btn" href={share(l.url)} target="_blank" rel="noopener noreferrer">WhatsApp</a></div>
          </div>
        ))}
        <details className="card" style={{ borderRadius: 12 }}><summary style={{ fontWeight: 600, cursor: "pointer" }}>Add a link for a channel</summary>
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
      <details className="card" style={{ borderRadius: 12 }}><summary style={{ fontWeight: 600, cursor: "pointer" }}>Cupid rules you agreed to</summary>
        <p className="sub" style={{ margin: "8px 0 0", fontSize: 13 }}>{TERMS}</p></details>
      <span className="small" style={{ textAlign: "center" }}>Say clearly it&apos;s your referral link. Never promise anyone a match.</span>
    </div>
  );
}
