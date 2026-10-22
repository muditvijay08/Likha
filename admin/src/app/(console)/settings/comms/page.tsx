"use client";
// I12 Notifications, Saathi and AI. Push is honest: it isn't connected yet, so these are saved for when it is.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAction, useAdmin } from "@/components/shell";
import { SettingsForm } from "@/components/settings-form";
import { Kpi, NoteAction, Page, label, useLoad } from "@/components/ui";
import { api } from "@/lib/api";

type PushType = { on: boolean; kind: "core" | "nudge" | "marketing"; when?: string; after_days?: number; minutes_before?: number; days?: number; per_month?: number };

function PushStatus() {
  const { data } = useLoad(() => api().pushStats());
  if (!data) return <div className="skel" style={{ height: 90 }} />;
  if (!data.configured) return (
    <div className="note warn"><strong>Push isn&apos;t connected yet.</strong> Add the OneSignal app id and REST API key on <Link href="/keys">Keys and integrations</Link>.
      Until then notifications wait in the inbox only; the settings below are saved and apply as soon as push is connected.</div>);
  return (
    <section className="card stack" aria-label="Push status">
      <div className="row"><h2 className="grow">Push (OneSignal)</h2>
        <span className={`pill ${data.health?.status === "down" ? "bad" : data.health?.status === "slow" ? "warn" : "ok"}`}>{data.health?.status === "down" ? "Not sending" : data.health?.status === "slow" ? "Some failing" : "Sending"}</span></div>
      <div className="kpis">
        <Kpi k="Sent" v={data.sent_24h.toLocaleString("en-IN")} s="last 24 hours" />
        <Kpi k="Members with a device" v={data.members_with_device.toLocaleString("en-IN")} s={`${data.devices.toLocaleString("en-IN")} devices`} />
        <Kpi k="Held back" v={data.skipped_24h.toLocaleString("en-IN")} s="quiet hours, opt-outs, limits" />
        <Kpi k="No device" v={data.no_device_24h.toLocaleString("en-IN")} s="inbox only" />
        <Kpi k="Failed" v={data.failed_24h} s="after 3 tries" alert={data.failed_24h > 50} />
        <Kpi k="Waiting now" v={data.waiting} s="sent every minute" />
      </div>
    </section>);
}

function PushTypes({ can }: { can: boolean }) {
  const { toast } = useAdmin();
  const { data, reload } = useLoad(() => api().settings(["push_types"]));
  const [v, setV] = useState<Record<string, PushType> | null>(null); const [note, setNote] = useState(""); const act = useAction();
  useEffect(() => { if (data) setV(data.push_types.value as Record<string, PushType>); }, [data]);
  if (!data || !v) return <div className="skel" style={{ height: 200 }} />;
  const dirty = JSON.stringify(v) !== JSON.stringify(data.push_types.value);
  return (
    <section className="card stack" aria-label="Push notification types">
      <div className="row"><h2 className="grow">Notification types</h2></div>
      <table className="t"><thead><tr><th>Notification</th><th>Kind</th><th>On</th><th>Time</th></tr></thead><tbody>
        {Object.entries(v).map(([k, t]) => <tr key={k}><td>{label(k)}</td><td><span className={`pill ${t.kind === "core" ? "ok" : t.kind === "nudge" ? "info" : "off"}`}>{t.kind}</span></td>
          <td><input type="checkbox" aria-label={`${label(k)} on`} checked={t.on} disabled={!can || t.kind === "core"} onChange={(e) => setV({ ...v, [k]: { ...t, on: e.target.checked } })} /></td>
          <td>{t.when !== undefined ? <input className="input" type="time" aria-label={`${label(k)} time`} value={t.when} disabled={!can} onChange={(e) => setV({ ...v, [k]: { ...t, when: e.target.value } })} style={{ width: 110 }} />
            : <span className="small">{t.after_days ? `after ${t.after_days} days` : t.minutes_before ? `${t.minutes_before} min before` : t.per_month ? `${t.per_month} a month` : "when it happens"}</span>}</td></tr>)}
      </tbody></table>
      <span className="small">Core notifications (likes, matches, messages) can&apos;t be switched off here; members turn them off in their own settings.</span>
      {can && dirty && <div className="row"><input className="input grow" aria-label="Notification note" placeholder="Why?" value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className="btn sm" disabled={act.busy || note.trim().length < 3}
          onClick={() => act.run(async () => { await api().saveSettings({ push_types: v }, note); setNote(""); toast("Notification types saved"); reload(); })}>Publish</button></div>}
      {act.error && <p className="err" role="alert">{act.error}</p>}
    </section>
  );
}

