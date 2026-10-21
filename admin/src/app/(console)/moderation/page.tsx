"use client";
// I1 moderation queue and appeals. Chat text appears only for reported matches, last 50 messages, and each read is logged.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAction, useAdmin } from "@/components/shell";
import { NoteAction, Page, Photo, Status, ago, day, label, useLoad } from "@/components/ui";
import { api, type ModAction } from "@/lib/api";

function ReportPanel({ id, onDone }: { id: string; onDone(): void }) {
  const { toast } = useAdmin();
  const { data: r } = useLoad(() => api().report(id), [id]);
  const [note, setNote] = useState(""); const [days, setDays] = useState(7);
  const { busy, error, run } = useAction();
  if (!r) return <div className="skel" style={{ height: 300 }} />;
  const close = (outcome: "resolved" | "dismissed", action: ModAction | null) => run(async () => {
    await api().resolveReport(r.id, outcome, note, action, action === "suspend" ? days : null); toast(outcome === "dismissed" ? "Dismissed" : `Closed${action ? `: ${action}` : ""}`); onDone(); });
  return (
    <section className="card stack" style={{ gap: 12 }} aria-label="Report">
      <div className="row"><Status s={r.priority} /><h2 className="grow">{label(r.reason)}</h2><span className="small">{ago(r.at)} ago</span></div>
      {r.details && <p className="sub">&ldquo;{r.details}&rdquo;</p>}
      {r.ai_check?.label && <span className="pill info" style={{ alignSelf: "flex-start" }}>Automatic check: {r.ai_check.label}{r.ai_check.score ? `, ${r.ai_check.score}` : ""}</span>}
      <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 12 }}>
        <Photo path={r.reported.photo} name={r.reported.name} />
        <dl className="kv" style={{ gridTemplateColumns: "90px 1fr" }}><dt>Reported</dt><dd><Link href={`/users/${r.reported_id}`}>{r.reported.name}{r.reported.age ? `, ${r.reported.age}` : ""}</Link></dd>
          <dt>Account</dt><dd><Status s={r.reported.status} /> <Status s={r.reported.selfie} /></dd><dt>Joined</dt><dd>{day(r.reported.joined)}</dd>
          <dt>Other reports</dt><dd>{r.other_reports.length ? r.other_reports.map((o) => label(o.reason)).join(", ") : "None"}</dd></dl>
      </div>
      {r.chat ? <div className="stack" style={{ gap: 6, maxHeight: 280, overflowY: "auto", padding: 10, background: "#FBF9FE", borderRadius: 12 }} aria-label="Reported chat">
          <span className="small">Last {r.chat.length} messages of this match. Your reading is logged.</span>
          {r.chat.map((m, i) => <div key={i} className={`bubble ${m.from === "reported" ? "them bad" : "me"}`}><span className="small">{m.from === "reported" ? r.reported.name : "Reporter"} · {ago(m.at)}</span><br />{m.body}</div>)}
        </div> : r.can_read_chat ? <span className="small">No chat attached to this report.</span> : <span className="small">Your role can't read reported chats.</span>}
      <textarea className="input" aria-label="Decision note" placeholder="What you decided and why (the audit log keeps it; the reporter only hears that we acted)" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <p className="err" role="alert">{error}</p>}
      <div className="row">
        <button type="button" className="btn ghost sm" disabled={busy} onClick={() => close("resolved", "warn")}>Warn</button>
        <span className="row" style={{ gap: 4 }}><button type="button" className="btn ghost sm" disabled={busy} onClick={() => close("resolved", "suspend")}>Suspend</button>
          <input className="input" type="number" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 64, height: 30 }} aria-label="Suspension days" /><span className="small">days</span></span>
        <button type="button" className="btn danger sm" disabled={busy} onClick={() => close("resolved", "ban")}>Ban</button>
        <button type="button" className="btn ghost sm" disabled={busy} onClick={() => close("resolved", null)}>Close, no action</button>
        <button type="button" className="btn ghost sm" disabled={busy} onClick={() => close("dismissed", null)}>Dismiss</button>
      </div>
    </section>
  );
}

function Moderation() {
  const sp = useSearchParams();
  const { toast } = useAdmin();
  const [tab, setTab] = useState(sp.get("tab") === "appeals" ? "appeals" : "open");
  const [sel, setSel] = useState<string | null>(null);
  const reports = useLoad(() => api().reports(tab === "closed" ? "closed" : "open"), [tab]);
  const appeals = useLoad(() => api().appeals(), [tab]);
  return (
    <Page title="Moderation" sub="Reports from members, oldest urgent first. Decide, note why, and the member is told only what they need to know.">
      <div className="tabs" role="tablist">{[["open", `Open${reports.data && tab === "open" ? ` · ${reports.data.length}` : ""}`], ["appeals", `Appeals${appeals.data ? ` · ${appeals.data.length}` : ""}`], ["closed", "Closed (30 days)"]].map(([k, l]) =>
        <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setSel(null); }}>{l}</button>)}</div>
      {tab !== "appeals" ? (
        <div className="split">
          <div className="card flush">{reports.data?.length === 0 ? <p className="sub" style={{ padding: 16 }}>Nothing here. Good.</p> : (
            <table className="t"><thead><tr><th>Priority</th><th>Case</th><th>Reported</th><th>Automatic check</th><th>Age</th></tr></thead>
              <tbody>{(reports.data ?? []).map((r) => (
                <tr key={r.id} className="click" aria-selected={sel === r.id} onClick={() => setSel(r.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSel(r.id)}>
                  <td><Status s={r.priority} /></td><td><strong>{label(r.reason)}</strong>{r.details && <div className="small">{r.details}</div>}</td>
                  <td className="mono">{r.reported}{r.times_reported > 1 && <div className="small">reported {r.times_reported}×</div>}</td>
                  <td className="small">{r.ai_check?.label ? `${r.ai_check.label}${r.ai_check.score ? `, ${r.ai_check.score}` : ""}` : "–"}</td><td className="small">{ago(r.at)}</td></tr>))}</tbody></table>)}</div>
          {sel && tab === "open" ? <ReportPanel key={sel} id={sel} onDone={() => { setSel(null); reports.reload(); }} /> : <div className="note">Pick a report to see the details{tab === "open" ? " and decide" : ""}.</div>}
        </div>
      ) : (
        <div className="stack">{(appeals.data ?? []).length === 0 ? <div className="card sub">No open appeals.</div> : appeals.data!.map((a) => (
          <section key={a.id} className="card stack" aria-label={`Appeal from ${a.user}`}>
            <div className="row"><strong className="grow"><Link href={`/users/${a.user_id}`}>{a.user}</Link> appeals a {a.action}</strong><span className="small">{ago(a.at)} ago</span></div>
            <span className="small">Decision {day(a.acted_at)}: {a.reason}</span>
            <p style={{ margin: 0 }}>&ldquo;{a.text}&rdquo;</p>
            <div className="row"><NoteAction label="Uphold" placeholder="Why the decision stands (the member reads this)" onRun={(n) => api().decideAppeal(a.id, false, n)} done={() => { toast("Upheld"); appeals.reload(); }} />
              <NoteAction label="Overturn and restore" placeholder="What changed your mind" onRun={(n) => api().decideAppeal(a.id, true, n)} done={() => { toast("Overturned"); appeals.reload(); }} /></div>
            <span className="small">Someone other than the person who made the decision must review it.</span>
          </section>))}</div>
      )}
    </Page>
  );
}
export default function ModerationPage() { return <Suspense><Moderation /></Suspense>; }
