"use client";
// I15 Fraud and abuse: linked accounts, held scam messages, invite farming, refund patterns, copied bios. Found hourly; decided by a person.
import Link from "next/link";
import { useState } from "react";
import { useAction, useAdmin } from "@/components/shell";
import { Kpi, Page, Status, ago, day, label, useLoad } from "@/components/ui";
import { api, type FraudCase } from "@/lib/api";

const ACTIONS: ["ban_all" | "keep_oldest" | "remove_bonuses" | "not_fraud", string, string][] = [
  ["keep_oldest", "Keep oldest, ban the rest", "ghost"], ["remove_bonuses", "Remove extra bonuses", "ghost"], ["ban_all", "Ban all", "danger"], ["not_fraud", "Not fraud", "ghost"]];

function Case({ c, done }: { c: FraudCase; done(): void }) {
  const { toast } = useAdmin();
  const [why, setWhy] = useState("");
  const { busy, error, run } = useAction();
  const open = c.status === "open" || c.status === "in_progress";
  return (
    <section className="card stack" style={{ gap: 10 }} aria-label={c.pattern}>
      <div className="row"><Status s={c.risk === "normal" ? "high" : c.risk} text={label(c.risk === "normal" ? "medium" : c.risk)} /><h2 className="grow">{c.pattern}</h2><span className="small">{ago(c.at)} ago</span></div>
      <div className="small">{Object.entries(c.evidence).map(([k, v]) => `${label(k)}: ${String(v)}`).join(" · ")}</div>
      <table className="t"><tbody>{c.accounts.map((a) => <tr key={a.id}><td className="mono"><Link href={`/users/${a.id}`}>{a.short_id}</Link></td><td>{a.name}</td><td className="small">joined {day(a.joined)}</td>
        <td><Status s={a.status} /></td><td className="small">{a.bonus ? "got welcome bonus" : "no bonus"}</td></tr>)}</tbody></table>
      {open ? <>
        <input className="input" aria-label="Decision reason" placeholder="Reason (audit log; bans can be appealed once)" value={why} onChange={(e) => setWhy(e.target.value)} />
        <div className="row" style={{ gap: 6 }}>{ACTIONS.filter(([a]) => c.accounts.length > 1 || (a !== "keep_oldest" && a !== "remove_bonuses")).map(([a, l, tone]) =>
          <button key={a} type="button" className={`btn ${tone} sm`} disabled={busy || !why.trim()} onClick={() => run(async () => { await api().decideFraud(c.id, a, why); toast(`${l}: done`); done(); })}>{l}</button>)}</div>
      </> : <span className="small">Decided{c.decided_by ? ` by ${c.decided_by}` : ""}: {c.decision}</span>}
      {error && <p className="err" role="alert">{error}</p>}
    </section>
  );
}

export default function FraudPage() {
  const { toast } = useAdmin();
  const { data, reload } = useLoad(() => api().fraud());
  const [showClosed, setShowClosed] = useState(false);
  const scan = useAction();
  if (!data) return <div className="skel" style={{ height: 400 }} />;
  const k = data.kpis; const r = data.rules as Record<string, Record<string, number> | number>;
  const cases = data.cases.filter((c) => showClosed || c.status === "open" || c.status === "in_progress");
  return (
    <Page title="Fraud and abuse" sub="Linked accounts, bonus abuse, scams and refund patterns, found automatically every hour. A person decides."
      actions={<button type="button" className="btn ghost" disabled={scan.busy} onClick={() => scan.run(async () => { const n = await api().scanFraud(); toast(n ? `${n} new case${n > 1 ? "s" : ""}` : "Nothing new found"); reload(); })}>Scan now</button>}>
      <div className="kpis"><Kpi k="Open cases" v={k.open} s={`${k.high} high`} alert={k.high > 0} /><Kpi k="Bonuses held" v={k.bonuses_held} s="waiting for a decision" />
        <Kpi k="Linked groups" v={k.linked_groups} s="same face or device" /><Kpi k="Banned today" v={k.banned_today} /></div>
      <label className="row small"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />Show decided cases (30 days)</label>
      {cases.length === 0 ? <div className="card sub">No open cases.</div> : <div className="stack" style={{ gap: 12 }}>{cases.map((c) => <Case key={c.id} c={c} done={reload} />)}</div>}
      <section className="card stack" aria-label="Automatic rules"><h2>Automatic rules</h2>
        {[["Same face across accounts", "Hold the welcome bonus, open a case"], ["Same device, second account", "No second bonus, open a case"],
          ["Money or contact asks in early messages", `Hold the message, warn the sender (first ${r.block_links_first_messages ?? 10} messages)`],
          ["Reported several times", typeof r.auto_suspend === "object" ? `Auto-suspend after ${r.auto_suspend.reports ?? "3"} upheld reports for ${r.auto_suspend.days ?? "7"} days` : "Auto-suspend after upheld reports"],
          ["Invites", typeof r.invite_rewards === "object" ? `At most ${r.invite_rewards.max_per_month} rewarded invites a month; same-device invites open a case` : "Capped per month"],
          ["Refunds", "3 or more in 30 days opens a case"]].map(([a, b]) => <div key={a} className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line-soft)", paddingTop: 6 }}><span>{a}</span><span className="small">{b}</span></div>)}
        <span className="small">Thresholds are changed in Settings (batch C). Every decision needs a reason and is logged.</span></section>
      {scan.error && <p className="err" role="alert">{scan.error}</p>}
    </Page>
  );
}
