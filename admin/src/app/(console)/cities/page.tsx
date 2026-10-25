"use client";
// I7 Cities and waitlist: open a city only when the feed will feel full (members, women share, complete profiles).
import { useState } from "react";
import { useAction, useAdmin } from "@/components/shell";
import { SettingsForm } from "@/components/settings-form";
import { Kpi, NoteAction, Page, Status, day, useLoad } from "@/components/ui";
import { api, type CityRow } from "@/lib/api";

const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);

function CityPanel({ c, canEdit, done }: { c: CityRow; canEdit: boolean; done(): void }) {
  const { toast } = useAdmin();
  const [at, setAt] = useState(localInput(new Date(Date.now() + (c.eta_days && c.eta_days > 0 ? c.eta_days : 2) * 864e5)));
  const [override, setOverride] = useState(""); const [now, setNow] = useState(false);
  const [f, setF] = useState({ threshold: c.threshold, min_women: c.min_women, min_complete: c.min_complete });
  const { busy, error, run } = useAction();
  const meets = (n: number | null, min: number) => n !== null && n >= min;
  return (
    <section className="card stack" style={{ gap: 12 }} aria-label={`${c.name} settings`}>
      <div className="row"><h2 className="grow">{c.name}</h2><Status s={c.status} /></div>
      <div className="stack" style={{ gap: 6 }}>
        {[["Members", c.members, c.threshold, `${c.members.toLocaleString("en-IN")} of ${c.threshold.toLocaleString("en-IN")}`, c.members >= c.threshold],
          ["Women", c.women_pct, c.min_women, `${c.women_pct ?? "–"}% (need ${c.min_women}%)`, meets(c.women_pct, c.min_women)],
          ["Complete profiles", c.complete_pct, c.min_complete, `${c.complete_pct ?? "–"}% (need ${c.min_complete}%)`, meets(c.complete_pct, c.min_complete)]].map(([l, v, min, txt, ok]) => (
          <div key={String(l)} className="stack" style={{ gap: 3 }}><div className="row" style={{ justifyContent: "space-between" }}><span>{ok ? "✓" : "·"} {String(l)}</span><span className="small">{String(txt)}</span></div>
            <div className="bar"><span style={{ width: `${Math.min(100, ((Number(v) || 0) / Number(min || 1)) * 100)}%`, background: ok ? "var(--green)" : undefined }} /></div></div>))}
        <span className="small">{c.per_day} new a day over 14 days{c.eta_days ? ` · at this pace, ready in about ${c.eta_days} days` : ""} · {c.waitlist_only} more on the website waitlist without an account</span>
        {c.waitlist_sms && <span className="small" aria-label={`${c.name} city-open SMS`}>City-open SMS to the website waitlist: {c.waitlist_sms.sent} sent · {c.waitlist_sms.queued} waiting · {c.waitlist_sms.failed} failed · {c.waitlist_sms.skipped} skipped (has an account, or not an Indian mobile)</span>}
      </div>
      {c.status === "waitlist" && canEdit && <div className="stack" style={{ gap: 8, padding: 12, borderRadius: 12, background: "#F7F4FC" }}>
        <strong style={{ fontSize: 13 }}>{c.unlock_at ? `Unlock scheduled for ${new Date(c.unlock_at).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : "Unlock"}</strong>
        {!c.unlock_at && <><label className="f">When<input className="input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></label>
          {!c.ready && <label className="f">Not ready yet. Why unlock early?<input className="input" value={override} onChange={(e) => setOverride(e.target.value)} placeholder="College fest launch" /></label>}</>}
        <span className="small">Everyone who signed up in {c.name} gets an in-app notice the moment it opens, and people on the website waitlist get one SMS. This can&apos;t be undone.</span>
        <div className="row">
          {c.unlock_at ? <button type="button" className="btn ghost sm" disabled={busy} onClick={() => run(async () => { await api().scheduleUnlock(c.slug, null, null); toast("Unlock cancelled"); done(); })}>Cancel scheduled unlock</button>
            : <button type="button" className="btn sm" disabled={busy || (!c.ready && !override.trim())} onClick={() => run(async () => { await api().scheduleUnlock(c.slug, new Date(at).toISOString(), override || null); toast(`${c.name} scheduled`); done(); })}>Schedule unlock</button>}
          {now ? <><button type="button" className="btn dark sm" disabled={busy} onClick={() => run(async () => { const r = await api().unlockNow(c.slug); toast(`${c.name} is live. ${r.notified} members told.`); done(); })}>Yes, unlock {c.name} now</button>
              <button type="button" className="btn ghost sm" onClick={() => setNow(false)}>No</button></>
            : <button type="button" className="btn ghost sm" disabled={!c.ready && !override.trim()} onClick={() => setNow(true)}>Unlock now…</button>}
        </div></div>}
      {canEdit && c.status !== "live" && <NoteAction label={c.status === "locked" ? "Open the waitlist" : "Close the waitlist (back to locked)"} placeholder="Reason"
        onRun={(n) => api().setCityStatus(c.slug, c.status === "locked" ? "waitlist" : "locked", n)} done={() => { toast("Done"); done(); }} />}
      {canEdit && <form className="stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); run(async () => { await api().saveCity({ ...c, ...f }); toast("Unlock rules saved"); done(); }); }}>
        <div className="row"><label className="f">Unlock at members<input className="input" type="number" min={50} value={f.threshold} onChange={(e) => setF({ ...f, threshold: Number(e.target.value) })} style={{ width: 110 }} /></label>
          <label className="f">Min women %<input className="input" type="number" min={0} max={100} value={f.min_women} onChange={(e) => setF({ ...f, min_women: Number(e.target.value) })} style={{ width: 90 }} /></label>
          <label className="f">Min complete %<input className="input" type="number" min={0} max={100} value={f.min_complete} onChange={(e) => setF({ ...f, min_complete: Number(e.target.value) })} style={{ width: 90 }} /></label></div>
        <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} disabled={busy}>Save rules for {c.name}</button></form>}
      {error && <p className="err" role="alert">{error}</p>}
    </section>
  );
}

export default function Cities() {
  const { toast } = useAdmin();
  const { data, reload } = useLoad(() => api().cities());
  const [sel, setSel] = useState<string | null>(null); const [adding, setAdding] = useState(false);
  const [n, setN] = useState({ slug: "", name: "", state: "", threshold: 1000 });
  const add = useAction();
  if (!data) return <div className="skel" style={{ height: 400 }} />;
  const live = data.cities.filter((c) => c.status === "live"); const wait = data.cities.filter((c) => c.status === "waitlist");
  const next = [...wait].sort((a, b) => (a.eta_days ?? 1e9) - (b.eta_days ?? 1e9))[0];
  const c = data.cities.find((x) => x.slug === sel);
  return (
    <Page title="Cities and waitlist" sub="Open cities only when the feed will feel full: members, women share and complete profiles."
      actions={data.can_edit && <button type="button" className="btn ghost" onClick={() => setAdding(!adding)}>Add city</button>}>
      <div className="kpis"><Kpi k="Live cities" v={live.length} s={live.map((x) => x.name).join(", ")} />
        <Kpi k="Waiting" v={wait.reduce((a, x) => a + x.members + x.waitlist_only, 0).toLocaleString("en-IN")} s={`across ${wait.length} cities`} />
        <Kpi k="Next unlock" v={next?.name ?? "–"} s={next?.unlock_at ? `scheduled ${day(next.unlock_at)}` : next?.eta_days ? `about ${next.eta_days} days at this pace` : ""} />
        <Kpi k="Invites" v={data.invites_month.toLocaleString("en-IN")} s="this month" /></div>
      {adding && <form className="card row" aria-label="Add city" onSubmit={(e) => { e.preventDefault(); add.run(async () => {
          await api().saveCity({ slug: n.slug, name: n.name, state: n.state || null, country: "IN", lat: null, lng: null, timezone: "Asia/Kolkata", threshold: n.threshold, min_women: 40, min_complete: 65 });
          toast(`${n.name} added (locked)`); setAdding(false); reload(); }); }}>
        <label className="f">City<input className="input" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-") })} /></label>
        <label className="f">State<input className="input" value={n.state} onChange={(e) => setN({ ...n, state: e.target.value })} /></label>
        <label className="f">Unlock at<input className="input" type="number" value={n.threshold} onChange={(e) => setN({ ...n, threshold: Number(e.target.value) })} style={{ width: 100 }} /></label>
        <button className="btn sm" style={{ alignSelf: "flex-end" }} disabled={add.busy || !n.name.trim()}>Add</button>{add.error && <p className="err" role="alert">{add.error}</p>}</form>}
      <div className="split">
        <div className="card flush"><table className="t"><thead><tr><th>City</th><th>Status</th><th>Members</th><th>Women</th><th>Complete</th><th>Unlock</th></tr></thead>
          <tbody>{data.cities.map((x) => <tr key={x.slug} className="click" aria-selected={sel === x.slug} onClick={() => setSel(x.slug)}>
            <td><strong>{x.name}</strong>{x.ready && x.status === "waitlist" && <div><span className="pill ok">ready</span></div>}</td><td><Status s={x.status} /></td>
            <td>{x.members.toLocaleString("en-IN")}<div className="small">of {x.threshold.toLocaleString("en-IN")}</div></td><td>{x.women_pct ?? "–"}%</td><td>{x.complete_pct ?? "–"}%</td>
            <td className="small">{x.status === "live" ? `Live since ${day(x.unlocked_at)}` : x.unlock_at ? `Scheduled ${day(x.unlock_at)}` : x.eta_days ? `~${x.eta_days} days` : "–"}</td></tr>)}</tbody></table></div>
        {c ? <CityPanel key={c.slug + c.status + c.unlock_at} c={c} canEdit={data.can_edit} done={reload} /> : <div className="note">Pick a city to see how close it is and to unlock it.</div>}
      </div>
      <SettingsForm title="Growth rules" canEdit={data.can_rules} fields={[
        { key: "waitlist_jump_per_invite", label: "Waitlist places jumped per friend who joins", unit: "number" },
        { key: "public_counter_min", label: "Public city counter shows after", unit: "number", hint: "members" },
        { key: "booth_bonus", label: "Booth sign-up bonus", unit: "credits" },
        { key: "invite_rewards", path: "inviter", label: "Invite: inviter gets", unit: "credits" }, { key: "invite_rewards", path: "friend", label: "Invite: friend gets", unit: "credits" },
        { key: "invite_rewards", path: "max_per_month", label: "Rewarded invites per month", unit: "number" },
        { key: "crush_links_per_day", label: "Check With Anyone links per person per day", unit: "number" }, { key: "gift_links_per_day", label: "Gift links per person per day", unit: "number" }]} onSaved={reload} />
    </Page>
  );
}
