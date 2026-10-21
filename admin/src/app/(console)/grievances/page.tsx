"use client";
// I6 Grievances under India's IT Rules: acknowledge within 24 hours, resolve within 15 days, publish a monthly report.
import Link from "next/link";
import { useState } from "react";
import { useAction, useAdmin } from "@/components/shell";
import { Kpi, Page, Status, ago, day, download, label, useLoad } from "@/components/ui";
import { api, type GrievanceRow } from "@/lib/api";

function Panel({ g, team, done }: { g: GrievanceRow; team: { id: string; name: string }[]; done(): void }) {
  const { toast } = useAdmin();
  const [owner, setOwner] = useState(""); const [msg, setMsg] = useState(""); const [res, setRes] = useState("");
  const { busy, error, run } = useAction();
  const late = !g.acked && new Date(g.ack_due) < new Date();
  return (
    <section className="card stack" style={{ gap: 12 }} aria-label={`Grievance ${g.ticket_no}`}>
      <div className="row"><h2 className="grow">{g.ticket_no} · {label(g.category)}</h2><Status s={g.status} /></div>
      <p style={{ margin: 0 }}>&ldquo;{g.description}&rdquo;</p>
      <dl className="kv"><dt>From</dt><dd>{g.user_id ? <Link href={`/users/${g.user_id}`}>{g.user}</Link> : g.user}</dd><dt>Received</dt><dd>{day(g.at)} ({ago(g.at)} ago)</dd>
        <dt>24-hour acknowledgement</dt><dd>{g.acked ? `Done ${day(g.acked)}` : <span className={`pill ${late ? "bad" : "warn"}`}>{late ? `Overdue by ${ago(g.ack_due)}` : `Due in ${ago(g.ack_due)}`}</span>}</dd>
        <dt>15-day deadline</dt><dd>{day(g.resolve_due)}</dd><dt>Owner</dt><dd>{g.owner ?? "–"}</dd>
        {g.attachments.length > 0 && <><dt>Attachments</dt><dd>{g.attachments.length}</dd></>}</dl>
      {g.status !== "resolved" && <>
        {!g.acked && <form className="stack" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); run(async () => { await api().ackGrievance(g.id, owner || null, msg); toast("Acknowledged"); done(); }); }}>
          <div className="row"><select className="input" aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Me</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <input className="input grow" aria-label="Acknowledgement message" placeholder="A person is looking into it." value={msg} onChange={(e) => setMsg(e.target.value)} /></div>
          <button className="btn sm" style={{ alignSelf: "flex-start" }} disabled={busy}>Acknowledge</button></form>}
        <textarea className="input" aria-label="Resolution" placeholder="The outcome, in words the member will read" value={res} onChange={(e) => setRes(e.target.value)} />
        <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} disabled={busy || !res.trim()} onClick={() => run(async () => { await api().resolveGrievance(g.id, res); toast("Resolved and member told"); done(); })}>Resolve</button>
      </>}
      {g.resolution && <div className="note">Outcome sent: {g.resolution}</div>}
      {error && <p className="err" role="alert">{error}</p>}
    </section>
  );
}

export default function Grievances() {
  const { data, reload } = useLoad(() => api().grievances());
  const [sel, setSel] = useState<string | null>(null);
  const rep = useAction();
  if (!data) return <div className="skel" style={{ height: 400 }} />;
  const g = data.rows.find((x) => x.id === sel);
  const report = () => rep.run(async () => {
    const r = await api().grievanceReport(new Date().toISOString().slice(0, 10));
    const lines = [["Month", r.month], ["Complaints received", r.received], ["Resolved", r.resolved], ["Acknowledged within 24 h", r.acked_in_24h], ["Resolved within 15 days", r.resolved_in_15d],
      ["Accounts actioned (hide, suspend, ban)", r.actions], ...Object.entries(r.by_category).map(([k, v]) => [`Category: ${k}`, v])];
    download(`likha-grievance-report-${r.month.replace(" ", "-")}.csv`, lines.map((l) => l.join(",")).join("\n"), "text/csv");
  });
  const k = data.kpis;
  return (
    <Page title="Grievances" sub="Formal complaints under India's IT Rules: acknowledge in 24 hours, resolve in 15 days."
      actions={<button type="button" className="btn ghost" disabled={rep.busy} onClick={report}>Monthly compliance report</button>}>
      <div className="kpis"><Kpi k="Open" v={k.open} /><Kpi k="Ack overdue (24 h)" v={k.ack_overdue} alert={k.ack_overdue > 0} s={k.ack_overdue ? "reply now" : "on time"} />
        <Kpi k="Due in 3 days" v={k.due_3d} /><Kpi k="Resolved this month" v={k.resolved_month} s={k.avg_days ? `avg ${k.avg_days} days` : ""} /></div>
      <div className="split">
        <div className="card flush"><table className="t"><thead><tr><th>Ticket</th><th>Complaint</th><th>24 h ack</th><th>Deadline</th><th>Status</th></tr></thead>
          <tbody>{data.rows.map((x) => <tr key={x.id} className="click" aria-selected={sel === x.id} onClick={() => setSel(x.id)}>
            <td className="mono">{x.ticket_no}</td><td><strong>{x.description}</strong><div className="small">{x.user} · {label(x.category)}</div></td>
            <td>{x.acked ? <Status s="resolved" text="Acknowledged" /> : new Date(x.ack_due) < new Date() ? <span className="pill bad">Overdue</span> : <span className="pill warn">Due {ago(x.ack_due)}</span>}</td>
            <td className="small">{day(x.resolve_due)}</td><td><Status s={x.status} /></td></tr>)}</tbody></table></div>
        {g ? <Panel key={g.id} g={g} team={data.team} done={reload} /> : <div className="note">Pick a grievance. The Grievance Officer&apos;s name and contact are shown to members from General settings.</div>}
      </div>
    </Page>
  );
}
