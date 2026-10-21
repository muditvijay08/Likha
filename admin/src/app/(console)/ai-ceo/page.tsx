"use client";
// I2 AI CEO console: requests waiting for you, what each agent did on its own (with undo), and the emergency controls.
import Link from "next/link";
import { useAction, useAdmin, when } from "@/components/shell";
import { Kpi, NoteAction, Page, label, rupees, useLoad } from "@/components/ui";
import { api, type Approval } from "@/lib/api";

function ApprovalRow({ a, can, done }: { a: Approval; can: boolean; done(): void }) {
  const { toast } = useAdmin(); const act = useAction();
  const decide = (yes: boolean) => act.run(async () => { await api().decideApproval(a.id, yes); toast(yes ? "Approved" : "Declined"); done(); });
  return (
    <div className="row" style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 10 }} aria-label={a.title}>
      <span className="grow"><strong>{a.title}</strong>{a.amount_paise ? <span className="small"> · {rupees(a.amount_paise)}</span> : null}
        <div className="small">{label(a.agent)} · {when(a.at)}{a.status === "pending" ? ` · expires ${when(a.expires_at)}` : a.decided_by ? ` · ${a.decided_by}` : ""}</div>
        {a.detail && <div style={{ fontSize: 13 }}>{a.detail}</div>}</span>
      {a.status === "pending" && can ? <><button type="button" className="btn sm" disabled={act.busy} onClick={() => decide(true)}>Approve</button>
        <button type="button" className="btn ghost sm" disabled={act.busy} onClick={() => decide(false)}>Decline</button></>
        : <span className={`pill ${a.status === "approved" ? "ok" : a.status === "pending" ? "warn" : "off"}`}>{label(a.status)}</span>}
      {act.error && <p className="err" role="alert" style={{ width: "100%" }}>{act.error}</p>}
    </div>
  );
}

export default function AiCeoPage() {
  const { toast, me } = useAdmin();
  const { data, reload } = useLoad(() => api().aiCeo());
  if (!data) return <div className="skel" style={{ height: 400 }} />;
  const pending = data.approvals.filter((a) => a.status === "pending");
  const acting = data.agents.filter((a) => a.acting).length;
  return (
    <Page title="AI CEO" sub="Agents draft, check and act inside the rules you set. Anything outside them waits here for you. Every action is in the audit log."
      actions={data.can_decide && <div className="row">
        <NoteAction label={data.paused ? "Resume agents" : "Pause all agents"} tone={data.paused ? "ghost" : "danger"} placeholder="Why?"
          onRun={(n) => api().agentsControl(data.paused ? "resume" : "pause", n)} done={() => { toast(data.paused ? "Agents resumed" : "All agents paused"); reload(); }} />
        <NoteAction label="Make all read-only" placeholder="Why?" onRun={(n) => api().agentsControl("read_only", n)} done={() => { toast("Every agent is read-only"); reload(); }} /></div>}>
      <div className="note"><strong>Agents aren&apos;t running yet.</strong> The rules, approvals and undo here are live in the database, but the agent service that does the work isn&apos;t deployed. Until it is, these lists only fill with what agents are asked to do by Likha&apos;s own server jobs.</div>
      {data.paused && <div className="note warn" role="alert">All agents are paused. Nothing is drafted or done until you resume.</div>}
      <div className="kpis">
        <Kpi k="Waiting for you" v={pending.length} alert={pending.length > 0} s="expire after 24 hours" />
        <Kpi k="Agents that can act" v={`${acting} of ${data.agents.length}`} s="the rest only draft" />
        <Kpi k="Actions logged" v={data.actions.length} s="latest 50" />
        <Kpi k="Support refund limit" v={rupees(Number(data.agents.find((x) => x.key === "support")?.limits.refund_per_case_paise ?? 0))} s="a case, without asking you" />
      </div>
      <div className="split">
        <section className="card stack" aria-label="Waiting for approval">
          <h2>Waiting for approval</h2>
          {data.approvals.length === 0 ? <span className="sub">Nothing waiting.</span> : data.approvals.map((a) => <ApprovalRow key={a.id} a={a} can={data.can_decide} done={reload} />)}
        </section>
        <section className="card stack" aria-label="What agents did">
          <h2>What agents did on their own</h2>
          {data.actions.length === 0 ? <span className="sub">No agent actions yet.</span> : data.actions.map((x) => (
            <div key={x.id} className="row" style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 10 }}>
              <span className="grow"><strong>{label(x.action.replace("moderate:", "").replace("agent_", ""))}</strong>{x.after && "credits" in x.after ? ` · ${String(x.after.credits)} credits` : ""}
                <div className="small">{label(x.agent ?? "")} · {when(x.at)}{x.target ? ` · ${x.target}` : ""}</div>{x.reason && <div style={{ fontSize: 13 }}>{x.reason}</div>}</span>
              {x.undone ? <span className="pill off">Undone</span> : x.undoable && data.can_decide &&
                <NoteAction label="Undo" placeholder="Why are you undoing this?" onRun={(n) => api().undoAgentAction(x.id, n)} done={() => { toast("Undone"); reload(); }} />}
            </div>))}
        </section>
      </div>
      <div className="row">{me.perms.includes("ai.approve") && <Link className="btn ghost" href="/ai-ceo/rules">Agent rules and limits</Link>}
        <Link className="small" href="/settings/comms">AI emergency stop for member features →</Link></div>
    </Page>
  );
}
