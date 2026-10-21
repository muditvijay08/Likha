"use client";
// I8 Data requests under the DPDP Act: export, delete, correct, withdraw consent. Each closes with proof.
import Link from "next/link";
import { useState } from "react";
import { useAction, useAdmin } from "@/components/shell";
import { NoteAction, Page, Status, day, download, label, useLoad } from "@/components/ui";
import { api, type DataRequest } from "@/lib/api";

const ERASE = ["Profile, photos and prompts", "Chats they sent and Saathi messages", "Birth details and kundli", "Matches show them as \"Deleted user\" to the other person"];

function Row({ r, done }: { r: DataRequest; done(): void }) {
  const { toast } = useAdmin();
  const [confirm, setConfirm] = useState(false);
  const { busy, error, run } = useAction();
  const open = r.status !== "resolved";
  const late = open && new Date(r.due) < new Date();
  return (
    <tr>
      <td className="mono">{r.id.slice(0, 8)}</td><td>{r.user_id ? <Link href={`/users/${r.user_id}`}>{r.user}</Link> : r.user}</td>
      <td><strong>{label(r.kind)}</strong>{r.details && <div className="small">{r.details}</div>}</td><td className="small">{day(r.at)}</td>
      <td>{open ? <span className={`pill ${late ? "bad" : "warn"}`}>due {day(r.due)}</span> : <Status s="resolved" text={`Done ${day(r.done)}`} />}</td>
      <td style={{ width: 320 }}>
        {open && r.kind === "export" && <button type="button" className="btn sm" disabled={busy} onClick={() => run(async () => {
          const data = await api().exportUser(r.id); download(`likha-export-${r.user.replace(/\W+/g, "-")}.json`, JSON.stringify(data, null, 2)); toast("Export downloaded. Email it to the member from support@."); done(); })}>Make export file</button>}
        {open && r.kind === "delete" && r.user_id && (confirm ? (
          <div className="stack" style={{ gap: 6 }}><strong className="small">Erase {r.user}? This can&apos;t be undone.</strong>
            <ul className="small" style={{ margin: 0, paddingLeft: 16 }}>{ERASE.map((x) => <li key={x}>{x}</li>)}<li>Kept: payment and GST records, as tax law requires</li></ul>
            <div className="row"><button type="button" className="btn danger sm" disabled={busy} onClick={() => run(async () => { await api().eraseUser(r.user_id!, r.id); toast("Erased. Proof saved."); done(); })}>Erase now</button>
              <button type="button" className="btn ghost sm" onClick={() => setConfirm(false)}>Cancel</button></div></div>
        ) : <button type="button" className="btn danger sm" onClick={() => setConfirm(true)}>Erase…</button>)}
        {open && (r.kind === "correct" || r.kind === "withdraw_consent") && <NoteAction label="Mark done" placeholder={r.kind === "correct" ? "What was corrected (birth time changes: owner uses Users > Birth details)" : "What was switched off"}
          onRun={(n) => api().closeDataRequest(r.id, n)} done={() => { toast("Closed and member told"); done(); }} />}
        {!open && r.proof && <span className="small">Proof: {Object.keys(r.proof).join(", ")}</span>}
        {error && <p className="err" role="alert">{error}</p>}
      </td>
    </tr>
  );
}

export default function DataRequests() {
  const { data, reload } = useLoad(() => api().dataRequests());
  if (!data) return <div className="skel" style={{ height: 300 }} />;
  return (
    <Page title="Data requests" sub="Export, delete, correct and consent changes under India's DPDP Act, with proof for each. Target: 7 days.">
      <div className="card flush"><table className="t"><thead><tr><th>ID</th><th>Member</th><th>Request</th><th>Received</th><th>Target</th><th /></tr></thead>
        <tbody>{data.length === 0 ? <tr><td colSpan={6} className="sub">No requests.</td></tr> : data.map((r) => <Row key={r.id} r={r} done={reload} />)}</tbody></table></div>
      <div className="note">Selfie images are never stored, so there is nothing to erase there. Exports include only what the member sent, never other people&apos;s messages.</div>
    </Page>
  );
}
