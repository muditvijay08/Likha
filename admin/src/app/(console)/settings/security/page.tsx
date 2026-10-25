"use client";
// I22 Security and data. Facts from Likha's own records: who can see sensitive data, how often it was opened, MFA, retention.
import Link from "next/link";
import { useAdmin } from "@/components/shell";
import { SettingsForm } from "@/components/settings-form";
import { Kpi, Page, label, useLoad } from "@/components/ui";
import { when } from "@/components/shell";
import { api } from "@/lib/api";

export default function SecurityPage() {
  const { me } = useAdmin();
  const can = me.perms.includes("settings.write");
  const { data } = useLoad(() => api().security());
  const audit = useLoad(() => (can ? api().securityAudit() : Promise.resolve(null)), [can]);
  const OPEN = ["city_counters", "crush_landing", "gift_landing", "public_settings", "sos_view"];
  return (
    <Page title="Security and data" sub="Every view of birth details or a reported chat is in the audit log. Admin always needs a second step (MFA).">
      {!data ? <div className="skel" style={{ height: 120 }} /> : <>
        <div className="kpis">
          <Kpi k="Birth details revealed" v={data.reveals_30d} s="last 30 days" href="/team" />
          <Kpi k="Reported chats read" v={data.chat_reads_30d} s="last 30 days" href="/team" />
          <Kpi k="Team without MFA" v={data.team_without_mfa} s="can't open Admin until set" alert={data.team_without_mfa > 0} />
          <Kpi k="Data requests due in" v={`${data.data_request_days} days`} s="target" href="/data-requests" />
        </div>
        <div className="split">
          <section className="card stack" aria-label="Who can see sensitive data">
            <h2>Who can see sensitive data</h2>
            <div className="kv"><span className="small">Birth details</span><span>{data.reveal_roles.map(label).join(", ")}</span>
              <span className="small">Reported chats</span><span>{data.chat_roles.map(label).join(", ")}</span>
              <span className="small">Provider keys</span><span>Owner only, write-only (last 4 shown)</span>
              <span className="small">Chats without a report</span><span>Nobody, including Likha staff and agents</span></div>
            <Link className="small" href="/team">Change roles on Team and audit →</Link>
          </section>
          <SettingsForm title="Data rules" canEdit={can} fields={[
            { key: "data_request_days", label: "Finish export and delete requests within", unit: "days" },
            { key: "retention", path: "deleted_accounts_days", label: "Keep deleted accounts for", unit: "days" },
            { key: "retention", path: "safety_reports_years", label: "Keep safety reports for", unit: "number", hint: "years" },
            { key: "retention", path: "audit_years", label: "Keep the audit log for", unit: "number", hint: "years" },
            { key: "retention", path: "app_logs_days", label: "Keep app logs for", unit: "days" },
            { key: "admin_session_minutes", label: "Sign team members out after", unit: "minutes", hint: "of no activity" }]} />
        </div>
        {audit.data && <section className="card stack" aria-label="Security checks">
          <div className="row"><h2 className="grow">Security checks</h2><span className="small">Checked {when(audit.data.checked_at)}</span>
            <button type="button" className="btn ghost sm" onClick={audit.reload}>Check again</button></div>
          {([
            ["Every table has row-level security", audit.data.tables_without_rls.length === 0, audit.data.tables_without_rls.join(", ")],
            ["Signed-out visitors can only use the public website", audit.data.open_to_visitors.every((f) => OPEN.includes(f)), audit.data.open_to_visitors.filter((f) => !OPEN.includes(f)).join(", ")],
            ["Server-only functions are closed to members", audit.data.server_only_callable_by_members.length === 0, audit.data.server_only_callable_by_members.join(", ")],
            ["Privileged functions pin their search path", audit.data.definer_without_search_path.length === 0, audit.data.definer_without_search_path.join(", ")],
            ["Everyone on the team uses two-step sign-in", audit.data.team_without_mfa === 0, `${audit.data.team_without_mfa} without`],
          ] as [string, boolean, string][]).map(([t, ok, extra]) => (
            <div key={t} className="row" style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 8 }}>
              <span className={`pill ${ok ? "ok" : "bad"}`}>{ok ? "Pass" : "Fix"}</span><span className="grow">{t}</span>{!ok && <span className="small mono">{extra}</span>}</div>))}
          <span className="small">These read the live database. A Fix here means a change opened something it shouldn&apos;t: run <span className="mono">select private.lockdown();</span> and check the last migration.</span>
        </section>}
        <section className="card stack" aria-label="Consent records">
          <h2>Consent records</h2>
          <table className="t"><thead><tr><th>Document</th><th>Version</th><th>Members agreed</th></tr></thead><tbody>
            {data.consents.filter((c) => c.latest).map((c) => <tr key={c.key}><td>{c.title}</td><td>{c.version}</td><td>{c.members.toLocaleString("en-IN")}</td></tr>)}</tbody></table>
          <Link className="small" href="/settings/general">Publish new versions on General and legal →</Link>
        </section>
      </>}
    </Page>
  );
}
