"use client";
// E8 Travel Mode: appear in another city's Discover (and see it) for the dates of your trip. Your home city comes back after.
import { useEffect, useState } from "react";
import { PlaceInput } from "@/components/PlaceInput";
import { BackButton, ErrorNote, useAction } from "@/components/ui";
import { useApp, useTried } from "@/components/app";
import { api, type Place, type TravelCity, type TravelState } from "@/lib/api";
import { timezoneFor } from "@/lib/places";

const iso = (d: Date) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
const fmt = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function Travel() {
  const { reload } = useApp();
  const tried = useTried();
  const [t, setT] = useState<TravelState | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [city, setCity] = useState<TravelCity | null>(null);
  const [from, setFrom] = useState(iso(new Date())); const [to, setTo] = useState(iso(new Date(Date.now() + 3 * 864e5)));
  const { busy, error, run } = useAction();
  useEffect(() => { api().travel().then(setT).catch(() => {}); }, []);
  const pick = (p: Place) => { setPlace(p); setCity(null); run(async () => setCity(await api().travelCity(p, timezoneFor(p.lat, p.lng)))); };
  const start = () => run(async () => { await api().startTravel(city!.id, from, to); await reload(); setT(await api().travel()); tried("travel_mode", "Travel Mode"); });
  if (!t) return <div className="app-body pad"><div className="skel" style={{ height: 300 }} /></div>;
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/discover" /><h1>Travel Mode</h1></div>
      {t.trip ? <>
        <div style={{ padding: 18, borderRadius: 22, background: "#E4F4EE" }} className="stack">
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "#1F5E49" }}>TRAVEL MODE ON</span>
          <strong className="serif" style={{ fontSize: 24 }}>{t.trip.city}, {fmt(t.trip.from)} to {fmt(t.trip.to)}</strong>
          <span style={{ fontSize: 13 }}>Discover, Daily Kick timings and Golden Hours follow {t.trip.city} till then.</span>
        </div>
        <ErrorNote error={error} />
        <button type="button" className="btn ghost" disabled={busy} onClick={() => run(async () => { await api().endTravel(t.trip!.id); setT(await api().travel()); await reload(); })}>End trip now</button>
      </> : <>
        <p className="sub" style={{ margin: 0 }}>Going somewhere? Show up in that city&apos;s Discover for your dates and start matching before you land.</p>
        <PlaceInput id="t-city" label="Where to" value={place} onPick={pick} placeholder="Mumbai, Udaipur, Dubai…" />
        {city && (city.people > 0 ? (
          <div className="card stack" style={{ gap: 4, borderRadius: 18 }}><strong>{city.people} {city.people === 1 ? "person" : "people"} on Likha in {city.name}</strong>
            <span className="sub">{city.top_score ? `Your best Jodi Score there: ${city.top_score}%.` : "Jodi Scores show once you arrive in their Discover."}</span></div>
        ) : (
          <div className="card stack" style={{ gap: 4, borderRadius: 18 }}><strong>No one on Likha in {city.name} yet</strong>
            <span className="sub">We won&apos;t sell you a trip to an empty city.</span></div>
        ))}
        <div className="grid2">
          <div className="field"><label className="label" htmlFor="t-from">From</label><input id="t-from" type="date" className="input" min={iso(new Date())} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="field"><label className="label" htmlFor="t-to">To</label><input id="t-to" type="date" className="input" min={from} max={iso(new Date(Date.now() + 30 * 864e5))} value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <ErrorNote error={error} />
        <div className="grow" />
        <button type="button" className="btn" disabled={!city || city.people === 0 || busy || to < from} onClick={start}>Start trip · {t.price} credits</button>
        <span className="small" style={{ textAlign: "center" }}>While you&apos;re away, people at home don&apos;t see you. Your home city comes back the day after.</span>
      </>}
    </div>
  );
}
