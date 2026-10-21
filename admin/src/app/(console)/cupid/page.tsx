"use client";
// I24 Be a Cupid: referral earnings, partners, KYC, payouts and TDS. Direct referrals only, never chains.
import Link from "next/link";
import { useState } from "react";
import { useAction, useAdmin } from "@/components/shell";
import { SettingsForm } from "@/components/settings-form";
import { Kpi, NoteAction, Page, Status, ago, day, download, label, rupees, useLoad } from "@/components/ui";
import { api } from "@/lib/api";

const fyNow = () => { const d = new Date(); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String((y + 1) % 100).padStart(2, "0")}`; };

export default function Cupid() {
  const { toast } = useAdmin();
  const { data, reload } = useLoad(() => api().cupidAdmin());
  const [tab, setTab] = useState<"queue" | "cupids" | "rules">("queue");
  const [p, setP] = useState({ id: "", signup: "", paid: "", why: "" });
  const act = useAction();
  if (!data) return <div className="skel" style={{ height: 400 }} />;
  const k = data.kpis; const enabled = data.config.enabled !== false;
  const tds = () => act.run(async () => {
    const rows = await api().cupidTds(fyNow());
    download(`likha-cupid-tds-${fyNow()}.csv`, ["Legal name,PAN,Quarter,Gross (₹),TDS (₹),Net (₹),Payouts", ...rows.map((r) => [`"${r.legal_name}"`, r.pan, r.quarter, r.gross_paise / 100, r.tds_paise / 100, r.net_paise / 100, r.payouts].join(","))].join("\n"), "text/csv");
    toast("TDS report downloaded (logged)");
  });
  return (
    <Page title="Be a Cupid" sub="Referral earnings, partners, payouts and TDS. People earn only for those they bring in directly."
      actions={<div className="row">{data.can_pay && <button type="button" className="btn ghost" disabled={act.busy} onClick={tds}>Export TDS report ({fyNow()})</button>}
        {data.can_rules && <NoteAction label={enabled ? "Pause programme" : "Restart programme"} tone={enabled ? "danger" : "ghost"} placeholder="Why?"
          onRun={(n) => api().saveSettings({ cupid: { ...data.config, enabled: !enabled } }, n)} done={() => { toast(enabled ? "Be a Cupid paused" : "Be a Cupid restarted"); reload(); }} />}</div>}>
      {!enabled && <div className="note warn">Paused: no one can join, and new referrals earn nothing until you restart. Money already earned is still paid.</div>}
      <div className="kpis"><Kpi k="Active Cupids" v={k.active} s={`${k.partners} partners`} /><Kpi k="Joined via Cupids · 30d" v={k.joined_30d.toLocaleString("en-IN")} />
        <Kpi k="Verified" v={k.verified_pct === null ? "–" : `${k.verified_pct}%`} s="of those who joined" /><Kpi k="New paying members" v={k.paying_30d} s="first payment, 30d" />
        <Kpi k="Owed to Cupids" v={rupees(k.owed_paise)} s="on hold + withdrawable" /><Kpi k="Waiting on you" v={k.waiting_payouts + k.waiting_kyc + k.waiting_review}
          s={`${k.waiting_payouts} payout · ${k.waiting_kyc} KYC · ${k.waiting_review} review`} alert={k.waiting_payouts + k.waiting_kyc + k.waiting_review > 0} /></div>
      <div className="tabs" role="tablist">{([["queue", "Waiting on you"], ["cupids", "Cupids and partners"], ["rules", "Rates and limits"]] as const).map(([t, l]) =>
        <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{l}</button>)}</div>
      {tab === "queue" && <>
        <section className="card flush" aria-label="Review queue"><div style={{ padding: "14px 16px 0" }}><h2>Review: fast sign-ups and big amounts</h2></div>
          {data.review.length === 0 ? <p className="sub" style={{ padding: 16 }}>Nothing to review.</p> : <table className="t"><tbody>{data.review.map((r) => <tr key={r.id}>
            <td><strong>{r.cupid}</strong><div className="small">{label(r.kind)} · {ago(r.at)} ago</div></td><td>{rupees(r.amount_paise)}</td>
            <td className="small">{r.signups_that_day} joined that day · {r.shared_network} share one network · {r.face_matches} face matches</td>
            <td><div className="row" style={{ gap: 6 }}>{data.can_manage && <><NoteAction label="Approve" placeholder="Why it's fine" onRun={(n) => api().decideEarning(r.id, true, n)} done={() => { toast("Approved"); reload(); }} />
              <NoteAction label="Reverse" tone="danger" placeholder="Why it doesn't count" onRun={(n) => api().decideEarning(r.id, false, n)} done={() => { toast("Reversed"); reload(); }} /></>}</div></td></tr>)}</tbody></table>}
        </section>
        {data.can_pay && <section className="card flush" aria-label="KYC"><div style={{ padding: "14px 16px 0" }}><h2>PAN and UPI checks</h2></div>
          {data.kyc.length === 0 ? <p className="sub" style={{ padding: 16 }}>No KYC waiting.</p> : <table className="t"><tbody>{data.kyc.map((x) => <tr key={x.cupid_id}>
            <td><strong>{x.cupid}</strong><div className="small">{ago(x.at)} ago</div></td><td>{x.legal_name}<div className="small mono">PAN {x.pan} · {x.upi ?? "no UPI"}</div></td>
            <td>{x.resident ? "Lives in India" : <span className="pill warn">Not resident: no cash payouts</span>}</td>
            <td><div className="row" style={{ gap: 6 }}><button type="button" className="btn sm" disabled={act.busy} onClick={() => act.run(async () => { await api().decideKyc(x.cupid_id, true, null); toast("Verified"); reload(); })}>Verified</button>
              <NoteAction label="Reject" tone="danger" placeholder="What to fix (they see this)" onRun={(n) => api().decideKyc(x.cupid_id, false, n)} done={() => { toast("Sent back"); reload(); }} /></div></td></tr>)}</tbody></table>}
          <p className="small" style={{ padding: "0 16px 12px" }}>Check the name matches the PAN on the income-tax site. Full PAN appears only in the TDS export.</p>
        </section>}
        <section className="card flush" aria-label="Payout queue"><div style={{ padding: "14px 16px 0" }}><h2>Payouts · RazorpayX UPI</h2></div>
          <table className="t"><thead><tr><th>Requested</th><th>Cupid</th><th>Gross</th><th>TDS</th><th>Net to UPI</th><th>Status</th><th /></tr></thead>
            <tbody>{data.payouts.map((y) => <tr key={y.id}><td className="small">{day(y.requested_at)}</td><td>{y.cupid}{y.needs_review && <div><span className="pill warn">above auto-approve</span></div>}</td>
              <td>{rupees(y.gross)}</td><td>{rupees(y.tds)}</td><td><strong>{rupees(y.net)}</strong></td>
              <td><Status s={y.status} />{y.utr && <div className="small mono">UTR {y.utr}</div>}{y.reason && <div className="small">{y.reason}</div>}</td>
              <td>{data.can_pay && y.status === "requested" && <div className="row" style={{ gap: 6 }}><button type="button" className="btn sm" disabled={act.busy} onClick={() => act.run(async () => { await api().decidePayout(y.id, true, null); toast("Approved: sent in the next hourly run"); reload(); })}>Approve</button>
                <NoteAction label="Cancel" tone="danger" placeholder="Why (earnings go back to withdrawable)" onRun={(n) => api().decidePayout(y.id, false, n)} done={() => { toast("Cancelled"); reload(); }} /></div>}</td></tr>)}</tbody></table></section>
        <section className="card stack" aria-label="Blocked referrals"><h2>Blocked referrals · 30 days</h2>
          {Object.keys(data.blocked_30d).length === 0 ? <span className="sub">None.</span> : Object.entries(data.blocked_30d).map(([r, n]) => <div key={r} className="row" style={{ justifyContent: "space-between" }}><span>{label(r)}</span><strong>{n}</strong></div>)}
          <span className="small">Blocked referrals earn nothing. The friend still gets their normal welcome bonus.</span></section>
        {act.error && <p className="err" role="alert">{act.error}</p>}
      </>}
      {tab === "cupids" && <>
        <div className="card flush"><table className="t"><thead><tr><th>Cupid</th><th>Type</th><th>Clicks</th><th>Joined</th><th>Verified</th><th>Paying</th><th>Owed</th><th>Status</th><th /></tr></thead>
          <tbody>{data.cupids.map((c) => <tr key={c.user_id}><td><Link href={`/users/${c.user_id}`}>{c.name}</Link><div className="small mono">{c.short_id}</div></td>
            <td>{c.kind === "partner" ? <span className="pill info">Partner</span> : "Member"}{c.rates.signup_paise && <div className="small">{rupees(c.rates.signup_paise)} / {rupees(c.rates.first_paid_paise ?? 0)}</div>}</td>
            <td>{c.clicks.toLocaleString("en-IN")}</td><td>{c.joined}</td><td>{c.verified}</td><td>{c.paying}</td><td>{rupees(c.owed_paise)}</td>
            <td><Status s={c.status} />{c.kyc && c.kyc !== "verified" && <div className="small">KYC {c.kyc}</div>}</td>
            <td>{data.can_manage && <div className="row" style={{ gap: 6 }}>{c.status === "active" ? <NoteAction label="Pause" onRun={(n) => api().setCupid(c.user_id, "paused", n)} done={() => { toast("Paused"); reload(); }} />
              : c.status === "paused" && <NoteAction label="Resume" onRun={(n) => api().setCupid(c.user_id, "active", n)} done={() => { toast("Resumed"); reload(); }} />}
              {c.status !== "banned" && <NoteAction label="Ban" tone="danger" placeholder="Why (unpaid earnings are reversed)" onRun={(n) => api().setCupid(c.user_id, "banned", n)} done={() => { toast("Banned"); reload(); }} />}</div>}</td></tr>)}</tbody></table></div>
        {data.can_manage && <form className="card stack" aria-label="Add partner" onSubmit={(e) => { e.preventDefault(); act.run(async () => {
            await api().makePartner(p.id.trim(), p.signup ? Math.round(Number(p.signup) * 100) : null, p.paid ? Math.round(Number(p.paid) * 100) : null, p.why); toast("Partner added"); setP({ id: "", signup: "", paid: "", why: "" }); reload(); }); }}>
          <h2>Add a partner</h2><span className="small">Colleges, creators, wedding planners. They must be verified Likha members and sign the partner agreement. Leave rates blank for standard rates.</span>
          <div className="row"><label className="f">Member #ID<input className="input mono" value={p.id} onChange={(e) => setP({ ...p, id: e.target.value })} placeholder="#A1B2C3" /></label>
            <label className="f">₹ per verified sign-up<input className="input" type="number" value={p.signup} onChange={(e) => setP({ ...p, signup: e.target.value })} style={{ width: 120 }} /></label>
            <label className="f">₹ per first payment<input className="input" type="number" value={p.paid} onChange={(e) => setP({ ...p, paid: e.target.value })} style={{ width: 120 }} /></label>
            <label className="f grow">Agreement / reason<input className="input" value={p.why} onChange={(e) => setP({ ...p, why: e.target.value })} /></label></div>
          <button className="btn sm" style={{ alignSelf: "flex-start" }} disabled={act.busy || !p.id.trim() || !p.why.trim()}>Make partner</button>
          {act.error && <p className="err" role="alert">{act.error}</p>}</form>}
      </>}
      {tab === "rules" && <>
        <SettingsForm title="Rates and limits (new earnings only)" canEdit={data.can_rules} onSaved={reload} fields={[
          { key: "cupid", path: "signup_paise", label: "Pay per verified sign-up", unit: "rupees" }, { key: "cupid", path: "first_paid_paise", label: "Pay per new paying member (first payment)", unit: "rupees" },
          { key: "cupid", path: "first_paid_max_pct_of_net", label: "Never more than this share of Likha's net from that payment", unit: "pct" },
          { key: "cupid", path: "min_first_payment_paise", label: "Smallest first payment that counts", unit: "rupees" }, { key: "cupid", path: "hold_days", label: "Hold before money can be withdrawn", unit: "days" },
          { key: "cupid", path: "min_active_days_after_verify", label: "Member must still be active after verifying", unit: "days" }, { key: "cupid", path: "friend_bonus_credits", label: "Friend's thank-you bonus", unit: "credits" },
          { key: "cupid", path: "max_signup_earnings_per_month", label: "Paid sign-ups per Cupid per month", unit: "number" },
          { key: "cupid", path: "review_above_signups_per_day", label: "Send to review above this many sign-ups a day", unit: "number" },
          { key: "cupid", path: "review_above_paise", label: "Send to review above this single earning", unit: "rupees" }, { key: "cupid", path: "attribution_days", label: "A click counts towards a sign-up for", unit: "days" }]} />
        <SettingsForm title="Payouts and tax" canEdit={data.can_rules} onSaved={reload} fields={[
          { key: "cupid", path: "min_payout_paise", label: "Minimum withdrawal", unit: "rupees" }, { key: "cupid", path: "auto_approve_payout_paise", label: "Approve automatically up to", unit: "rupees" },
          { key: "cupid", path: "tds_rate_pct", label: "TDS on commission", unit: "pct" }, { key: "cupid", path: "tds_threshold_paise_fy", label: "TDS starts once a Cupid's year total passes", unit: "rupees" },
          { key: "cupid", path: "require_resident_india", label: "Cash payouts only for people living in India", unit: "bool" }]} />
        <div className="note">TDS on commission: 2% once a person&apos;s total for the year passes ₹20,000, and a higher rate without PAN (PAN is required to withdraw here). File quarterly TDS returns and issue certificates. Confirm the section and rates with your CA before launch. Only direct referrals earn; there are no chains.</div>
      </>}
    </Page>
  );
}
