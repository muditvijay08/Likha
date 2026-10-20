"use client";
// K2 Cupid payouts: PAN and UPI once (checked by the team), then withdraw approved earnings from ₹500. TDS shown up front.
import { useEffect, useState } from "react";
import { BackButton, ErrorNote, useAction } from "@/components/ui";
import { rupees } from "@/components/app";
import { api, type CupidState } from "@/lib/api";

const KYC: Record<string, string> = { submitted: "We're checking your details. Usually 2 working days.", verified: "Details checked. Payouts go to your UPI.", rejected: "We couldn't check these details. Please fix and send again." };
const PSTATUS: Record<string, string> = { requested: "Being reviewed", approved: "Approved", processing: "Sending", paid: "Paid", failed: "Failed, we'll retry", cancelled: "Cancelled" };

export default function Payout() {
  const [c, setC] = useState<CupidState | null>(null);
  const [name, setName] = useState(""); const [pan, setPan] = useState(""); const [upi, setUpi] = useState(""); const [resident, setResident] = useState(false);
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction();
  useEffect(() => { api().cupid().then(setC).catch(() => {}); }, []);
  if (!c) return <div className="app-body pad"><div className="skel" style={{ height: 300 }} /></div>;
  if (!c.is_cupid) return <div className="app-body pad"><BackButton href="/cupid" /><div className="empty card"><strong>Join Be a Cupid first</strong></div></div>;
  const m = c.money!; const min = c.rates!.min_payout_paise;
  const needKyc = !c.kyc || c.kyc === "rejected";
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/cupid" /><h1>Payouts</h1></div>
      <div className="listcard">
        <div><span>Ready to withdraw</span><strong>{rupees(m.withdrawable_paise)}</strong></div>
        <div><span>On hold (30 days)</span><span>{rupees(m.on_hold_paise)}</span></div>
        <div><span>Paid out</span><span>{rupees(m.paid_paise)}</span></div>
        <div><span>TDS this financial year</span><span>{rupees(m.tds_this_fy_paise)}</span></div>
      </div>
      <span className="small">2% TDS is deducted once your total this financial year passes ₹20,000. You can claim it in your tax return; we issue Form 16A.</span>
      {needKyc ? (
        <section className="card stack" style={{ gap: 10, borderRadius: 20 }} aria-label="Payout details">
          <strong>Payout details</strong>
          {c.kyc === "rejected" && <span className="sub">{KYC.rejected}</span>}
          <div className="field"><label className="label" htmlFor="k-name">Full name as on PAN</label><input id="k-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>
          <div className="field"><label className="label" htmlFor="k-pan">PAN</label><input id="k-pan" className="input" maxLength={10} value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" autoComplete="off" /></div>
          <div className="field"><label className="label" htmlFor="k-upi">UPI ID</label><input id="k-upi" className="input" value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@okbank" autoComplete="off" /></div>
          <label className="row" style={{ gap: 10, fontSize: 13 }}><input type="checkbox" checked={resident} onChange={(e) => setResident(e.target.checked)} />I live in India</label>
          <ErrorNote error={error} />
          <button type="button" className="btn" disabled={busy || !name.trim() || pan.length < 10 || !upi.includes("@")}
            onClick={() => run(async () => { await api().submitCupidKyc(name, pan, upi, resident); setSent(true); setC(await api().cupid()); })}>Send for checking</button>
          <span className="small">Your PAN is stored encrypted and used only for TDS. Cash payouts are for people living in India.</span>
        </section>
      ) : <div className="note"><span>{sent ? KYC.submitted : KYC[c.kyc!] ?? c.kyc}</span></div>}
      {!needKyc && <>
        <ErrorNote error={error} />
        <button type="button" className="btn" disabled={busy || c.kyc !== "verified" || m.withdrawable_paise < min}
          onClick={() => run(async () => { await api().requestPayout(); setC(await api().cupid()); })}>
          {m.withdrawable_paise < min ? `Withdraw from ${rupees(min)}` : `Withdraw ${rupees(m.withdrawable_paise)}`}</button>
      </>}
      {(c.payouts ?? []).length > 0 && <section className="stack" style={{ gap: 8 }} aria-label="Payouts">
        <strong style={{ fontSize: 14 }}>History</strong>
        <div className="listcard">{c.payouts!.map((p) => <div key={p.id}><span>{rupees(p.net)} <span className="small">({rupees(p.tds)} TDS)</span></span>
          <span className="small">{PSTATUS[p.status] ?? p.status} · {new Date(p.paid_at ?? p.requested_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></div>)}</div></section>}
    </div>
  );
}
