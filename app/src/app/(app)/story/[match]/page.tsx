"use client";
// C5 Our Story: a timeline the app keeps for you two (first message, dates you shared for safety, readings) plus moments you add.
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BackButton, ErrorNote, useAction } from "@/components/ui";
import { useApp } from "@/components/app";
import { Pair } from "@/components/couple";
import { api, type Story } from "@/lib/api";

const ICON: Record<string, string> = { match: "✦", first_message: "✉", date: "☕", reading: "☾", couple_mode: "♥", custom: "★" };
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 10);

/** A yearly calendar reminder on the day you matched. */
function anniversaryIcs(matchedAt: string, other: string) {
  const d = new Date(matchedAt); const ymd = `${d.getFullYear() + 1}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Likha//Our Story//EN", "BEGIN:VEVENT", `UID:likha-${d.getTime()}@likha.in`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`, `DTSTART;VALUE=DATE:${ymd}`, "RRULE:FREQ=YEARLY",
    `SUMMARY:Matched with ${other} on Likha`, "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:Anniversary tomorrow", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = "likha-anniversary.ics"; a.click();
}

export default function StoryPage() {
  const { match } = useParams<{ match: string }>();
  const { home } = useApp();
  const [s, setS] = useState<Story | null>(null);
  const [other, setOther] = useState("");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [when, setWhen] = useState(local(new Date()));
  const [photo, setPhoto] = useState<File | null>(null);
  const { busy, error, run } = useAction();
  const load = useCallback(() => api().story(match).then(setS).catch(() => {}), [match]);
  useEffect(() => { load(); api().couple(match).then((c) => setOther(c.other_name)).catch(() => {}); }, [load, match]);
  const save = () => run(async () => {
    await api().addMoment(match, title.trim(), body.trim(), new Date(`${when}T12:00:00`), photo);
    setTitle(""); setBody(""); setPhoto(null); setAdding(false); await load();
  });
  if (!s) return <div className="app-body pad"><div className="skel" style={{ height: 300 }} /></div>;
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href={`/universe/${match}`} /><h1>Our Story</h1></div>
      <Pair me={home?.first_name ?? "You"} other={other || "…"} line={`Since ${fmt(s.matched_at)}`} />
      <div className="grid3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {[[String(s.days), s.days === 1 ? "day" : "days"], [String(s.dates), s.dates === 1 ? "date" : "dates"], [`${s.jodi_score ?? "–"}%`, "Jodi Score"]].map(([n, l]) => (
          <div key={l} className="stack" style={{ alignItems: "center", padding: "12px 6px", borderRadius: 16, background: "var(--rose-soft)" }}>
            <strong className="serif" style={{ fontSize: 22, color: "var(--rose-ink)" }}>{n}</strong><span className="small">{l}</span></div>))}
      </div>
      <ol className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 0 }} aria-label="Timeline">
        {s.events.map((e, i) => (
          <li key={e.id} className="row" style={{ gap: 12, alignItems: "stretch" }}>
            <span className="stack" style={{ alignItems: "center", gap: 0, width: 28, flex: "none" }}>
              <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 999, background: "#fff", border: "1px solid var(--line)", display: "grid", placeItems: "center", fontSize: 13 }}>{ICON[e.kind] ?? "•"}</span>
              {i < s.events.length - 1 && <span style={{ flex: 1, width: 2, background: "var(--line)" }} />}
            </span>
            <span className="stack" style={{ gap: 2, paddingBottom: 16 }}>
              <span className="small">{fmt(e.at)}</span><strong style={{ fontSize: 14 }}>{e.title}</strong>
              {e.body && <span style={{ fontSize: 13, color: "#3D3560" }}>{e.body}</span>}
              {e.photo && <img src={e.photo} alt={e.title} style={{ width: "100%", maxWidth: 260, borderRadius: 14, marginTop: 4 }} />}
            </span>
          </li>
        ))}
      </ol>
      {adding ? (
        <section className="card stack" style={{ gap: 10, borderRadius: 20 }} aria-label="Add a moment">
          <div className="field"><label className="label" htmlFor="m-title">What happened</label><input id="m-title" className="input" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="First trip to Udaipur" /></div>
          <div className="field"><label className="label" htmlFor="m-when">When</label><input id="m-when" type="date" className="input" max={local(new Date())} min={s.matched_at.slice(0, 10)} value={when} onChange={(e) => setWhen(e.target.value)} /></div>
          <div className="field"><label className="label" htmlFor="m-body">A line about it <span style={{ fontWeight: 400, color: "var(--muted)" }}>· optional</span></label>
            <textarea id="m-body" className="input" maxLength={300} value={body} onChange={(e) => setBody(e.target.value)} /></div>
          <div className="field"><label className="label" htmlFor="m-photo">Photo <span style={{ fontWeight: 400, color: "var(--muted)" }}>· optional, only you two see it</span></label>
            <input id="m-photo" type="file" accept="image/jpeg,image/png" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></div>
          <ErrorNote error={error} />
          <div className="grid2"><button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
            <button type="button" className="btn" disabled={!title.trim() || busy} onClick={save}>Add to our story</button></div>
        </section>
      ) : <button type="button" className="btn" onClick={() => setAdding(true)}>Add a moment</button>}
      <button type="button" className="btn ghost" onClick={() => anniversaryIcs(s.matched_at, other || "them")}>Remind me on our anniversary</button>
      <span className="small" style={{ textAlign: "center" }}>Only the two of you can see Our Story.</span>
    </div>
  );
}
