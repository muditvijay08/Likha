"use client";
// I19 Content: Home banner, Daily Kick writing templates, feature of the day, profile prompts, interests and app text.
// Member-facing text is checked: no promises, no doom, never "AI".
import { useState } from "react";
import { useAction, useAdmin, when } from "@/components/shell";
import { Page, day, download, label, useLoad } from "@/components/ui";
import { api, type AppString, type Content, type KickTemplate, type ScheduleRow } from "@/lib/api";

type Tab = "banner" | "kick" | "schedule" | "prompts" | "strings";

function Save({ name, onSave, disabled }: { name: string; onSave(note: string): Promise<void>; disabled?: boolean }) {
  const [note, setNote] = useState(""); const act = useAction();
  return (
    <form className="row" aria-label={`Save ${name}`} onSubmit={(e) => { e.preventDefault(); act.run(async () => { await onSave(note.trim()); setNote(""); }); }}>
      <input className="input grow" aria-label={`${name} note`} placeholder="Why? (goes in the audit log)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn sm" disabled={disabled || act.busy || note.trim().length < 3}>Save</button>
      {act.error && <p className="err" role="alert" style={{ width: "100%" }}>{act.error}</p>}
    </form>
  );
}

function Banner({ c, can, done }: { c: Content; can: boolean; done(): void }) {
  const { toast } = useAdmin();
  const cities = useLoad(() => api().cities());
  const [text, setText] = useState(""); const [link, setLink] = useState("/store"); const [cs, setCs] = useState<string[]>([]); const [days, setDays] = useState(7);
  const live = (cities.data?.cities ?? []).filter((x) => x.status !== "locked").map((x) => x.slug);
  return (
    <div className="split">
      {can && <section className="card stack" aria-label="New Home banner">
        <h2>New Home banner</h2>
        <p className="sub">One line at the top of Home. Members can close it. Only real news and offers.</p>
        <label className="f">Text<input className="input" value={text} maxLength={90} onChange={(e) => setText(e.target.value)} placeholder="Diwali: 20% more credits on every pack" /></label>
        <label className="f">Opens<input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="/store" /></label>
        <div className="stack" style={{ gap: 4 }}><span className="small">Cities (none = everyone)</span><div className="chips">{live.map((x) => (
          <button key={x} type="button" className="chip" aria-pressed={cs.includes(x)} style={cs.includes(x) ? { background: "var(--ink)", color: "#fff" } : undefined}
            onClick={() => setCs(cs.includes(x) ? cs.filter((y) => y !== x) : [...cs, x])}>{label(x)}</button>))}</div></div>
        <label className="f">Show for<span className="row" style={{ gap: 6 }}><input className="input" type="number" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 80 }} />days</span></label>
        <div className="note" aria-label="Banner preview" style={{ background: "#FFF3D6" }}><strong>Preview:</strong> {text || "…"}</div>
        <Save name="banner" disabled={text.trim().length < 5} onSave={async (n) => {
          await api().saveContent("announcement", { text, link, cities: cs, ends_at: new Date(Date.now() + days * 864e5).toISOString() }, n);
          setText(""); toast("Banner is live"); done(); }} />
      </section>}
      <section className="card stack" aria-label="Banners">
        <h2>Banners</h2>
        {c.announcements.length === 0 ? <span className="sub">No banners yet.</span> : c.announcements.map((a) => {
          const on = a.active && new Date(a.ends_at) > new Date();
          return <div key={a.id} className="row" style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 8 }}>
            <span className="grow">{a.text}<div className="small">{a.link ?? "no link"} · {a.city_slugs.length ? a.city_slugs.map(label).join(", ") : "All cities"} · {day(a.starts_at)} to {day(a.ends_at)}</div></span>
            <span className={`pill ${on ? "ok" : "off"}`}>{on ? "Live" : "Off"}</span>
            {can && on && <button type="button" className="btn ghost sm" onClick={() => api().saveContent("announcement", { id: a.id, active: false }, "Taken down").then(() => { toast("Banner taken down"); done(); }).catch((e: Error) => toast(e.message))}>Take down</button>}
          </div>; })}
      </section>
    </div>
  );
}

