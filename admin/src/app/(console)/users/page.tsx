"use client";
// I4 Users: find anyone by phone, #ID or name. Every open is logged.
import Link from "next/link";
import { useState } from "react";
import { useAction } from "@/components/shell";
import { Page, Status, day, label, useLoad } from "@/components/ui";
import { api, type TokenInfo } from "@/lib/api";

const FILTERS: [string, string][] = [["all", "All"], ["women", "Women"], ["men", "Men"], ["under_review", "Under review"], ["suspended", "Suspended"], ["banned", "Banned"]];

export default function Users() {
  const [q, setQ] = useState(""); const [query, setQuery] = useState(""); const [filter, setFilter] = useState("all");
  const { data, err } = useLoad(() => api().users(query, filter), [query, filter]);
  const [token, setToken] = useState(""); const [found, setFound] = useState<TokenInfo | null | undefined>(undefined);
  const { busy, run } = useAction();
  return (
    <Page title="Users" sub="Find anyone by phone, #ID or first name. Opening a profile is logged in the audit trail.">
      <form className="row" onSubmit={(e) => { e.preventDefault(); setQuery(q); }}>
        <input className="input grow" style={{ maxWidth: 420 }} aria-label="Search users" placeholder="+91 98290 41234, #A1B2C3 or Riya" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn">Search</button>{query && <button type="button" className="btn ghost" onClick={() => { setQ(""); setQuery(""); }}>Clear</button>}
      </form>
      {data && <div className="chips" role="group" aria-label="Filter">{FILTERS.map(([k, l]) => (
        <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} {data.counts[k as keyof typeof data.counts]}</button>))}</div>}
      {err && <div className="note warn">{err}</div>}
      {data && (data.rows.length === 0 ? <div className="card sub">No one matches that.</div> : (
        <div className="card flush"><table className="t">
          <thead><tr><th>ID</th><th>Name</th><th>City</th><th>Joined</th><th>Selfie</th><th>Tier</th><th>Credits</th><th>Reports</th><th>Status</th></tr></thead>
          <tbody>{data.rows.map((u) => (
            <tr key={u.id}><td className="mono"><Link href={`/users/${u.id}`}>{u.short_id}</Link></td><td><Link href={`/users/${u.id}`} style={{ color: "var(--ink)", fontWeight: 700 }}>{u.first_name}</Link>{u.age ? `, ${u.age}` : ""} <span className="small">{label(u.gender)}</span></td>
              <td>{u.city ?? "–"}</td><td>{day(u.joined)}</td><td><Status s={u.selfie} /></td><td>{u.tier === "none" ? "–" : label(u.tier)}</td><td>{u.credits}</td>
              <td>{u.reports || "–"}</td><td><Status s={u.status} />{u.paused && <span className="pill off">paused</span>}</td></tr>))}</tbody></table></div>))}
      <section className="card stack" aria-label="Crush and gift links">
        <h2>Find a Check With Anyone or gift link</h2>
        <span className="small">Paste the code from a likha.in/k/… or /g/… link someone forwarded to support.</span>
        <form className="row" onSubmit={(e) => { e.preventDefault(); run(async () => setFound(await api().lookupToken(token.replace(/^.*\/(k|g)\//, "")))); }}>
          <input className="input mono" aria-label="Link code" value={token} onChange={(e) => setToken(e.target.value)} placeholder="k7Qp2" /><button className="btn ghost" disabled={busy || !token.trim()}>Look up</button></form>
        {found === null && <span className="small">No link with that code.</span>}
        {found && <dl className="kv"><dt>Type</dt><dd>{found.type === "crush" ? "Check With Anyone" : `Gift (${found.kind})`}</dd>
          <dt>Sent by</dt><dd><Link href={`/users/${found.from_id}`}>{found.from}</Link></dd><dt>For</dt><dd>{found.to}</dd><dt>Created</dt><dd>{day(found.created)}</dd>
          <dt>Expires</dt><dd>{day(found.expires)}</dd>
          <dt>State</dt><dd>{found.type === "crush" ? (found.joined_id ? "Joined" : "Not joined yet") + (found.reading_status ? ` · reading ${label(found.reading_status)}` : "")
            : found.opened_id ? `Opened ${day(found.opened_at ?? null)}` : `Opens ${day(found.deliver_on ?? null)}`}</dd></dl>}
      </section>
    </Page>
  );
}
