"use client";
// V2 Event: details, going / interested, report. Counts only, never who. The host can cancel; a rejected event shows the team's reason.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BackButton, ErrorNote, useAction } from "@/components/ui";
import { useApp } from "@/components/app";
import { api, type EventCard } from "@/lib/api";
import { catLabel, whenLine } from "@/lib/events";

export default function EventView() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useApp();
  const [e, setE] = useState<EventCard | null | undefined>(undefined);
  const [report, setReport] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const { busy, error, run } = useAction();
  useEffect(() => { api().event(id).then(setE).catch(() => setE(null)); }, [id]);

  if (e === undefined) return <div className="app-body pad"><div className="skel" style={{ height: 380 }} /></div>;
  if (!e) return <div className="app-body pad"><div className="empty card"><strong>This event isn&apos;t available</strong><Link className="btn" href="/events">All events</Link></div></div>;
  const rsvp = (s: "going" | "interested" | null) => run(async () => { setE(await api().eventRsvp(e.id, s)); toast(s === "going" ? "You're going" : s ? "Marked interested" : "Removed"); });
  const full = e.capacity != null && e.going >= e.capacity && e.my_rsvp !== "going";
  const past = new Date(e.starts_at).getTime() < Date.now();

  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/events" /><h1>Event</h1></div>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>
        {catLabel(e.category)}{e.id.startsWith("e-sample") ? " · Sample event" : ""}</span>
      <h2 className="h1" style={{ margin: 0 }}>{e.title}</h2>
      <div className="listcard">
        <div><span>When</span><span className="small">{whenLine(e)}</span></div>
        <div><span>Where</span><span className="small">{e.venue_name}, {e.venue_area}, {e.city}</span></div>
        <div><span>Entry</span><span className="small">{e.price_inr ? `₹${e.price_inr}, paid at the venue` : "Free"}</span></div>
        <div><span>Hosted by</span><span className="small">{e.host.first_name}{e.host.verified ? " · Verified" : ""}</span></div>
        {e.capacity != null && <div><span>Spots</span><span className="small">{Math.max(e.capacity - e.going, 0)} of {e.capacity} left</span></div>}
        {e.singles_only && <div><span>For</span><span className="small">Singles</span></div>}
      </div>
      {e.description && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{e.description}</p>}

      {e.status === "approved" && (
        <section className="stack" style={{ gap: 4 }} aria-label="Who's coming">
          <span style={{ fontSize: 15 }}><strong style={{ color: "var(--action)" }}>{e.going}</strong> going · <strong>{e.interested}</strong> interested</span>
          {(e.matches_going > 0 || e.strong_going > 0) && <span className="small">
            {e.matches_going > 0 && `${e.matches_going} of your matches ${e.matches_going === 1 ? "is" : "are"} going. `}
            {e.strong_going > 0 && `${e.strong_going} ${e.strong_going === 1 ? "person" : "people"} going ${e.strong_going === 1 ? "is a" : "are"} strong Guna ${e.strong_going === 1 ? "match" : "matches"} (25+) for you.`}</span>}
          <span className="small">We never show who is going.</span>
        </section>
      )}

      {e.host_is_me ? <>
        {e.status === "pending" && <div className="note"><span>Waiting for our team to review. Usually within a day. Nobody sees it until then.</span></div>}
        {e.status === "rejected" && <div className="note"><span>Not approved: {e.status_reason ?? "it didn't meet the event rules"}. You can post a new one.</span></div>}
        {e.status === "cancelled" && <div className="note"><span>You cancelled this event.</span></div>}
        {(e.status === "pending" || e.status === "approved") && !past && (confirmCancel
          ? <div className="consent-box" role="alertdialog" aria-label="Cancel event">
              <span style={{ flex: 1 }}>Cancel this event? Everyone who said they&apos;re going is told.</span>
              <span className="row" style={{ gap: 8 }}>
                <button type="button" className="btn sm" disabled={busy} onClick={() => run(async () => { await api().eventCancel(e.id); setE(await api().event(e.id)); setConfirmCancel(false); })}>Yes, cancel</button>
                <button type="button" className="btn sm outline" onClick={() => setConfirmCancel(false)}>Keep it</button></span>
            </div>
          : <button type="button" className="btn outline" onClick={() => setConfirmCancel(true)}>Cancel event</button>)}
      </> : e.status === "approved" && !past && <>
        <div className="grid2">
          <button type="button" className="btn sm" disabled={busy || full} aria-pressed={e.my_rsvp === "going"} onClick={() => rsvp(e.my_rsvp === "going" ? null : "going")}>
            {e.my_rsvp === "going" ? "Going ✓" : full ? "Full" : "I'm going"}</button>
          <button type="button" className="btn sm outline" disabled={busy} aria-pressed={e.my_rsvp === "interested"} onClick={() => rsvp(e.my_rsvp === "interested" ? null : "interested")}>
            {e.my_rsvp === "interested" ? "Interested ✓" : "Interested"}</button>
        </div>
        {e.my_rsvp === "going" && <Link href={`/share-date?place=${encodeURIComponent(`${e.venue_name}, ${e.venue_area}`)}&at=${encodeURIComponent(e.starts_at)}`} className="btn sm outline">Tell someone you trust where you&apos;ll be</Link>}
      </>}
      <ErrorNote error={error} />

      {!e.host_is_me && (report === null
        ? <button type="button" className="btn text" onClick={() => setReport("")}>Report this event</button>
        : <form className="stack" style={{ gap: 8 }} onSubmit={(ev) => { ev.preventDefault(); run(async () => { await api().eventReport(e.id, report); setReport(null); toast("Thanks. Our team will look at it."); }); }}>
            <label htmlFor="ev-report" className="label">What&apos;s wrong?</label>
            <input id="ev-report" className="input" maxLength={300} value={report} onChange={(x) => setReport(x.target.value)} placeholder="Fake, unsafe, asks for money…" />
            <div className="grid2"><button type="submit" className="btn sm" disabled={busy || report.trim().length < 3}>Send report</button>
              <button type="button" className="btn sm outline" onClick={() => setReport(null)}>Cancel</button></div>
          </form>)}
    </div>
  );
}