function KickRow({ t, can, done }: { t: KickTemplate; can: boolean; done(): void }) {
  const { toast } = useAdmin();
  const [tpl, setTpl] = useState(t.template); const [tone, setTone] = useState(t.tone); const [on, setOn] = useState(t.active);
  return (
    <section className="card stack" aria-label={t.label}>
      <div className="row"><h2 className="grow">{t.label}</h2><span className="small">{t.used_for}</span>
        <label className="row small"><input type="checkbox" checked={on} disabled={!can} onChange={(e) => setOn(e.target.checked)} />In use</label></div>
      <label className="f">Tone<input className="input" value={tone} disabled={!can} onChange={(e) => setTone(e.target.value)} /></label>
      <label className="f">Instructions for the writer<textarea className="input" style={{ minHeight: 110 }} value={tpl} disabled={!can} onChange={(e) => setTpl(e.target.value)} /></label>
      <span className="small">Chart facts are filled in by Likha&apos;s own engine; the writer only words them. Changes apply from the next morning batch.</span>
      {can && (tpl !== t.template || tone !== t.tone || on !== t.active) &&
        <Save name={t.label} onSave={async (n) => { await api().saveContent("kick_template", { key: t.key, template: tpl, tone, active: on }, n); toast("Template saved"); done(); }} />}
    </section>
  );
}

function ScheduleEdit({ r, can, done }: { r: ScheduleRow; can: boolean; done(): void }) {
  const { toast } = useAdmin();
  const [title, setTitle] = useState(r.title); const [body, setBody] = useState(r.body); const [cr, setCr] = useState(r.reward_credits); const [on, setOn] = useState(r.active);
  const dirty = title !== r.title || body !== r.body || cr !== r.reward_credits || on !== r.active;
  return (
    <tr><td className="small">{r.trigger.replace("day:", "Day ")}</td>
      <td><input className="input" aria-label={`Title ${r.sort}`} value={title} disabled={!can} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%" }} />
        <input className="input" aria-label={`Text ${r.sort}`} value={body} disabled={!can} onChange={(e) => setBody(e.target.value)} style={{ width: "100%", marginTop: 4 }} />
        <div className="small mono">{r.link}</div>
        {can && dirty && <Save name={`row ${r.sort}`} onSave={async (n) => { await api().saveContent("schedule", { sort: r.sort, title, body, reward_credits: cr, active: on }, n); toast("Saved"); done(); }} />}</td>
      <td><input className="input" type="number" min={0} aria-label={`Reward ${r.sort}`} value={cr} disabled={!can} onChange={(e) => setCr(Number(e.target.value))} style={{ width: 70 }} /></td>
      <td><input type="checkbox" aria-label={`On ${r.sort}`} checked={on} disabled={!can} onChange={(e) => setOn(e.target.checked)} /></td></tr>
  );
}

function Prompts({ c, can, done }: { c: Content; can: boolean; done(): void }) {
  const { toast } = useAdmin();
  const [p, setP] = useState(""); const [interest, setInterest] = useState("");
  return (
    <div className="split">
      <section className="card stack" aria-label="Profile prompts">
        <h2>Profile prompts</h2>
        <p className="sub">The wording members see on profiles. Onboarding always asks the first two; the rest can be added later.</p>
        {c.prompts.map((x) => <div key={x.key} className="row" style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 8 }}>
          <span className="grow">{x.label}<div className="small mono">{x.key}</div></span><span className={`pill ${x.active ? "ok" : "off"}`}>{x.active ? "On" : "Off"}</span></div>)}
        {can && <div className="stack" style={{ gap: 6 }}><input className="input" aria-label="New prompt" placeholder="New prompt, e.g. My favourite Diwali memory…" value={p} onChange={(e) => setP(e.target.value)} />
          <Save name="prompt" disabled={p.trim().length < 5} onSave={async (n) => {
            await api().saveContent("prompt", { key: p.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40), label: p.trim(), sort: c.prompts.length + 1 }, n);
            setP(""); toast("Prompt added"); done(); }} /></div>}
      </section>
      <section className="card stack" aria-label="Interests">
        <h2>Interests</h2>
        <div className="chips">{c.interests.map((i) => <span key={i.slug} className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{i.label}
          {can && <button type="button" aria-label={`Remove ${i.label}`} style={{ background: "none", border: 0, cursor: "pointer" }}
            onClick={() => api().saveContent("interest", { slug: i.slug, delete: true }, "Removed").then(() => { toast(`${i.label} removed`); done(); }).catch((e: Error) => toast(e.message))}>×</button>}</span>)}</div>
        {can && <div className="stack" style={{ gap: 6 }}><input className="input" aria-label="New interest" placeholder="New interest" value={interest} onChange={(e) => setInterest(e.target.value)} />
          <Save name="interest" disabled={interest.trim().length < 2} onSave={async (n) => { await api().saveContent("interest", { label: interest }, n); setInterest(""); toast("Interest added"); done(); }} /></div>}
      </section>
    </div>
  );
}

