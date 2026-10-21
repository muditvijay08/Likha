"use client";
// I17 General and legal: brand and support details, maintenance switch, company and grievance officer, and versioned legal documents.
import { useState } from "react";
import { useAction, useAdmin, when } from "@/components/shell";
import { SettingsForm } from "@/components/settings-form";
import { Page, label, useLoad } from "@/components/ui";
import { api, type ConsentRow } from "@/lib/api";

function Publish({ row, done }: { row: ConsentRow; done(): void }) {
  const { toast } = useAdmin();
  const next = (() => { const [a, b] = row.version.split("."); return `${a}.${Number(b ?? 0) + 1}`; })();
  const [open, setOpen] = useState(false); const [version, setVersion] = useState(next); const [title, setTitle] = useState(row.title); const [body, setBody] = useState("");
  const [required, setRequired] = useState(row.required); const [note, setNote] = useState(""); const act = useAction();
  if (!open) return <button type="button" className="btn ghost sm" onClick={() => setOpen(true)}>New version</button>;
  return (
    <form className="card stack" style={{ gap: 8 }} aria-label={`New version of ${row.title}`} onSubmit={(e) => { e.preventDefault(); act.run(async () => {
        await api().publishConsent(row.key, version, title, body, required, note); toast(`${title} ${version} published`); setOpen(false); done(); }); }}>
      <div className="row"><label className="f">Version<input className="input" value={version} onChange={(e) => setVersion(e.target.value)} style={{ width: 90 }} /></label>
        <label className="f grow">Title<input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></label></div>
      <label className="f">What members agree to<textarea className="input" style={{ minHeight: 110 }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Paste the exact wording" /></label>
      <label className="row small"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />Required (members must agree again before using the app)</label>
      <input className="input" aria-label="What changed" placeholder="What changed? (audit log)" value={note} onChange={(e) => setNote(e.target.value)} />
      {required && <div className="note warn">Every member who agreed to an earlier version will see this text and an unticked box the next time they open the app.</div>}
      {act.error && <p className="err" role="alert">{act.error}</p>}
      <div className="row"><button className="btn sm" disabled={act.busy}>Publish</button><button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  );
}

export default function GeneralPage() {
  const { me, toast } = useAdmin();
  const can = me.perms.includes("settings.write");
  const docs = useLoad(() => api().consents());
  const app = useLoad(() => api().settings(["app"]));
  const maint = Boolean((app.data?.app?.value as { maintenance?: boolean } | undefined)?.maintenance);
  return (
    <Page title="General and legal" sub="Who Likha is, how members reach you, and the documents they agree to.">
      {maint && <div className="note warn" role="alert"><strong>Maintenance is on.</strong> Members see the maintenance message instead of the app.</div>}
      <div className="split">
        <SettingsForm title="App and support" canEdit={can} onSaved={app.reload} fields={[
          { key: "app", path: "maintenance", label: "Maintenance mode", unit: "bool", hint: "Shows the message below on every screen of the member app." },
          { key: "app", path: "maintenance_message", label: "Maintenance message", unit: "text" },
          { key: "app", path: "name", label: "App name", unit: "text" }, { key: "app", path: "tagline", label: "Tagline", unit: "text" },
          { key: "app", path: "support_email", label: "Support email", unit: "text" }, { key: "app", path: "support_whatsapp", label: "Support WhatsApp", unit: "text" },
          { key: "app", path: "min_app_version", label: "Oldest app version allowed", unit: "text", unused: true }]} />
        <div className="stack" style={{ gap: 16 }}>
          <SettingsForm title="Company (shown on invoices and legal pages)" canEdit={can} fields={[
            { key: "company", path: "legal_name", label: "Legal name", unit: "text" }, { key: "company", path: "gstin", label: "GSTIN", unit: "text" },
            { key: "company", path: "cin", label: "CIN", unit: "text" }, { key: "company", path: "address", label: "Registered address", unit: "text" }]} />
          <SettingsForm title="Grievance officer (IT Rules)" canEdit={can} fields={[
            { key: "grievance_officer", path: "name", label: "Name", unit: "text" }, { key: "grievance_officer", path: "email", label: "Email", unit: "text" },
            { key: "grievance_officer", path: "phone", label: "Phone", unit: "text" },
            { key: "grievance_officer", path: "ack_hours", label: "Acknowledge within", unit: "hours" }, { key: "grievance_officer", path: "resolve_days", label: "Resolve within", unit: "days" }]} />
        </div>
      </div>
      <section className="card stack" aria-label="Legal documents">
        <h2>Documents members agree to</h2>
        {(docs.data?.policy_review ?? []).map((d) => <div key={d} className="note warn row" role="alert"><span className="grow">The {label(d)} policy may be out of date after a rule change.</span>
          {can && <button type="button" className="btn ghost sm" onClick={() => api().clearPolicyReview(d).then(() => { toast("Marked as reviewed"); docs.reload(); }).catch((e: Error) => toast(e.message))}>Mark reviewed</button>}</div>)}
        {!docs.data ? <div className="skel" style={{ height: 160 }} /> : <table className="t"><thead><tr><th>Document</th><th>Version</th><th>Required</th><th>Members agreed</th><th>Published</th><th /></tr></thead><tbody>
          {docs.data.rows.map((r) => <tr key={r.key + r.version}><td>{r.title}<div className="small mono">{r.key}</div></td><td>{r.version}{r.latest && <span className="pill ok" style={{ marginLeft: 6 }}>Current</span>}</td>
            <td>{r.required ? "Yes" : "Optional"}</td><td>{r.members.toLocaleString("en-IN")}</td><td className="small">{when(r.published_at)}</td>
            <td>{can && r.latest && <Publish row={r} done={docs.reload} />}</td></tr>)}
        </tbody></table>}
        <span className="small">Consent is recorded per version under India&apos;s DPDP Act. Optional documents (like offers) never block the app.</span>
      </section>
    </Page>
  );
}
