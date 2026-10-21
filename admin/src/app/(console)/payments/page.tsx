"use client";
// I5 Payments and refunds: every rupee matched against Razorpay. Re-check asks Razorpay directly; bank refunds need two people.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAction, useAdmin } from "@/components/shell";
import { Kpi, Page, Status, ago, day, rupees, useLoad } from "@/components/ui";
import { api, type PaymentRow } from "@/lib/api";

const FILTERS: [string, string][] = [["all", "All"], ["not_credited", "Paid, not credited"], ["unconfirmed", "Unconfirmed"], ["failed", "Failed"], ["refunded", "Refunded"]];

function RowActions({ p, reload }: { p: PaymentRow; reload(): void }) {
  const { toast, me } = useAdmin();
  const [open, setOpen] = useState(false); const [amount, setAmount] = useState(String(p.amount_paise / 100)); const [why, setWhy] = useState("");
  const { busy, error, run } = useAction();
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 6 }}>
        {(p.status === "created" || p.status === "authorized" || (p.status === "captured" && !p.credited)) &&
          <button type="button" className="btn sm" disabled={busy} onClick={() => run(async () => { const r = await api().recheckPayment(p.id); toast(r.note); reload(); })}>{busy ? "Asking Razorpay…" : "Re-check"}</button>}
        {p.status === "captured" && (me.perms.includes("refunds.small") || me.perms.includes("refunds.large")) && !open &&
          <button type="button" className="btn ghost sm" onClick={() => setOpen(true)}>Refund…</button>}
      </div>
      {open && <form className="stack" style={{ gap: 6 }} aria-label="Bank refund" onSubmit={(e) => { e.preventDefault(); run(async () => {
          await api().refund(p.user_id, "bank", why, null, Math.round(Number(amount) * 100), p.id); setOpen(false); toast("Refund requested: a second person approves it"); reload(); }); }}>
        <div className="row"><label className="f">₹<input className="input" type="number" min={1} max={p.amount_paise / 100} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 100 }} /></label>
          <label className="f grow">Reason<input className="input" value={why} onChange={(e) => setWhy(e.target.value)} /></label></div>
        <div className="row"><button className="btn sm" disabled={busy || !why.trim()}>Ask for approval</button><button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button></div>
      </form>}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}

function PaymentsInner() {
  const sp = useSearchParams();
  const { toast } = useAdmin();
  const [filter, setFilter] = useState(sp.get("filter") ?? "all"); const [q, setQ] = useState(""); const [query, setQuery] = useState("");
  const { data, err, reload } = useLoad(() => api().payments(filter, query), [filter, query]);
  const act = useAction();
  if (err) return <div className="note warn">{err}</div>;
  if (!data) return <div className="skel" style={{ height: 400 }} />;
  const k = data.kpis;
  const waiting = data.refunds.filter((r) => r.status === "awaiting_second_approval" || r.status === "approved");
  return (
    <Page title="Payments and refunds" sub="Every rupee in and every credit out, matched against Razorpay.">
      <div className="kpis">
        <Kpi k="Gross today" v={rupees(k.gross_today_paise)} s={`${k.payments_today} payments`} />
        <Kpi k="Refunds today" v={rupees(k.refunds_today_paise)} s={`${k.refunds_today} refunds`} />
        <Kpi k="Failed" v={k.failed_today} s={k.attempts_today ? `${Math.round((k.failed_today / k.attempts_today) * 100)}% of attempts` : ""} />
        <Kpi k="Paid, not credited" v={k.not_credited} s="fix within 1 hour" alert={k.not_credited > 0} />
        <Kpi k="Unconfirmed" v={k.unconfirmed} s="no webhook after 10 min" alert={k.unconfirmed > 0} />
      </div>
      {waiting.length > 0 && <section className="card stack" aria-label="Refunds waiting"><h2>Refunds waiting</h2>
        {waiting.map((r) => <div key={r.id} className="row" style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 8 }}>
          <span className="grow"><Link href={`/users/${r.user_id}`}>{r.user}</Link> · {r.method === "bank" ? `${rupees(r.amount_paise ?? 0)} to bank` : `${r.credits} credits`} · {r.reason}
            <span className="small"> · asked by {r.requested_by} {ago(r.at)} ago</span></span>
          <Status s={r.status} text={r.status === "approved" ? "approved, not sent" : undefined} />
          {r.status === "awaiting_second_approval" && data.can_approve && (r.mine ? <span className="small">You asked; someone else approves</span>
            : <button type="button" className="btn sm" disabled={act.busy} onClick={() => act.run(async () => { await api().approveRefund(r.id); toast("Approved"); reload(); })}>Approve</button>)}
          {r.status === "approved" && r.method === "bank" && data.can_approve && <button type="button" className="btn dark sm" disabled={act.busy}
            onClick={() => act.run(async () => { const x = await api().sendRefund(r.id); toast(x.note); reload(); })}>Send to Razorpay</button>}
        </div>)}
        {act.error && <p className="err" role="alert">{act.error}</p>}
      </section>}
      <div className="row"><div className="chips" role="group" aria-label="Filter">{FILTERS.map(([key, l]) => <button key={key} type="button" className="chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>{l}</button>)}</div>
        <form className="row" style={{ marginLeft: "auto" }} onSubmit={(e) => { e.preventDefault(); setQuery(q); }}>
          <input className="input mono" aria-label="Search payments" placeholder="pay_… / order_… / #ID / invoice" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn ghost">Find</button></form></div>
      <div className="card flush"><table className="t">
        <thead><tr><th>Time</th><th>Member</th><th>Item</th><th>Amount</th><th>Razorpay</th><th>Payment</th><th>Wallet</th><th /></tr></thead>
        <tbody>{data.rows.length === 0 ? <tr><td colSpan={8} className="sub">No payments here.</td></tr> : data.rows.map((p) => (
          <tr key={p.id}><td className="small">{day(p.at)} {new Date(p.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</td>
            <td><Link href={`/users/${p.user_id}`}>{p.user}</Link></td><td>{p.item}</td><td>{rupees(p.amount_paise)}{p.refunded_paise > 0 && <div className="small">−{rupees(p.refunded_paise)} refunded</div>}</td>
            <td className="mono small">{p.ref ?? p.order}</td><td><Status s={p.status} /></td>
            <td>{p.status === "captured" ? (p.credited ? <Status s="credited" /> : <span className="pill bad">Not credited</span>) : "–"}</td>
            <td><RowActions p={p} reload={reload} /></td></tr>))}</tbody></table></div>
    </Page>
  );
}
export default function PaymentsPage() { return <Suspense><PaymentsInner /></Suspense>; }
