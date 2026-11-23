"use client";
// V1 Events: local events posted by verified members, each one checked by the team first. You see how many are going,
// never who. Your own events and RSVPs under "Mine".
import Link from "next/link";
import { useEffect, useState } from "react";
import { BackButton } from "@/components/ui";
import { api, type EventCard, type EventCategory } from "@/lib/api";
import { CATS, catLabel, whenLine } from "@/lib/events";

const STATUS: Record<string, string> = { pending: "Waiting for review", rejected: "Not approved", cancelled: "Cancelled", approved: "Live" };

export default function Events() {
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [cat, setCat] = useState<EventCategory | null>(null);
  const [list, setList] = useState<EventCard[] | null>(null);
  const [mine, setMine] = useState<{ hosting: EventCard[]; going: EventCard[] } | null>(null);
  useEffect(() => { setList(null); api().events(cat).then(setList).catch(() => setList([])); }, [cat]);
  useEffect(() => { if (tab === "mine") api().myEvents().then(setMine).catch(() => setMine({ hosting: [], going: [] })); }, [tab]);

  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/discover" /><h1>Events</h1></div>
      <p className="sub" style={{ margin: 0 }}>Things to do in your city, posted by verified members. Every event is checked by our team before it shows here.</p>
      <div className="chips fill" role="tablist" aria-label="Events">
        <button type="button" role="tab" className="chip sm" aria-selected={tab === "all"} aria-pressed={tab === "all"} onClick={() => setTab("all")}>Upcoming</button>
        <button type="button" role="tab" className="chip sm" aria-selected={tab === "mine"} aria-pressed={tab === "mine"} onClick={() => setTab("mine")}>Mine</button>
      </div>

      {tab === "all" ? <>
        <div className="row" style={{ gap: 8, overflowX: "auto", scrollbarWidth: "none", margin: "0 -16px", padding: "0 16px" }}>
          <button type="button" className="chip sm" style={{ flex: "none" }} aria-pressed={!cat} onClick={() => setCat(null)}>All</button>
          {CATS.map(([k, l]) => <button key={k} type="button" className="chip sm" style={{ flex: "none" }} aria-pressed={cat === k} onClick={() => setCat(k)}>{l}</button>)}
        </div>
        {!list ? <div className="skel" style={{ height: 240 }} /> : list.length === 0
          ? <div className="empty card"><strong>Nothing planned yet</strong><span className="sub">Be the first to post something in your city.</span></div>
          : list.map((e) => <EventRow key={e.id} e={e} />)}
      </> : !mine ? <div className="skel" style={{ height: 240 }} /> : <>
        <div className="sec-title"><strong>Hosting</strong></div>
        {mine.hosting.length === 0 ? <span className="small">You haven&apos;t posted an event yet.</span>
          : mine.hosting.map((e) => <EventRow key={e.id} e={e} status />)}
        <div className="sec-title"><strong>Going or interested</strong></div>
        {mine.going.length === 0 ? <span className="small">Nothing yet.</span> : mine.going.map((e) => <EventRow key={e.id} e={e} />)}
      </>}

      <Link href="/events/new" className="btn">Post an event</Link>
      <span className="small" style={{ textAlign: "center" }}>Public venues only. Meet people in groups first, and tell someone you trust where you&apos;re going.</span>
    </div>
  );
}

function EventRow({ e, status }: { e: EventCard; status?: boolean }) {
  return (
    <Link href={`/events/${e.id}`} className="card stack" style={{ gap: 6, borderRadius: 14, color: "var(--ink)", textDecoration: "none" }}>
      <span className="row" style={{ justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>
          {catLabel(e.category)}{e.id.startsWith("e-sample") ? " · Sample event" : ""}</span>
        {status ? <span className="badge-soft">{STATUS[e.status] ?? e.status}</span>
          : e.my_rsvp ? <span className="badge-soft">{e.my_rsvp === "going" ? "Going" : "Interested"}</span> : null}
      </span>
      <strong style={{ fontSize: 17 }}>{e.title}</strong>
      <span className="small">{whenLine(e)}</span>
      <span className="small">{e.venue_name}, {e.venue_area} · {e.price_inr ? `₹${e.price_inr}` : "Free"}{e.singles_only ? " · Singles" : ""}</span>
      {e.status === "approved" && <span style={{ fontSize: 13 }}><strong style={{ color: "var(--action)" }}>{e.going}</strong> going
        {e.strong_going > 0 && <> · <strong style={{ color: "var(--action)" }}>{e.strong_going}</strong> strong Guna {e.strong_going === 1 ? "match" : "matches"}</>}</span>}
    </Link>
  );
}
