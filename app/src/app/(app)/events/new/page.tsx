"use client";
// V3 Post an event: verified members only, public venues only, no contact details. The team approves each one before it shows.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BackButton, ErrorNote, useAction } from "@/components/ui";
import { useApp } from "@/components/app";
import { api, type EventCategory } from "@/lib/api";
import { CATS } from "@/lib/events";

const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function NewEvent() {
  const router = useRouter();
  const { toast } = useApp();
  const start = new Date(); start.setDate(start.getDate() + 3); start.setHours(18, 0, 0, 0);
  const [title, setTitle] = useState("");
  const [cat, setCat] = useState<EventCategory>("social");
  const [desc, setDesc] = useState("");
  const [starts, setStarts] = useState(local(start));
  const [ends, setEnds] = useState(local(new Date(start.getTime() + 2 * 3600e3)));
  const [venue, setVenue] = useState("");
  const [area, setArea] = useState("");
  const [priceInr, setPriceInr] = useState("");
  const [cap, setCap] = useState("");
  const [singles, setSingles] = useState(false);
  const [isPublic, setIsPublic] = useState(false);              // starts unticked: the host confirms it
  const { busy, error, run } = useAction();
  const ready = title.trim().length >= 6 && desc.trim().length >= 20 && venue.trim().length >= 3 && area.trim().length >= 2 && isPublic;

  const submit = () => run(async () => {
    const id = await api().eventCreate({ title, category: cat, description: desc, starts_at: new Date(starts).toISOString(), ends_at: new Date(ends).toISOString(),
      venue_name: venue, venue_area: area, price_inr: Number(priceInr) || 0, capacity: cap ? Number(cap) : null, singles_only: singles, public_venue: isPublic });
    toast("Sent for review"); router.push(`/events/${id}`);
  });

  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/events" /><h1>Post an event</h1></div>
      <p className="sub" style={{ margin: 0 }}>Our team checks every event before anyone sees it, usually within a day.</p>
      <div className="field"><label htmlFor="ev-title" className="label">Title</label>
        <input id="ev-title" className="input" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sunday cycling at Central Park" /></div>
      <div className="stack" style={{ gap: 6 }}><span className="label">Kind</span>
        <div className="chips">{CATS.map(([k, l]) => <button key={k} type="button" className="chip sm" aria-pressed={cat === k} onClick={() => setCat(k)}>{l}</button>)}</div></div>
      <div className="field"><label htmlFor="ev-desc" className="label">What happens</label>
        <textarea id="ev-desc" className="input" rows={4} maxLength={1000} value={desc} onChange={(e) => setDesc(e.target.value)} style={{ height: "auto", paddingTop: 12 }}
          placeholder="What to expect, what to bring, who it's for." /></div>
      <div className="grid2">
        <div className="field"><label htmlFor="ev-start" className="label">Starts</label>
          <input id="ev-start" className="input" type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} /></div>
        <div className="field"><label htmlFor="ev-end" className="label">Ends</label>
          <input id="ev-end" className="input" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} /></div>
      </div>
      <div className="field"><label htmlFor="ev-venue" className="label">Venue</label>
        <input id="ev-venue" className="input" maxLength={80} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Central Park, Gate 2" /></div>
      <div className="field"><label htmlFor="ev-area" className="label">Area</label>
        <input id="ev-area" className="input" maxLength={60} value={area} onChange={(e) => setArea(e.target.value)} placeholder="C-Scheme" /></div>
      <div className="grid2">
        <div className="field"><label htmlFor="ev-price" className="label">Entry (₹, 0 = free)</label>
          <input id="ev-price" className="input" inputMode="numeric" value={priceInr} onChange={(e) => setPriceInr(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="0" /></div>
        <div className="field"><label htmlFor="ev-cap" className="label">Spots <span style={{ fontWeight: 400, color: "var(--muted)" }}>(opt.)</span></label>
          <input id="ev-cap" className="input" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="No limit" /></div>
      </div>
      <label className="row" style={{ gap: 10, fontSize: 14 }} htmlFor="ev-singles">
        <input id="ev-singles" type="checkbox" checked={singles} onChange={(e) => setSingles(e.target.checked)} style={{ width: 20, height: 20 }} />
        <span>A singles event</span></label>
      <label className="consent-box" htmlFor="ev-public">
        <input id="ev-public" type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        <span>It&apos;s at a public venue, open to anyone who comes. Any entry fee is paid at the venue, not through me.</span>
      </label>
      <div className="note"><span>No phone numbers, links, emails or social handles. People RSVP on Likha. We never show you who is going, only how many.</span></div>
      <ErrorNote error={error} />
      <button type="button" className="btn" disabled={busy || !ready} onClick={submit}>Send for review</button>
      <span className="small" style={{ textAlign: "center" }}>Only verified members can post. See <Link href="/safety">safety tips</Link>.</span>
    </div>
  );
}
