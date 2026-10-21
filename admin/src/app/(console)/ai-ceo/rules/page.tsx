"use client";
// I23 AI CEO rules. What each agent may do alone, what needs you, and what it may never do (that list can only grow).
import { useState } from "react";
import { useAction, useAdmin, when } from "@/components/shell";
import { Page, useLoad } from "@/components/ui";
import { api, type Agent } from "@/lib/api";

const READ_ONLY = ["ceo", "investor", "engineering"];
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

function AgentCard({ a, can, done }: { a: Agent; can: boolean; done(): void }) {
  const { toast } = useAdmin();
  const [acting, setActing] = useState(a.acting); const [canDo, setCanDo] = useState(a.can_do.join("\n")); const [needs, setNeeds] = useState(a.needs_approval.join("\n"));
  const [never, setNever] = useState(a.never.join("\n")); const [limits, setLimits] = useState<Record<string, number>>(a.limits); const [note, setNote] = useState("");
  const act = useAction();
  const dirty = acting !== a.acting || canDo !== a.can_do.join("\n") || needs !== a.needs_approval.join("\n") || never !== a.never.join("\n") || JSON.stringify(limits) !== JSON.stringify(a.limits);
  const locked = READ_ONLY.includes(a.key);
  return (
    <section className="card stack" aria-label={a.label}>
      <div className="row"><h2 className="grow">{a.label}</h2>
        {locked ? <span className="pill off">Read-only always</span> : <label className="row small"><input type="checkbox" checked={acting} disabled={!can} onChange={(e) => setActing(e.target.checked)} />Can act alone</label>}</div>
      <span className="small">{a.last_action ? `Last action ${when(a.last_action)}` : "No actions yet"}</span>
      <label className="f">Does alone (one per line)<textarea className="input" style={{ minHeight: 60 }} value={canDo} disabled={!can} onChange={(e) => setCanDo(e.target.value)} /></label>
      <label className="f">Asks you first<textarea className="input" style={{ minHeight: 50 }} value={needs} disabled={!can} onChange={(e) => setNeeds(e.target.value)} /></label>
      <label className="f">Never allowed (can only grow)<textarea className="input" style={{ minHeight: 50 }} value={never} disabled={!can} onChange={(e) => setNever(e.target.value)} /></label>
      {Object.keys(limits).length > 0 && <div className="row">{Object.entries(limits).map(([k, v]) => (
        <label key={k} className="f">{k.replace(/_paise$/, "").replace(/_/g, " ")} (₹)<input className="input" type="number" min={0} value={v / 100} disabled={!can} style={{ width: 110 }}
          onChange={(e) => setLimits({ ...limits, [k]: Math.round(Number(e.target.value) * 100) })} /></label>))}</div>}
      {can && dirty && <form className="row" aria-label={`Save ${a.label}`} onSubmit={(e) => { e.preventDefault(); act.run(async () => {
          await api().saveAgent(a.key, acting, lines(canDo), lines(needs), lines(never), limits, note); setNote(""); toast(`${a.label} rules saved`); done(); }); }}>
        <input className="input grow" aria-label={`${a.label} note`} placeholder="Why?" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn sm" disabled={act.busy || note.trim().length < 3}>Save rules</button></form>}
      {act.error && <p className="err" role="alert">{act.error}</p>}
    </section>
  );
}

export default function AgentRulesPage() {
  const { me } = useAdmin();
  const { data, reload } = useLoad(() => api().aiCeo());
  const can = me.perms.includes("ai.approve");
  if (!data) return <div className="skel" style={{ height: 400 }} />;
  return (
    <Page title="AI CEO rules" sub="Hard limits the agents can't change. Money to a bank, bans, deleting data and touching keys always need a person.">
      {!can && <div className="note">Read only. Changing agent rules needs “Approve AI CEO requests”.</div>}
      <div className="note">Each agent&apos;s own limits (below) are what the database enforces. A refund above an agent&apos;s limit becomes a request on the AI CEO page; no agent can refund more than ₹500 a case alone.</div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
        {data.agents.map((a) => <AgentCard key={a.key + a.acting + a.never.length + JSON.stringify(a.limits)} a={a} can={can} done={reload} />)}</div>
    </Page>
  );
}
