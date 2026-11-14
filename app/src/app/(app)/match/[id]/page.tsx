"use client";
// M1 It's a match. Golden Hours: Venus and Moon horas for chats, Jupiter horas for a first date, never in Rahu Kaal.
// No prices here: the moment is for saying hi. More Golden Hours and openers live in the chat.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Avatar, useApp } from "@/components/app";
import { api, type MatchRow } from "@/lib/api";
import { BEST_FOR_LABEL, clockRange, goldenHours } from "@/lib/panchang";

export default function Match() {
  const { id } = useParams<{ id: string }>();
  const { home } = useApp();
  const [m, setM] = useState<MatchRow | null | undefined>(undefined);
  useEffect(() => {
    api().matches().then((all) => setM(all.find((x) => x.match_id === id) ?? null)).catch(() => setM(null));
  }, [id]);

  const city = home?.city;
  const hours = useMemo(() => city ? goldenHours(city.lat, city.lng, city.timezone, new Date(), 7) : [], [city]);
  const tz = city?.timezone ?? "Asia/Kolkata";
  const first = hours[0];

  if (m === null) return <div className="app-body"><div className="empty card"><strong>This match isn&apos;t available any more.</strong><Link className="btn" href="/matches">Back to Chats</Link></div></div>;
  if (!m || !home) return <div className="app-body"><div className="skel" style={{ height: 420 }} /></div>;

  return (
    <div className="app-body" style={{ padding: "28px 24px calc(100px + env(safe-area-inset-bottom))", gap: 20 }}>
      <div className="stack" style={{ alignItems: "center", gap: 14, paddingTop: 12 }}>
        <div className="row" style={{ gap: 0 }}>
          <Avatar name={home.first_name} size={104} ring="#FFB020" />
          <div style={{ width: 56, display: "flex", justifyContent: "center" }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="#E0457B" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg></div>
          <Avatar name={m.first_name} photo={m.photo} size={104} ring="#FF7A9A" />
        </div>
        <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 30, fontWeight: 600, textAlign: "center", lineHeight: 1.15 }}>You both said yes.<br />Ab baat karo!</h1>
        <div className="row">
          {m.gunas != null && <span style={{ padding: "6px 12px", borderRadius: 999, background: "var(--saffron)", fontSize: 13, fontWeight: 700 }}>{m.gunas} of 36 Gunas</span>}
          {m.jodi_score != null && <span style={{ padding: "6px 12px", borderRadius: 999, background: "#fff", border: "1px solid var(--line)", fontSize: 13, fontWeight: 600 }}>Jodi Score {m.jodi_score}</span>}
        </div>
      </div>

      {first && (
        <section aria-label="Golden Hours" className="stack" style={{ gap: 6, padding: "14px 16px", borderRadius: 20, background: "var(--rose-soft)", border: "1px solid #FFC6D4" }}>
          <span style={{ font: "700 12px var(--sans)", letterSpacing: ".08em", color: "#A3164C" }}>A GOOD TIME TO SAY HI</span>
          <strong style={{ fontSize: 17 }}>{first.day} · {clockRange(first.start, first.end, tz)}</strong>
          <span style={{ fontSize: 13, color: "#8A3A55" }}>{BEST_FOR_LABEL[first.best_for]} in {city?.name}. More Golden Hours are in your chat.</span>
        </section>
      )}
      <div className="grow" />
      <div className="stack" style={{ gap: 10 }}>
        <Link href={`/chat/${m.match_id}`} className="btn">Say hi to {m.first_name}</Link>
        <Link href={`/chat/${m.match_id}?opener=1`} className="btn ghost">Stuck? Get an opener idea</Link>
        <div className="row" style={{ justifyContent: "center", gap: 16, fontSize: 12, color: "var(--muted)", paddingTop: 4 }}>
          <Link href={`/share-date?match=${m.match_id}`} style={{ color: "var(--muted)" }}>Share date with a friend</Link>
        </div>
      </div>
    </div>
  );
}