function Strings({ c, can }: { c: Content; can: boolean }) {
  const { toast } = useAdmin();
  const [q, setQ] = useState(""); const [missing, setMissing] = useState(false);
  const rows = useLoad(() => api().strings(q, missing), [q, missing]);
  const [edit, setEdit] = useState<AppString | null>(null);
  const importFile = async (f: File) => {
    const map = JSON.parse(await f.text()) as Record<string, { en: string; hi?: string }>;
    const n = await api().saveStrings(map, `Imported ${f.name}`); toast(`Imported ${n} strings`); rows.reload();
  };
  return (
    <section className="card stack" aria-label="App text">
      <div className="row"><h2 className="grow">App text</h2><span className="pill warn">Not used by the app yet</span></div>
      <div className="note">The app&apos;s words are still in the app code. This list is ready for when the app reads text from here (and for Hindi). Hindi done: {c.strings.hindi_done} of {c.strings.total}.</div>
      <div className="row"><input className="input grow" aria-label="Search text" placeholder="Search key or English" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="row small"><input type="checkbox" checked={missing} onChange={(e) => setMissing(e.target.checked)} />Missing Hindi</label>
        <button type="button" className="btn ghost sm" onClick={async () => { const all = await api().strings("", false);
          download("likha-strings.json", JSON.stringify(Object.fromEntries(all.map((s) => [s.key, { en: s.en, hi: s.hi }])), null, 2)); }}>Export JSON</button>
        {can && <label className="btn ghost sm" style={{ display: "inline-flex", alignItems: "center" }}>Import JSON<input type="file" accept="application/json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f).catch((x: Error) => toast(x.message)); }} /></label>}</div>
      <table className="t"><thead><tr><th>Key</th><th>English</th><th>Hindi</th><th /></tr></thead><tbody>
        {(rows.data ?? []).map((s) => <tr key={s.key}><td className="mono">{s.key}</td><td>{s.en}</td><td>{s.hi ?? <span className="pill warn">missing</span>}</td>
          <td>{can && <button type="button" className="btn ghost sm" onClick={() => setEdit(s)}>Edit</button>}</td></tr>)}
      </tbody></table>
      {edit && <div className="card stack" aria-label={`Edit ${edit.key}`}>
        <strong className="mono">{edit.key}</strong>
        <label className="f">English<input className="input" value={edit.en} onChange={(e) => setEdit({ ...edit, en: e.target.value })} /></label>
        <label className="f">Hindi<input className="input" value={edit.hi ?? ""} onChange={(e) => setEdit({ ...edit, hi: e.target.value })} /></label>
        <Save name="text" onSave={async (n) => { await api().saveStrings({ [edit.key]: { en: edit.en, hi: edit.hi } }, n); setEdit(null); toast("Text saved"); rows.reload(); }} />
      </div>}
    </section>
  );
}

export default function ContentPage() {
  const { data, reload } = useLoad(() => api().content());
  const [tab, setTab] = useState<Tab>("banner");
  if (!data) return <div className="skel" style={{ height: 400 }} />;
  const can = data.can_edit;
  return (
    <Page title="Content" sub="What members read. No guarantees, no doom, never “AI”. Every change is in the audit log.">
      <div className="tabs" role="tablist">{([["banner", "Home banner"], ["kick", "Daily Kick templates"], ["schedule", "Feature of the day"], ["prompts", "Prompts and interests"], ["strings", "App text"]] as const)
        .map(([t, l]) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{l}</button>)}</div>
      {tab === "banner" && <Banner c={data} can={can} done={reload} />}
      {tab === "kick" && <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))" }}>{data.kick_templates.map((t) => <KickRow key={t.key + (t.updated_at ?? "")} t={t} can={can} done={reload} />)}</div>}
      {tab === "schedule" && <section className="card" style={{ padding: 0 }} aria-label="Feature of the day">
        <p className="sub" style={{ padding: 16 }}>New members get one feature to try each day for their first days, with a small credit reward the first time they try it.</p>
        <table className="t"><thead><tr><th>When</th><th>Card</th><th>Reward</th><th>On</th></tr></thead>
          <tbody>{data.schedule.map((r) => <ScheduleEdit key={r.sort + r.title + r.reward_credits} r={r} can={can} done={reload} />)}</tbody></table></section>}
      {tab === "prompts" && <Prompts c={data} can={can} done={reload} />}
      {tab === "strings" && <Strings c={data} can={can} />}
      <span className="small">Last loaded {when(new Date().toISOString())}.</span>
    </Page>
  );
}
