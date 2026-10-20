"use client";
// M5 Golden Hours for one match: the next windows, a 14-day first-date calendar, and today's Rahu Kaal.
// Venus and Moon horas suit chats, Jupiter horas (Fri–Sun daytime) suit a first date; none fall in Rahu Kaal.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BackButton, ErrorNote, useAction } from "@/components/ui";
import { Info, LockIcon, price, useApp, useTried } from "@/components/app";
import { api, type MatchRow } from "@/lib/api";
import { BEST_FOR_LABEL, clockRange, dayPlan, goldenHours, range } from "@/lib/panchang";

export default function Golden() {
  const { id } = useParams<{ id: string }>();
  const { home, prices, reload } = useApp();
  const [m, setM] = useState<MatchRow | null>(null);
  const [open, setOpen] = useState(false);
  const { busy, error, run } = useAction();
  const tried = useTried();
  useEffect(() => { tried("golden_hours", "Golden Hours"); }, [tried]);
  useEffect(() => {
    api().matches().then((all) => setM(all.find((x) => x.match_id === id) ?? null)).catch(() => {});
    api().goldenUnlocked(id).then(setOpen).catch(() => {});
  }, [id]);

  const city = home?.city;
  const tz = city?.timezone ?? "Asia/Kolkata";
  const hours = useMemo(() => city ? goldenHours(city.lat, city.lng, city.timezone, new Date(), 14) : [], [city]);
  const plan = useMemo(() => city ? dayPlan(city.lat, city.lng, city.timezone) : null, [city]);
  const dkey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const days = useMemo(() => Array.from({ length: 14 }, (_, k) => new Date(Date.now() + k * 864e5)), []);
  const best = new Set(hours.filter((h) => h.best_for === "first_date").map((h) => dkey(h.start)));
  const good = new Set(hours.filter((h) => h.best_for === "deep_chat").map((h) => dkey(h.start)));
  const fmtDay = (d: Date, k: number) => k === 0 ? `Tonight, ${new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(d)}`
    : new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(d);
  const list = [hours[0], hours.find((h) => h.best_for === "deep_chat" && h !== hours[0]), hours.find((h) => h.best_for === "first_date")].filter(Boolean) as typeof hours;
  const unlock = () => run(async () => { await api().unlockGolden(id); setOpen(true); await reload(); });
  const name = m?.first_name ?? "your match";

  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar">
        <BackButton href={`/chat/${id}`} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 24, fontWeight: 600 }}>Golden Hours<Info cls="tip-r" text="Planetary hours (horas) for your city: Venus and Moon for chats, Jupiter for a first date. Never inside Rahu Kaal." /></h1>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>You and {name} · best times in {city?.name ?? "your city"}</span>
        </div>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        {list.map((h, i) => {
          const locked = i > 0 && !open;
          return (
            <div key={h.start.toISOString()} className="row" style={{ justifyContent: "space-between", padding: "12px 14px", borderRadius: 16,
              background: i === 0 ? "var(--rose-soft)" : "#fff", border: i === 0 ? "1px solid #FFC6D4" : "1px solid var(--line)" }}>
              <span className="stack" style={{ gap: 2 }}><strong style={{ fontSize: 14 }}>{locked ? (h.best_for === "first_date" ? "Best day for a first date" : "Next deep-chat window") : fmtDay(h.start, h.day === "Tonight" ? 0 : 1)}</strong>
                <span style={{ fontSize: 12, color: i === 0 ? "#8A3A55" : "var(--muted)" }}>{BEST_FOR_LABEL[h.best_for]}</span></span>
              {locked ? <LockIcon /> : <strong style={{ fontSize: 15, color: i === 0 ? "#D6336C" : "var(--ink)" }}>{clockRange(h.start, h.end, tz)}</strong>}
            </div>
          );
        })}
      </div>

      <section aria-label="Next 14 days" className="lockbox" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 20 }}>
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }} aria-hidden={!open || undefined}>
          <strong style={{ fontSize: 14 }}>Best day for a first date</strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6, textAlign: "center", fontSize: 12 }}>
            {days.slice(0, 7).map((d) => <span key={`h${d.getTime()}`} style={{ color: "var(--muted)" }}>{new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "narrow" }).format(d)}</span>)}
            {days.map((d, k) => {
              const key = dkey(d), b = open && best.has(key), g = open && !b && good.has(key);
              return <span key={key} style={{ padding: "8px 0", borderRadius: 10, fontWeight: k === 0 || b || g ? 700 : 400,
                background: b ? "var(--saffron)" : g ? "var(--rose-soft)" : k === 0 ? "#F3EEFF" : "transparent", color: g ? "var(--rose-ink)" : "var(--ink)" }}>
                {new Intl.DateTimeFormat("en-IN", { timeZone: tz, day: "numeric" }).format(d)}</span>;
            })}
          </div>
          <div className="row" style={{ gap: 14, fontSize: 11, color: "var(--muted)" }}>
            <span className="row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--saffron)" }} />Best (Jupiter hora)</span>
            <span className="row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--rose-soft)", border: "1px solid #FFC6D4" }} />Good (Venus evening)</span>
          </div>
        </div>
        {!open && (
          <div className="veil">
            <LockIcon color="#8A4300" /><strong>Every window for 14 days, for both of you</strong>
            <button type="button" onClick={unlock} disabled={busy} className="btn" style={{ maxWidth: 260, height: 48, fontSize: 15 }}>{busy ? "Unlocking…" : `Unlock all · ${price(prices, "golden_hours", 19)} credits`}</button>
          </div>
        )}
      </section>
      <ErrorNote error={error} />

      {plan && <div className="row" style={{ gap: 10, padding: "12px 14px", borderRadius: 16, background: "#F3EEFF", fontSize: 13 }}>
        <span>Avoid big talks during Rahu Kaal today, {range(plan.rahu[0], plan.rahu[1])}.</span></div>}
      <div className="grow" />
      <Link href={`/chat/${id}`} className="btn">{hours[0]?.day === "Tonight" ? `Text ${name} in tonight's window` : `Message ${name}`}</Link>
      <span className="small" style={{ textAlign: "center" }}>Tendencies, not rules. Any time you both want to talk is a good time.</span>
    </div>
  );
}