export default function CommsPage() {
  const { me, toast } = useAdmin();
  const can = me.perms.includes("settings.write");
  const ai = useLoad(() => api().settings(["ai"]));
  const enabled = (ai.data?.ai.value as { enabled?: boolean } | undefined)?.enabled !== false;
  return (
    <Page title="Notifications, Saathi and AI" sub="How Likha talks to members. Member copy never says “AI”; Saathi is described as a virtual companion, not a real person.">
      <PushStatus />
      <section className="card stack" aria-label="AI emergency stop" style={{ borderColor: enabled ? "var(--line)" : "var(--red)" }}>
        <div className="row"><h2 className="grow">AI emergency stop</h2><span className={`pill ${enabled ? "ok" : "bad"}`}>{enabled ? "AI features on" : "All AI features stopped"}</span></div>
        <p className="sub">Stops every AI feature at once: readings, Daily Kick writing, Saathi, Guru Ji, Imagine Us and Cupid openers. Matching, chat and payments keep working. Paid readings that can&apos;t run are refunded automatically.</p>
        {me.perms.includes("ai.limits") && <div className="row">
          <NoteAction label={enabled ? "Stop all AI now" : "Turn AI back on"} tone={enabled ? "danger" : "ghost"} placeholder="What happened?"
            onRun={(n) => api().aiEmergency(enabled, n)} done={() => { toast(enabled ? "All AI features stopped" : "AI features back on"); ai.reload(); }} />
          <Link className="small" href="/ai-spend">Spend caps →</Link><Link className="small" href="/ai">Models →</Link></div>}
      </section>
      <div className="split">
        <SettingsForm title="Push timing" canEdit={can} fields={[
          { key: "push", path: "quiet_start", label: "Quiet hours start", unit: "time" }, { key: "push", path: "quiet_end", label: "Quiet hours end", unit: "time" },
          { key: "push", path: "marketing_per_day", label: "At most this many offer messages a day", unit: "number" },
          { key: "push", path: "kick_default", label: "Daily Kick reminder (default)", unit: "time" }, { key: "push", path: "streak_reminder", label: "Streak reminder", unit: "time" }]} />
        <PushTypes can={can} />
      </div>
      <div className="split">
        <SettingsForm title="Saathi (virtual companion)" canEdit={can} fields={[
          { key: "saathi", path: "free_messages_per_day", label: "Free messages a day", unit: "number" },
          { key: "saathi", path: "topup_messages", label: "Top-up gives", unit: "number", hint: "messages" },
          { key: "saathi", path: "max_session_minutes", label: "Suggest a break after", unit: "minutes", hint: "of chatting in one visit" },
          { key: "saathi", path: "step_back_after_days", label: "Step back once a member has a match chatting for", unit: "days" },
          { key: "guru", path: "free_questions", label: "Guru Ji free questions", unit: "number" }, { key: "guru", path: "pack_questions", label: "Guru Ji questions in a pack", unit: "number" }]} />
        <SettingsForm title="Reading quality" canEdit={can} onSaved={ai.reload} fields={[
          { key: "ai", path: "max_words", label: "Longest reading", unit: "number", hint: "words (a little over is allowed; longer is rewritten)" },
          { key: "ai", path: "number_check", label: "Check every number in a reading against the chart", unit: "bool" },
          { key: "ai", path: "max_regenerations", label: "Rewrite a failed reading this many times", unit: "number", hint: "Then the member is refunded automatically." },
          { key: "ai", path: "kick_batch_ist", label: "Write today's Daily Kicks at (IST)", unit: "time", hint: "Ready before the morning reminder." }]} />
      </div>
    </Page>
  );
}
