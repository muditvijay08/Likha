"use client";
// I25 AI spend and limits. Every model call passes these caps first. Paid readings are never stopped by per-member caps.
import Link from "next/link";
import { useState } from "react";
import { useAction, useAdmin } from "@/components/shell";
import { SettingsForm } from "@/components/settings-form";
import { Kpi, NoteAction, Page, download, rupees, useLoad } from "@/components/ui";
import { api, type AiSpend } from "@/lib/api";

function LimitForm({ u, done }: { u: AiSpend["top_users"][number]; done(): void }) {
  const { toast } = useAdmin();
  const [open, setOpen] = useState(false); const [daily, setDaily] = useState(""); const [block, setBlock] = useState(false); const [why, setWhy] = useState("");
  const { busy, error, run } = useAction();
  if (!open) return <button type="button" className="btn ghost sm" onClick={() => setOpen(true)}>{u.limit ? "Change limit" : "Set limit"}</button>;
  return (
    <form className="stack" style={{ gap: 6 }} aria-label={`Limit for ${u.user}`} onSubmit={(e) => { e.preventDefault(); run(async () => {
        await api().setAiUserLimit(u.user_id, daily ? Math.round(Number(daily) * 100) : null, null, block, why); toast("Limit saved"); setOpen(false); done(); }); }}>
      <div className="row"><label className="f">₹ a day<input className="input" type="number" min={0} value={daily} onChange={(e) => setDaily(e.target.value)} style={{ width: 90 }} /></label>
        <label className="row small"><input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} />Block free AI</label></div>
      <input className="input" aria-label="Limit reason" placeholder="Reason (audit log)" value={why} onChange={(e) => setWhy(e.target.value)} />
      <div className="row"><button className="btn sm" disabled={busy || !why.trim()}>Save</button><button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button></div>
      {error && <p className="err" role="alert">{error}</p>}
    </form>
  );
}

export default function AiSpendPage() {
  const { toast } = useAdmin();
  const { data, reload } = useLoad(() => api().aiSpend());
  const act = useAction();
  if (!data) return <div className="skel" style={{ height: 400 }} />;
  const cfg = data.config as Record<string, number>; const pct = (a: number, b: number) => b ? Math.round((a / b) * 100) : 0;
  const total = data.by_feature.reduce((a, f) => a + f.paise, 0) || 1;
  const log = () => act.run(async () => { const rows = await api().aiCalls(1); const cols = ["at", "feature", "model", "user", "status", "input_tokens", "output_tokens", "cost_paise", "latency_ms", "error"];
    download(`likha-ai-calls-${new Date().toISOString().slice(0, 10)}.csv`, [cols.join(","), ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(","))].join("\n"), "text/csv"); });
  return (
    <Page title="AI spend and limits" sub="Every model call passes these caps first. Prompts and answers are never stored in the call log."
      actions={<div className="row"><button type="button" className="btn ghost" disabled={act.busy} onClick={log}>Download call log (24 h)</button>
        {data.can_edit && <NoteAction label={data.free_paused ? "Resume free AI" : "Pause free AI"} tone={data.free_paused ? "ghost" : "danger"} placeholder="Why?"
          onRun={(n) => api().pauseFreeAi(!data.free_paused, n)} done={() => { toast(data.free_paused ? "Free AI back on" : "Free AI paused. Paid readings still work."); reload(); }} />}</div>}>
      {data.free_paused && <div className="note warn">Free AI is paused: Saathi, Daily Kick writing and other free features are off. Paid readings still work.</div>}
      <div className="kpis">
        <Kpi k="Today" v={rupees(data.today_paise)} s={`of ${rupees(cfg.daily_cap_paise)} cap · ${pct(data.today_paise, cfg.daily_cap_paise)}%`} alert={pct(data.today_paise, cfg.daily_cap_paise) >= (cfg.alert_at_pct ?? 80)} />
        <Kpi k="This month" v={rupees(data.month_paise)} s={`of ${rupees(cfg.monthly_cap_paise)} · ${pct(data.month_paise, cfg.monthly_cap_paise)}%`} />
        <Kpi k="Calls today" v={data.calls_today.toLocaleString("en-IN")} s={data.calls_today ? `avg ${rupees(data.today_paise / data.calls_today)} a call` : ""} />
        <Kpi k="Stopped by caps" v={data.capped_today} s="free use only" /><Kpi k="Number check fails" v={data.check_fail_pct_7d === null ? "–" : `${data.check_fail_pct_7d}%`} s="rewritten once, then refunded" />
        <Kpi k="Refunded readings" v={data.refunded_today} s="today" /></div>
      <section className="card stack" aria-label="Spend today by feature"><h2>Spend today by feature</h2>
        {data.by_feature.length === 0 ? <span className="sub">No calls yet today.</span> : data.by_feature.map((f) => <div key={f.feature} className="stack" style={{ gap: 3 }}>
          <div className="row" style={{ justifyContent: "space-between" }}><span>{f.label}</span><span className="small">{rupees(f.paise)} · {f.calls.toLocaleString("en-IN")} calls</span></div>
          <div className="bar"><span style={{ width: `${(f.paise / total) * 100}%` }} /></div></div>)}
        <Link className="small" href="/ai">Change which model each feature uses →</Link></section>
      <div className="split">
        <SettingsForm title="Whole-app caps" canEdit={data.can_edit} onSaved={reload} fields={[
          { key: "ai", path: "daily_cap_paise", label: "Daily cap (all members)", unit: "rupees" }, { key: "ai", path: "monthly_cap_paise", label: "Monthly cap", unit: "rupees" },
          { key: "ai", path: "paid_overflow_pct", label: "Paid answers may go up to this % of the cap", unit: "pct" }, { key: "ai", path: "degrade_at_pct", label: "Switch to the cheaper model at", unit: "pct" },
          { key: "ai", path: "alert_at_pct", label: "Alert the team at", unit: "pct" }, { key: "ai", path: "usd_inr", label: "Dollar rate used for costs", unit: "usd" }]} />
        <SettingsForm title="Per-member caps for free use" canEdit={data.can_edit} onSaved={reload} fields={[
          { key: "ai", path: "user_daily_paise", label: "Free use per member per day", unit: "rupees" }, { key: "ai", path: "user_monthly_paise", label: "Free use per member per month", unit: "rupees" },
          { key: "ai", path: "paid_user_multiplier", label: "Paying members get this many times more", unit: "number" }]} />
      </div>
      <section className="card flush" aria-label="Top spenders"><div style={{ padding: "14px 16px 0" }}><h2>Top spenders · 7 days</h2></div>
        <table className="t"><thead><tr><th>Member</th><th>Calls</th><th>Cost</th><th>Stopped by cap</th><th>Paying</th><th>Limit</th></tr></thead>
          <tbody>{data.top_users.map((u) => <tr key={u.user_id}><td><Link href={`/users/${u.user_id}`}>{u.user}</Link></td><td>{u.calls.toLocaleString("en-IN")}</td><td>{rupees(u.paise)}</td>
            <td>{u.capped}</td><td>{u.paying ? "Yes" : "No"}</td>
            <td>{u.limit && <div className="small">{u.limit.blocked ? "Free AI blocked" : u.limit.daily !== null ? `${rupees(u.limit.daily)} a day` : ""} · {u.limit.reason}</div>}
              {data.can_edit && <LimitForm u={u} done={reload} />}</td></tr>)}</tbody></table>
        <p className="small" style={{ padding: "0 16px 12px" }}>Limits and blocks need a reason and are written to the audit log.</p></section>
      {act.error && <p className="err" role="alert">{act.error}</p>}
    </Page>
  );
}
