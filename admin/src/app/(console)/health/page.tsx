"use client";
// I16 System health: measured from Likha's own records (calls, payments, jobs). Look here first when something breaks.
import { useState } from "react";
import { useAction, useAdmin } from "@/components/shell";
import { Kpi, Page, Status, ago, day, rupees, useLoad } from "@/components/ui";
import { api } from "@/lib/api";

const TONE: Record<string, string> = { up: "active", slow: "high", down: "failed", idle: "normal", off: "deleted" };
const WORD: Record<string, string> = { up: "Up", slow: "Slow", down: "Down", idle: "Quiet", off: "Not connected" };

export default function Health() {
  const { toast } = useAdmin();
  const { data, reload } = useLoad(() => api().health());
  const [t, setT] = useState(""); const [impact, setImpact] = useState(""); const [notes, setNotes] = useState<Record<string, string>>({});
  const { busy, error, run } = useAction();
  if (!data) return <div className="skel" style={{ height: 400 }} />;
  const bad = data.services.filter((s) => s.status === "down" || s.status === "slow");
  const ai = data.services.find((s) => s.key === "ai");
  const openInc = data.incidents.filter((i) => i.status !== "fixed");
  return (
    <Page title="System health" sub="Is everything working, and what is it costing? Measured from Likha's own records; outside providers aren't polled from here.">
      <div className="kpis"><Kpi k="App status" v={bad.some((s) => s.status === "down") ? "Problem" : bad.length ? "Mostly good" : "All good"} s={bad.length ? `${bad.map((s) => s.name.split(" (")[0]).join(", ")} ${bad.length > 1 ? "need" : "needs"} a look` : "nothing slow"} alert={bad.length > 0} />
        <Kpi k="AI spend today" v={rupees(ai?.spend_paise ?? 0)} s={`of ${rupees(data.ai_cap_paise)} cap`} /><Kpi k="Open incidents" v={openInc.length} alert={openInc.length > 0} /></div>
      <section className="card flush" aria-label="Services"><table className="t"><thead><tr><th>Service</th><th>Status</th><th>Last 24 h</th><th>Speed</th><th>Notes</th></tr></thead>
        <tbody>{data.services.map((s) => <tr key={s.key}><td><strong>{s.name}</strong>{s.mode && <div className="small">Razorpay {s.mode} mode</div>}</td><td><Status s={TONE[s.status]} text={WORD[s.status]} /></td>
          <td>{s.calls !== undefined ? <>{s.success_pct ?? "–"}% ok<div className="small">{s.calls.toLocaleString("en-IN")} {s.key === "kick" ? "Kicks" : "calls"}</div></> : s.size_mb !== undefined ? `${s.size_mb} MB` : "–"}</td>
          <td>{s.latency_ms ? `${(s.latency_ms / 1000).toFixed(1)} s` : "–"}</td><td className="small">{s.note ?? ""}{s.spend_paise ? ` ${rupees(s.spend_paise)} today` : ""}</td></tr>)}</tbody></table></section>
      <section className="card flush" aria-label="Scheduled jobs"><div style={{ padding: "14px 16px 0" }}><h2>Scheduled jobs</h2></div>
        {data.jobs === null ? <p className="sub" style={{ padding: 16 }}>Scheduled jobs show here once pg_cron is turned on in Supabase.</p> : <table className="t"><tbody>{data.jobs.map((j) => <tr key={j.job}>
          <td><strong>{j.job}</strong><div className="small mono">{j.schedule}</div></td><td className="small">{j.last_start ? `${ago(j.last_start)} ago` : "never"}</td>
          <td><Status s={j.last_status === "succeeded" ? "active" : j.last_status === "failed" ? "failed" : "normal"} text={j.last_status ?? "–"} /></td>
          <td className="small">{j.failed_24h ? `${j.failed_24h} failed in 24 h` : ""} {j.message ?? ""}</td></tr>)}</tbody></table>}</section>
      <section className="card stack" aria-label="Incidents"><h2>Incidents</h2>
        <form className="row" onSubmit={(e) => { e.preventDefault(); run(async () => { await api().saveIncident(null, t, impact, "open", ""); setT(""); setImpact(""); toast("Incident logged"); reload(); }); }}>
          <input className="input grow" aria-label="What happened" placeholder="What happened" value={t} onChange={(e) => setT(e.target.value)} />
          <input className="input grow" aria-label="Impact" placeholder="Impact on members" value={impact} onChange={(e) => setImpact(e.target.value)} />
          <button className="btn sm" disabled={busy || t.trim().length < 3}>Log incident</button></form>
        {data.incidents.map((i) => <div key={i.id} className="stack" style={{ gap: 6, borderTop: "1px solid var(--line-soft)", paddingTop: 10 }} aria-label={i.title}>
          <div className="row"><Status s={i.status === "fixed" ? "active" : i.status === "watching" ? "high" : "failed"} text={i.status === "fixed" ? "Fixed" : i.status === "watching" ? "Watching" : "Open"} />
            <strong className="grow">{i.title}</strong><span className="small">{day(i.started_at)} {new Date(i.started_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span></div>
          {i.impact && <span className="small">Impact: {i.impact}</span>}
          {i.notes.map((n, k) => <span key={k} className="small">· {n.by ?? ""} {ago(n.at)} ago: {n.note}</span>)}
          {i.status !== "fixed" && <div className="row"><input className="input grow" aria-label={`Update on ${i.title}`} placeholder="Update" value={notes[i.id] ?? ""} onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })} />
            {i.status === "open" && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => run(async () => { await api().saveIncident(i.id, "", "", "watching", notes[i.id] ?? ""); reload(); })}>Watching</button>}
            <button type="button" className="btn sm" disabled={busy} onClick={() => run(async () => { await api().saveIncident(i.id, "", "", "fixed", notes[i.id] ?? ""); toast("Marked fixed"); reload(); })}>Fixed</button></div>}
        </div>)}
        {error && <p className="err" role="alert">{error}</p>}</section>
    </Page>
  );
}
