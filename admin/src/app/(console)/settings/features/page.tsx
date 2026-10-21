"use client";
// I11 Features, matching and safety. Switches decide what members see (Menu tiles and the screens themselves).
// Astrology rules that change every chart are locked here: they need a code release and the accuracy test set.
import { useEffect, useState } from "react";
import { useAction, useAdmin, when } from "@/components/shell";
import { SettingsForm } from "@/components/settings-form";
import { Page, label, useLoad } from "@/components/ui";
import { api, type Flag } from "@/lib/api";

function FlagRow({ f, cities, can, done }: { f: Flag; cities: string[]; can: boolean; done(): void }) {
  const { toast } = useAdmin();
  const [on, setOn] = useState(f.enabled); const [pct, setPct] = useState(f.rollout); const [cs, setCs] = useState(f.cities); const [note, setNote] = useState("");
  const act = useAction();
  useEffect(() => { setOn(f.enabled); setPct(f.rollout); setCs(f.cities); }, [f]);
  const dirty = on !== f.enabled || pct !== f.rollout || cs.join() !== f.cities.join();
  return (
    <tr>
      <td><strong>{f.label}</strong><div className="small mono">{f.key}</div>{f.by && <div className="small">{f.by} · {when(f.updated_at ?? null)}</div>}</td>
      <td><input type="checkbox" aria-label={`${f.label} on`} checked={on} disabled={!can} onChange={(e) => setOn(e.target.checked)} /></td>
      <td><span className="row" style={{ gap: 4, flexWrap: "nowrap" }}><input className="input" type="number" min={0} max={100} aria-label={`${f.label} rollout`} value={pct} disabled={!can}
        onChange={(e) => setPct(Number(e.target.value))} style={{ width: 70 }} />%</span></td>
      <td><div className="chips">{cities.map((c) => (
        <button key={c} type="button" className="chip" aria-pressed={cs.includes(c)} disabled={!can} style={cs.includes(c) ? { background: "var(--ink)", color: "#fff" } : undefined}
          onClick={() => setCs(cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c])}>{label(c)}</button>))}</div>
        <div className="small">{cs.length ? "Only these cities" : "All cities"}</div></td>
      <td style={{ minWidth: 200 }}>{dirty && can && <form className="stack" style={{ gap: 6 }} aria-label={`Save ${f.label}`} onSubmit={(e) => { e.preventDefault(); act.run(async () => {
          await api().saveFlag(f.key, on, pct, cs, note); setNote(""); toast(`${f.label} saved`); done(); }); }}>
        <input className="input" aria-label={`${f.label} note`} placeholder="Why?" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn sm" disabled={act.busy || note.trim().length < 3}>Save</button>{act.error && <p className="err" role="alert">{act.error}</p>}</form>}</td>
    </tr>
  );
}

const REASONS = ["under_18", "unsafe_meeting", "scam", "harassment", "fake_profile", "inappropriate_photos", "other"];

function ReportPriority({ can }: { can: boolean }) {
  const { toast } = useAdmin();
  const { data, reload } = useLoad(() => api().settings(["report_priority"]));
  const [v, setV] = useState<Record<string, { priority: string; target_hours: number }> | null>(null);
  const [note, setNote] = useState(""); const act = useAction();
  useEffect(() => { if (data) setV(data.report_priority.value as Record<string, { priority: string; target_hours: number }>); }, [data]);
  if (!data || !v) return <div className="skel" style={{ height: 200 }} />;
  const dirty = JSON.stringify(v) !== JSON.stringify(data.report_priority.value);
  return (
    <section className="card stack" aria-label="Report priority">
      <h2>Report priority and response targets</h2>
      <table className="t"><thead><tr><th>Report type</th><th>Priority</th><th>Answer within</th></tr></thead><tbody>
        {REASONS.map((r) => <tr key={r}><td>{label(r)}</td>
          <td><select className="input" aria-label={`${label(r)} priority`} value={v[r]?.priority ?? "normal"} disabled={!can || r === "under_18"}
            onChange={(e) => setV({ ...v, [r]: { ...v[r], priority: e.target.value } })}>{["urgent", "high", "normal", "low"].map((p) => <option key={p}>{p}</option>)}</select></td>
          <td><span className="row" style={{ gap: 4, flexWrap: "nowrap" }}><input className="input" type="number" min={1} aria-label={`${label(r)} hours`} value={v[r]?.target_hours ?? 24} disabled={!can}
            onChange={(e) => setV({ ...v, [r]: { ...v[r], target_hours: Number(e.target.value) } })} style={{ width: 70 }} />hours</span></td></tr>)}
      </tbody></table>
      <span className="small">Under-18 reports are always urgent. A report from someone who interacted with the profile also hides it at once.</span>
      {can && dirty && <div className="row"><input className="input grow" aria-label="Priority note" placeholder="Why?" value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className="btn sm" disabled={act.busy || note.trim().length < 3}
          onClick={() => act.run(async () => { await api().saveSettings({ report_priority: v }, note); setNote(""); toast("Report priorities published"); reload(); })}>Publish</button></div>}
      {act.error && <p className="err" role="alert">{act.error}</p>}
    </section>
  );
}

