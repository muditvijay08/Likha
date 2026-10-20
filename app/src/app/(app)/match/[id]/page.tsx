"use client";
// M1 It's a match. Golden Hours: Venus and Moon horas for chats, Jupiter horas for a first date, never in Rahu Kaal.
// The first window is free; "Unlock all" costs once per match and opens it for both of you.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ErrorNote, useAction } from "@/components/ui";
import { Avatar, LockIcon, price, useApp } from "@/components/app";
import { api, type MatchRow } from "@/lib/api";
import { BEST_FOR_LABEL, clockRange, goldenHours } from "@/lib/panchang";

export default function Match() {
  const { id } = useParams<{ id: string }>();
  const { home, prices, reload } = useApp();
  const [m, setM] = useState<MatchRow | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const { busy, error, run } = useAction();
  useEffect(() => {
    api().matches().then((all) => setM(all.find((x) => x.match_id === id) ?? null)).catch(() => setM(null));
    api().goldenUnlocked(id).then(setOpen).catch(() => {});
  }, [id]);

  const city = home?.city;
  const hours = useMemo(() => city ? goldenHours(city.lat, city.lng, city.timezone, new Date(), 7) : [], [city]);
  const tz = city?.timezone ?? "Asia/Kolkata";
  const first = hours[0];
  const date = hours.find((h) => h.best_for === "first_date");
  const rest = hours.filter((h) => h !== first && h !== date).slice(0, 3);
  const unlock = () => run(async () => { await api().unlockGolden(id); setOpen(true); await reload(); });

  if (m === null) return <div className="app-body"><div className="empty card"><strong>This match isn&apos;t available any more.</strong><Link className="btn" href="/matches">Back to Chats</Link></div></div>;
  if (!m || !home) return <div className="app-body"><div className="skel" style={{ height: 420 }} /></div>;

  const Row = ({ title, sub, time, hot }: { title: string; sub?: string; time?: string; hot?: boolean }) => (
    <div className="row" style={{ justifyContent: "space-between", padding: "12px 14px", borderRadius: 14, background: hot ? "var(--rose-soft)" : "#F6F2FF", border: hot ? "1px solid #FFC6D4" : 0 }}>
      <div className="stack" style={{ gap: 2 }}><span style={{ fontSize: 14, fontWeight: hot ? 700 : 600 }}>{title}</span>{sub && <span style={{ fontSize: 13, color: hot ? "#8A3A55" : "var(--muted)" }}>{sub}</span>}</div>
      {time ? <span style={{ fontSize: 15, fontWeight: 700, color: hot ? "#D6336C" : "var(--ink)", textAlign: "right" }}>{time}</span> : <LockIcon />}
    </div>
  );

  return (
    <div className="app-body" style={{ padding: "28px 24px calc(100px + env(safe-area-inset-bottom))", gap: 20 }}>
      <div className="stack" style={{ alignItems: "center", gap: 14, paddingTop: 12 }}>
        <div className="row" style={{ gap: 0 }}>
          <Avatar name={home.first_name} size={104} ring="#FFB020" />
          <div style={{ width: 56, display: "flex", justifyContent: "center" }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="#E0457B" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg></div>
          <Avatar name={m.first_name} photo={m.photo} size={104} ring="#FF7A9A" />
        </div>
        <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 30, fontWeight: 600, textAlign: "center", lineHeight: 1.15 }}>The planets approve.<br />Ab baat karo!</h1>
        <div className="row">
          {m.jodi_score != null && <span style={{ padding: "6px 12px", borderRadius: 999, background: "var(--saffron)", fontSize: 13, fontWeight: 700 }}>{m.jodi_score}% match</span>}
          {m.gunas != null && <span style={{ padding: "6px 12px", borderRadius: 999, background: "#fff", border: "1px solid var(--line)", fontSize: 13, fontWeight: 600 }}>{m.gunas} / 36 Gunas</span>}
        </div>
      </div>

      <section aria-label="Golden Hours" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 24, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 20, fontWeight: 600 }}>Golden Hours</h2>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Best times to talk in {city?.name}</span>
        </div>
        {first ? <Row hot title={first.day} sub={BEST_FOR_LABEL[first.best_for]} time={clockRange(first.start, first.end, tz)} /> : <span className="sub">No Golden Hour in the next few days.</span>}
        <Row title={date ? `Best day for a first date${open ? `: ${date.day}` : ""}` : "Best day for a first date"} time={open && date ? clockRange(date.start, date.end, tz) : undefined} />
        {open ? rest.map((h) => <Row key={h.start.toISOString()} title={h.day} sub={BEST_FOR_LABEL[h.best_for]} time={clockRange(h.start, h.end, tz)} />)
              : <Row title="Next 3 Golden Hours this week" />}
        {!open && <button type="button" onClick={unlock} disabled={busy} style={{ height: 48, borderRadius: 14, background: "transparent", border: "1.5px solid var(--saffron)", color: "var(--link)", font: "700 14px var(--sans)" }}>
          {busy ? "Unlocking…" : `Unlock all · ${price(prices, "golden_hours", 19)} credits`}</button>}
        {open && <span className="small">Unlocked for both of you.</span>}
        <ErrorNote error={error} />
      </section>

      <div className="grow" />
      <div className="stack" style={{ gap: 10 }}>
        <Link href={`/chat/${m.match_id}`} className="btn">Say hi to {m.first_name}</Link>
        <Link href={`/chat/${m.match_id}?opener=1`} className="btn ghost">Cupid opener · {price(prices, "cupid_opener", 15)} credits</Link>
        <div className="row" style={{ justifyContent: "center", gap: 16, fontSize: 12, color: "var(--muted)", paddingTop: 4 }}>
          <Link href={`/share-date?match=${m.match_id}`} style={{ color: "var(--muted)" }}>Share date with a friend</Link>
        </div>
      </div>
    </div>
  );
}
