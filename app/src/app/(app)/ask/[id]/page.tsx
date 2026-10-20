"use client";
// C3 Partner consent: someone wants a reading that uses your birth chart. Nothing is read, and they pay nothing, unless you say yes.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BackButton, ErrorNote, useAction } from "@/components/ui";
import { KIND_TITLE } from "@/components/couple";
import { api, type ConsentReq } from "@/lib/api";

const WHAT: Record<string, string> = {
  our_stars: "how your two kundlis get along", our_alignment: "how your current dashas line up",
  imagine_us: "two painted pictures of you both, made from your main photos", seven_questions: "your answers to seven questions",
};
const SCENE: Record<string, string> = { travel: "on a trip", wedding: "at a wedding", old_age: "at 70" };

export default function Ask() {
  const { id } = useParams<{ id: string }>();
  const [req, setReq] = useState<ConsentReq | null | undefined>(undefined);
  const [always, setAlways] = useState(false);
  const [done, setDone] = useState<"yes" | "no" | null>(null);
  const { busy, error, run } = useAction();
  useEffect(() => { api().consentRequests().then((l) => setReq(l.find((x) => x.id === id) ?? null)).catch(() => setReq(null)); }, [id]);
  const decide = (allow: boolean) => run(async () => { await api().decideConsent(id, allow, allow && always); setDone(allow ? "yes" : "no"); });

  if (req === undefined) return <div className="app-body pad"><div className="skel" style={{ height: 300 }} /></div>;
  if (done) return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/inbox" /><h1>{done === "yes" ? "You said yes" : "You said no"}</h1></div>
      <div className="card stack" style={{ gap: 8, borderRadius: 20 }}>
        <strong>{done === "yes" ? `Writing ${KIND_TITLE[req?.kind ?? ""] ?? "the reading"} now` : `We told ${req?.from_name ?? "them"} it isn't happening this time`}</strong>
        <span className="sub">{done === "yes" ? "You can both open it from My readings once it's ready." : "They weren't charged. No reason is shared."}</span>
      </div>
      <Link className="btn ghost" href="/readings">My readings</Link>
    </div>
  );
  if (!req) return <div className="app-body pad"><BackButton href="/inbox" /><div className="empty card"><strong>Nothing to decide</strong><span className="sub">This request was already answered or withdrawn.</span></div></div>;
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/inbox" /><h1>{KIND_TITLE[req.kind] ?? "A reading"}</h1></div>
      <div style={{ padding: 18, borderRadius: 22, background: "linear-gradient(135deg, #EDE6FF, var(--rose-soft))" }} className="stack">
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "var(--rose-ink)" }}>YOUR SAY</span>
        <strong className="serif" style={{ fontSize: 22, lineHeight: 1.25 }}>{req.from_name} wants to read {KIND_TITLE[req.kind] ?? "a reading"} with you{req.scene ? ` (${SCENE[req.scene] ?? req.scene})` : ""}</strong>
        <span style={{ fontSize: 13, color: "#3D3560" }}>It looks at {WHAT[req.kind] ?? "both your charts"}. {req.from_name} pays; you pay nothing. Only the two of you see it.</span>
      </div>
      <label className="row" style={{ gap: 10, fontSize: 14, alignItems: "flex-start" }}>
        <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} style={{ marginTop: 3 }} />
        <span>Don&apos;t ask me again for {req.from_name}&apos;s readings with me.</span>
      </label>
      <ErrorNote error={error} />
      <div className="grow" />
      <button type="button" className="btn" disabled={busy} onClick={() => decide(true)}>Yes, go ahead</button>
      <button type="button" className="btn ghost" disabled={busy} onClick={() => decide(false)}>No thanks</button>
      <span className="small" style={{ textAlign: "center" }}>Saying no is private. {req.from_name} only sees that it isn&apos;t happening this time.</span>
    </div>
  );
}