function TestMessage() {
  const [text, setText] = useState(""); const [early, setEarly] = useState(true);
  const [res, setRes] = useState<{ held: boolean; reason: string } | null>(null); const act = useAction();
  return (
    <section className="card stack" aria-label="Test a message">
      <h2>Test a message</h2>
      <p className="sub">Runs the same checks as chat: blocked phrases, and links or phone numbers early in a conversation.</p>
      <textarea className="input" aria-label="Message to test" style={{ minHeight: 70 }} value={text} onChange={(e) => { setText(e.target.value); setRes(null); }} placeholder="Type a message…" />
      <div className="row"><label className="row small"><input type="checkbox" checked={early} onChange={(e) => setEarly(e.target.checked)} />Early in the chat</label>
        <button type="button" className="btn sm" disabled={!text.trim() || act.busy} onClick={() => act.run(async () => setRes(await api().testMessage(text, early)))}>Test</button></div>
      {res && <div className={`note ${res.held ? "warn" : ""}`} role="status"><strong>{res.held ? "Held for review" : "Delivered"}</strong> · {res.reason}</div>}
    </section>
  );
}

export default function FeaturesPage() {
  const { me } = useAdmin();
  const can = me.perms.includes("settings.write");
  const flags = useLoad(() => api().flags());
  const cities = useLoad(() => api().cities());
  const slugs = (cities.data?.cities ?? []).filter((c) => c.status === "live" || c.status === "waitlist").map((c) => c.slug);
  return (
    <Page title="Features, matching and safety" sub="Switched-off features disappear from the Menu and their screens say “not available right now”. Matching, chat and payments are never switched off here.">
      <section className="card" style={{ padding: 0 }} aria-label="Feature switches">
        <div style={{ padding: "16px 16px 0" }}><h2>Feature switches</h2></div>
        {!flags.data ? <div className="skel" style={{ height: 200, margin: 16 }} /> :
          <table className="t"><thead><tr><th>Feature</th><th>On</th><th>Rollout</th><th>Cities</th><th /></tr></thead>
            <tbody>{flags.data.map((f) => <FlagRow key={f.key} f={f} cities={slugs} can={can} done={flags.reload} />)}</tbody></table>}
        <p className="small" style={{ padding: "0 16px 16px" }}>Rollout picks the same members each time (by account), so nobody flickers in and out.</p>
      </section>
      <div className="split">
        <SettingsForm title="Matching" canEdit={can} fields={[
          { key: "matching", path: "ayanamsa", label: "Ayanamsa", unit: "text", locked: true, hint: "Changes every chart. Needs a code release and the accuracy test set." },
          { key: "matching", path: "node", label: "Rahu/Ketu node", unit: "text", locked: true }, { key: "matching", path: "system", label: "Matching system", unit: "text", locked: true },
          { key: "matching", path: "rules_version", label: "Rules version", unit: "text", locked: true },
          { key: "matching", path: "borderline_minutes", label: "Birth time close to a sign change: ask to confirm within", unit: "minutes" },
          { key: "matching", path: "manglik_filter", label: "Manglik as a filter", unit: "bool", locked: true, hint: "Manglik is shown, never used to hide people." },
          { key: "likes_per_day", path: "woman", label: "Free likes a day · women", unit: "number" }, { key: "likes_per_day", path: "man", label: "Free likes a day · men", unit: "number" },
          { key: "reshow_passed_days", label: "Show passed profiles again after", unit: "days" }, { key: "hide_inactive_days", label: "Hide profiles inactive for", unit: "days" }]} />
        <SettingsForm title="Safety rules" canEdit={can} fields={[
          { key: "block_links_first_messages", label: "Hold links and phone numbers in the first", unit: "number", hint: "messages of a new chat" },
          { key: "blocked_phrases", label: "Blocked phrases", unit: "list", hint: "Messages with these are held for review. At least 3 letters each." },
          { key: "scam_hold_score", label: "Scam score that holds a message", unit: "number" },
          { key: "auto_suspend", path: "upheld_reports", label: "Auto-suspend after upheld reports", unit: "number" }, { key: "auto_suspend", path: "days", label: "Auto-suspend for", unit: "days" },
          { key: "tier_pause_days", label: "An upheld report pauses the tier for", unit: "days" }, { key: "appeal_window_days", label: "Members can appeal within", unit: "days" },
          { key: "date_checkin_alert_minutes", label: "Date check-in: alert the trusted contact after", unit: "minutes" }]} />
      </div>
      <div className="split"><ReportPriority can={can} /><TestMessage /></div>
    </Page>
  );
}
