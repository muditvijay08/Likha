"use client";
// I27 Events: every member event waits here until the team approves it. Reject needs a reason (the host sees it).
// Insights are aggregates only: groups under 5 people are hidden, demo accounts never count, and nobody's RSVP list is shown.
import { useState } from "react";
import { useAction, useAdmin } from "@/components/shell";
import { Kpi, NoteAction, Page, Status, ago, label, useLoad } from "@/components/ui";
import { api, type AdminEvent, type AdminEventStatus } from "@/lib/api";

const when = (e: AdminEvent) => {
  const s = new Date(e.starts_at), en = new Date(e.ends_at), t = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return `${s.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}, ${t(s)}–${t(en)}`;
};
const DOW = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// What reviewers check, shown next to every pending event
const RULES = ["A real, public venue (not a home or hotel room)", "No phone numbers, links, handles or payment requests", "Nothing about caste, religion-only entry or 'fair' partners",
  "Entry fee, if any, paid at the venue", "Not a sales pitch, MLM, astrology remedy or paid matchmaking", "Title and description match"];

function EventCard({ e, done }: { e: AdminEvent; done(): void }) {
  const { toast } = useAdmin(); const act = useAction();
  return (
    <section className="card stack" style={{ gap: 8 }} aria-label={e.title}>
      <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 16 }}>{e.title}</strong><Status s={e.status} />
      </div>
      <div className="small">{label(e.category)} · {when(e)} · {e.venue_name}, {e.venue_area}, {e.city} · {e.price_inr ? `₹${e.price_inr}` : "Free"}
        {e.capacity ? ` · ${e.capacity} spots` : ""}{e.singles_only ? " · Singles" : ""}</div>
      <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{e.description}</p>
      <div className="small">Host {e.host}{e.host_demo ? " (demo account)" : ""} · {e.host_events} approved before · posted {ago(e.created_at)}{e.status === "approved" ? ` · ${e.going} going` : ""}</div>
      {e.status_reason && <div className="small">Reason: {e.status_reason}</div>}
      {e.reports.length > 0 && <div className="stack" style={{ gap: 2 }}><strong className="small">{e.reports.length} report{e.reports.length === 1 ? "" : "s"}</strong>
        {e.reports.map((r, i) => <span key={i} className="small">“{r.reason}” · {ago(r.at)}</span>)}</div>}
      {(e.status === "pending" || e.status === "approved") && (
        <div className="row">
          {e.status === "pending" && <button type="button" className="btn sm" disabled={act.busy}
            onClick={() => act.run(async () => { await api().decideEvent(e.id, true); toast("Approved; the host was told"); done(); })}>Approve</button>}
          <NoteAction label={e.status === "pending" ? "Reject" : "Take down"} tone="danger" placeholder="Why? The host sees this, e.g. Please use a public venue."
            onRun={(n) => api().decideEvent(e.id, false, n)} done={() => { toast(e.status === "pending" ? "Rejected; the host was told" : "Taken down; host and RSVPs told"); done(); }} />
        </div>
      )}
      {act.error && <p className="err" role="alert">{act.error}</p>}
    </section>
  );
}

function Insights() {
  const [days, setDays] = useState(30);
  const { data } = useLoad(() => api().eventInsights(days), [days]);
  if (!data) return <div className="skel" style={{ height: 300 }} />;
  const max = (xs: { going: number }[]) => Math.max(1, ...xs.map((x) => x.going));
  const Bars = ({ rows }: { rows: { k: string; going: number }[] }) => rows.length === 0 ? <div className="sub small">Not enough people yet (groups under {data.min_group} are hidden).</div> : (
    <div className="stack" style={{ gap: 6 }}>{rows.map((r) => (
      <div key={r.k} className="row" style={{ gap: 8 }}><span className="small" style={{ width: 120, flex: "none" }}>{r.k}</span>
        <span style={{ height: 10, borderRadius: 4, background: "var(--action, #FF5A1F)", width: `${(r.going / max(rows)) * 100}%`, minWidth: 4 }} />
        <span className="small">{r.going}</span></div>))}</div>);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="tabs" role="tablist" aria-label="Period">{[7, 30, 90].map((d) =>
        <button key={d} type="button" role="tab" aria-selected={days === d} onClick={() => setDays(d)}>{d} days</button>)}</div>
      <div className="kpis">
        <Kpi k="Events posted" v={data.totals.posted} s={`${data.totals.approved} approved · ${data.totals.rejected} rejected`} />
        <Kpi k="Hosts" v={data.totals.hosts} />
        <Kpi k="Going" v={data.rsvps.going} s={`${data.rsvps.interested} interested`} />
        <Kpi k="People who RSVP'd" v={data.rsvps.people} s={`${data.repeat_goers} went to 2+`} />
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <section className="card stack" aria-label="By category"><h2>Going, by kind</h2><Bars rows={data.by_category.map((c) => ({ k: `${label(c.category)} (${c.events})`, going: c.going }))} /></section>
        <section className="card stack" aria-label="By day"><h2>Going, by day</h2><Bars rows={data.by_weekday.map((d) => ({ k: DOW[d.dow], going: d.going }))} /></section>
        <section className="card stack" aria-label="By hour"><h2>Going, by start time</h2><Bars rows={data.by_hour.map((h) => ({ k: `${h.hour}:00`, going: h.going }))} /></section>
        <section className="card stack" aria-label="By area"><h2>Going, by area</h2><Bars rows={data.by_area.map((a) => ({ k: `${a.area} (${a.events})`, going: a.going }))} /></section>
        <section className="card stack" aria-label="By Moon element"><h2>Moon element and kind</h2><Bars rows={data.by_element.map((x) => ({ k: `${x.element} · ${label(x.category)}`, going: x.going }))} /></section>
      </div>
      <p className="small">Counts only. Demo accounts never count; any group under {data.min_group} people is hidden so nobody can be picked out.</p>
    </div>
  );
}

export default function EventsPage() {
  const [tab, setTab] = useState<AdminEventStatus | "insights">("pending");
  const { data, reload } = useLoad(() => tab === "insights" ? Promise.resolve(null) : api().events(tab), [tab]);
  const tabs = (
    <div className="tabs" role="tablist">{([["pending", "Waiting"], ["approved", "Live"], ["rejected", "Rejected"], ["cancelled", "Cancelled"], ["insights", "Insights"]] as const).map(([t, l]) =>
      <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{l}{t === "pending" && tab === "pending" && data ? ` (${data.length})` : ""}</button>)}</div>
  );
  return (
    <Page title="Events" sub="Members post local events; each one waits here until the team approves it. Members see counts, never who is going.">
      {tabs}
      {tab === "insights" ? <Insights /> : !data ? <div className="skel" style={{ height: 300 }} /> : (
        <div className="split">
          <div className="stack" style={{ gap: 12 }}>
            {data.length === 0 ? <div className="card sub">Nothing here.</div> : data.map((e) => <EventCard key={e.id} e={e} done={reload} />)}
          </div>
          {tab === "pending" && <aside className="card stack" aria-label="What to check"><h2>What to check</h2>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>{RULES.map((r) => <li key={r} className="small">{r}</li>)}</ul></aside>}
        </div>
      )}
    </Page>
  );
}
