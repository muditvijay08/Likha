"use client";
// L8 Check-in: "All good?" with a countdown to the alert. Linked from the reminder notification.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorNote, Primary, useAction } from "@/components/ui";
import { useApp } from "@/components/app";
import { api, type DateShare } from "@/lib/api";

export default function Checkin() {
  const { id } = useParams<{ id: string }>();
  const { home } = useApp();
  const [d, setD] = useState<DateShare | null | undefined>(undefined);
  const [now, setNow] = useState(Date.now());
  const { busy, error, run } = useAction();
  useEffect(() => { api().dateShare(id).then(setD).catch(() => setD(null)); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [id]);
  const answer = (a: "ok" | "later" | "help") => run(async () => setD(await api().checkin(id, a)));
  if (d === undefined) return <div className="app-body pad"><div className="skel" style={{ height: 300 }} /></div>;
  if (!d) return <div className="app-body pad"><div className="empty card"><strong>Check-in not found</strong><Link className="btn" href="/home">Home</Link></div></div>;
  const alertAt = Date.parse(d.checkin_at) + d.alert_after_minutes * 60000;
  const left = Math.max(0, alertAt - now), due = now >= Date.parse(d.checkin_at);
  const mm = String(Math.floor(left / 60000)).padStart(2, "0"), ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
  const who = d.contacts.map((c) => c.name).join(" and ") || "your contact";
  const start = new Date(d.starts_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

  if (d.status === "ok") return <div className="app-body pad" style={{ gap: 14, justifyContent: "center" }}><h1 className="h1">Glad you&apos;re okay</h1><p className="sub">We won&apos;t alert {who}. Have a lovely evening.</p><Link className="btn" href="/home">Back to Home</Link></div>;
  if (d.status === "help" || d.status === "alerted") return <div className="app-body pad" style={{ gap: 14 }}><h1 className="h1">{d.status === "help" ? "Help is on the way" : `We alerted ${who}`}</h1>
    <p className="sub">{d.status === "help" ? `Call 112 if you're in danger. We've let our safety team know.` : `${who} got an SMS asking them to call you.`}</p>
    <a className="btn" href="tel:112" style={{ background: "var(--red)", color: "#fff" }}>Call 112</a>
    <button type="button" className="btn ghost" onClick={() => answer("ok")}>I&apos;m okay now</button></div>;
  return (
    <div className="app-body pad" style={{ gap: 16 }}>
      <h1 className="h1 big">Hey {home?.first_name ?? "there"}, all good?</h1>
      <p className="sub">Your date{d.with ? ` with ${d.with}` : ""} at {d.place} started at {start}. {who} {d.contacts.length === 1 ? "is" : "are"} your trusted contact{d.contacts.length === 1 ? "" : "s"} tonight.</p>
      {due ? <div className="row" style={{ gap: 10, padding: "14px 16px", borderRadius: 16, background: "var(--saffron-soft)" }} role="timer" aria-live="off">
        <span>No answer in <strong>{mm}:{ss}</strong> and we alert {who}.</span></div>
        : <div className="note"><span>We&apos;ll check in at {new Date(d.checkin_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}. You can answer early.</span></div>}
      <ErrorNote error={error} />
      <div className="grow" />
      <Primary onClick={() => answer("ok")} busy={busy}>I&apos;m okay</Primary>
      <button type="button" className="btn ghost" onClick={() => answer("later")} disabled={busy}>Still out, check again in 1 hour</button>
      <Link className="btn text" href={`/sos${d.match_id ? `?match=${d.match_id}` : ""}`} style={{ color: "var(--red)" }}>I need help</Link>
    </div>
  );
}
