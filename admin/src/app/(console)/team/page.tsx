"use client";
// I9 Team and roles, plus the audit log. Least access by default; two-step sign-in is required for everyone.
import { Fragment, useState } from "react";
import { useAction, useAdmin } from "@/components/shell";
import { Page, Status, ago, label, useLoad } from "@/components/ui";
import { api, type AuditRow } from "@/lib/api";

function Audit() {
  const [q, setQ] = useState(""); const [query, setQuery] = useState(""); const [who, setWho] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const { data, err } = useLoad(() => api().audit(query, who, null), [query, who]);
  if (err) return <div className="note warn">{err === "You don't have permission for this." ? "Your role can't read the audit log." : err}</div>;
  return (
    <section className="stack" aria-label="Audit log">
      <div className="row"><form className="row" onSubmit={(e) => { e.preventDefault(); setQuery(q); }}><input className="input" aria-label="Search the audit log" placeholder="refund, #A1B2C3, reason…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn ghost">Search</button></form>
        <div className="chips">{[[null, "Everyone"], ["team", "Team"], ["ai", "AI agents"], ["system", "System"], ["user", "Members"]].map(([k, l]) =>
          <button key={String(k)} type="button" className="chip" aria-pressed={who === k} onClick={() => setWho(k)}>{l}</button>)}</div></div>
      <div className="card flush"><table className="t"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>On</th><th>Reason</th></tr></thead>
        <tbody>{(data ?? []).map((a: AuditRow) => <Fragment key={a.id}><tr className="click" onClick={() => setOpen(open === a.id ? null : a.id)}>
          <td className="small">{new Date(a.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td><td>{a.who}</td><td>{label(a.action)}</td>
          <td className="small mono">{a.target_type ? `${a.target_type} ` : ""}{a.target_id ?? ""}</td><td className="small">{a.reason ?? ""}</td></tr>
          {open === a.id && <tr><td colSpan={5} className="small mono" style={{ whiteSpace: "pre-wrap" }}>{a.before ? `Before: ${JSON.stringify(a.before)}\n` : ""}{a.after ? `After: ${JSON.stringify(a.after)}` : "No details"}</td></tr>}</Fragment>)}</tbody></table></div>
      <span className="small">Every admin and AI action is kept for 3 years. Values of keys are never logged.</span>
    </section>
  );
}

export default function TeamPage() {
  const { toast, me } = useAdmin();
  const { data, reload } = useLoad(() => api().team());
  const [tab, setTab] = useState<"team" | "roles" | "audit">("team");
  const [inv, setInv] = useState({ name: "", email: "", role: "support" });
  const [edit, setEdit] = useState<string | null>(null); const [role, setRole] = useState("support"); const [why, setWhy] = useState("");
  const [pwhy, setPwhy] = useState("");
  const { busy, error, run } = useAction();
  if (!data) return <div className="skel" style={{ height: 400 }} />;
  return (
    <Page title="Team and audit" sub="Least access by default. Everyone signs in with an email code and an authenticator app.">
      <div className="tabs" role="tablist">{([["team", "Team"], ["roles", "What each role can do"], ["audit", "Audit log"]] as const).map(([t, l]) =>
        <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{l}</button>)}</div>
      {tab === "team" && <>
        <div className="card flush"><table className="t"><thead><tr><th>Name</th><th>Role</th><th>Two-step sign-in</th><th>Last signed in</th><th /></tr></thead>
          <tbody>{data.members.map((m) => <tr key={m.user_id} style={{ opacity: m.active ? 1 : 0.55 }}>
            <td><strong>{m.name}</strong><div className="small">{m.email}{m.invited_by ? ` · invited by ${m.invited_by}` : ""}</div></td>
            <td>{label(m.role)}{!m.active && <span className="pill off">removed</span>}</td>
            <td>{m.mfa === null ? <span className="small">–</span> : m.mfa ? <Status s="active" text="On" /> : <Status s="high" text="Setup pending" />}</td>
            <td className="small">{m.last_sign_in ? `${ago(m.last_sign_in)} ago` : "never"}</td>
            <td>{data.can_manage && m.user_id !== data.me && (edit === m.user_id ? (
              <div className="stack" style={{ gap: 6 }}><select className="input" aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}>{data.roles.map((r) => <option key={r} value={r}>{label(r)}</option>)}</select>
                <input className="input" aria-label="Role change reason" placeholder="Reason" value={why} onChange={(e) => setWhy(e.target.value)} />
                <div className="row"><button type="button" className="btn sm" disabled={busy || !why.trim()} onClick={() => run(async () => { await api().setMember(m.user_id, role, true, why); toast("Role changed"); setEdit(null); setWhy(""); reload(); })}>Save</button>
                  {m.active && <button type="button" className="btn danger sm" disabled={busy || !why.trim()} onClick={() => run(async () => { await api().setMember(m.user_id, m.role, false, why); toast(`${m.name} removed`); setEdit(null); setWhy(""); reload(); })}>Remove access</button>}
                  <button type="button" className="btn ghost sm" onClick={() => setEdit(null)}>Cancel</button></div></div>
            ) : <button type="button" className="btn ghost sm" onClick={() => { setEdit(m.user_id); setRole(m.role); }}>Change</button>)}</td></tr>)}</tbody></table></div>
        {data.can_manage && <form className="card stack" aria-label="Invite member" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await api().inviteMember(inv.email, inv.name, inv.role); toast(r.note); setInv({ name: "", email: "", role: "support" }); reload(); }); }}>
          <h2>Invite someone</h2>
          <div className="row"><label className="f">Name<input className="input" value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} /></label>
            <label className="f grow">Work email<input className="input" type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} /></label>
            <label className="f">Role<select className="input" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })}>{data.roles.filter((r) => r !== "owner").map((r) => <option key={r} value={r}>{label(r)}</option>)}</select></label></div>
          <button className="btn sm" style={{ alignSelf: "flex-start" }} disabled={busy || !inv.email.includes("@") || inv.name.trim().length < 2}>Send invite</button>
          <span className="small">They get an email, sign in, and must set up an authenticator before they see anything. Owners are made from an existing account by another owner.</span>
        </form>}
      </>}
      {tab === "roles" && <>
        {data.can_manage && <input className="input" aria-label="Permission change reason" placeholder="Reason for any change you make below (required)" value={pwhy} onChange={(e) => setPwhy(e.target.value)} />}
        <div className="card flush" style={{ overflowX: "auto" }}><table className="t"><thead><tr><th>Permission</th>{data.roles.map((r) => <th key={r}>{label(r)}</th>)}</tr></thead>
          <tbody>{data.permissions.map((p) => <tr key={p.key}><td>{p.label}<div className="small mono">{p.key}</div></td>
            {data.roles.map((r) => { const on = (data.matrix[r] ?? []).includes(p.key); const locked = r === "owner" || !data.can_manage || (!on && (p.key === "keys.manage" || p.key === "team.manage"));
              return <td key={r}><input type="checkbox" aria-label={`${label(r)}: ${p.label}`} checked={on} disabled={locked || busy || !pwhy.trim()}
                onChange={(e) => { const v = e.target.checked; run(async () => { await api().setRolePermission(r, p.key, v, pwhy); toast(`${label(r)}: ${p.label} ${v ? "on" : "off"}`); reload(); }); }} /></td>; })}</tr>)}</tbody></table></div>
        <span className="small">Owners always have everything. Keys and team management stay with owners. Every change needs a reason and is logged.</span>
      </>}
      {tab === "audit" && (me.perms.includes("audit.read") ? <Audit /> : <div className="note">Your role can&apos;t read the audit log.</div>)}
      {error && <p className="err" role="alert">{error}</p>}
    </Page>
  );
}
