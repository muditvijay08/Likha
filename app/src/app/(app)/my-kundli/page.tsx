"use client";
// S5 My Kundli (chart, planets, Mahadasha timeline) and E5 Who Suits Me (paid; best Moon signs and nakshatras come from the Guna table).
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BackButton, ErrorNote, Primary, useAction } from "@/components/ui";
import { KundliChart, signIndex } from "@/components/KundliChart";
import { price, useApp } from "@/components/app";
import { api, type MyChart, type ReadingFull } from "@/lib/api";
import { NAKSHATRAS, SIGNS } from "@/lib/moon";

const ORDER = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];

function Kundli() {
  const q = useSearchParams();
  const router = useRouter();
  const { prices, reload } = useApp();
  const [tab, setTab] = useState<"chart" | "suits">(q.get("tab") === "suits" ? "suits" : "chart");
  const [c, setC] = useState<MyChart | null | undefined>(undefined);
  const [r, setR] = useState<ReadingFull | null | undefined>(undefined);
  const { busy, error, run } = useAction();

  useEffect(() => { api().myChart().then(setC).catch(() => setC(null)); }, []);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      const item = (await api().myReadings()).find((x) => x.kind === "who_suits_me" && x.status !== "refunded");
      const v = item ? await api().readingView(item.id) : null;
      if (stop) return; setR(v);
      if (v?.status === "generating") setTimeout(load, 2500);
    };
    load().catch(() => setR(null));
    return () => { stop = true; };
  }, [busy]);

  const buy = () => run(async () => { await api().startReading("who_suits_me"); await reload(); });
  const sortFirst = () => run(async () => { await api().setSuitsSort(true); router.push("/discover"); });
  const pl = (name: string) => c?.planets.find((p) => p.planet === name);
  const sname = (p?: { sign: number; sign_name: string }) => p ? (p.sign_name || SIGNS[p.sign]) : "–";
  const now = new Date().toISOString().slice(0, 10);

  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/menu" /><h1>My Kundli</h1></div>
      <div role="tablist" className="seg">
        <button role="tab" aria-selected={tab === "chart"} aria-checked={tab === "chart"} onClick={() => setTab("chart")}>My Kundli</button>
        <button role="tab" aria-selected={tab === "suits"} aria-checked={tab === "suits"} onClick={() => setTab("suits")}>Who Suits Me</button>
      </div>

      {tab === "chart" ? (c === undefined ? <div className="skel" style={{ height: 400 }} /> : !c ? (
        <div className="empty card"><strong>Your kundli is still being made</strong><span className="sub">It usually takes a few seconds. Check back soon.</span></div>
      ) : <>
        <div className="card stack" style={{ alignItems: "center", gap: 10, borderRadius: 22 }}>
          <KundliChart lagnaSign={signIndex(c.summary.lagna)} planets={c.planets} />
          <div className="row" style={{ flexWrap: "wrap", justifyContent: "center", gap: 12, fontSize: 13 }}>
            <span><span style={{ color: "var(--muted)" }}>Lagna</span> <strong>{c.summary.lagna}</strong></span>
            <span><span style={{ color: "var(--muted)" }}>Moon</span> <strong>{c.summary.moon_sign}</strong></span>
            <span><span style={{ color: "var(--muted)" }}>Nakshatra</span> <strong>{c.summary.nakshatra} {c.summary.pada}</strong></span>
            <span><span style={{ color: "var(--muted)" }}>Manglik</span> <strong>{c.summary.manglik ? "Yes" : "No"}</strong></span>
          </div>
          {c.summary.borderline && <span className="small">Your birth time is near a boundary: a few minutes could change one detail.</span>}
        </div>
        <section aria-label="Planets" className="listcard" style={{ fontSize: 13 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: ".06em", padding: "10px 16px" }}><span style={{ flex: 1 }}>PLANET</span><span style={{ flex: 1 }}>SIGN</span><span style={{ width: 50, textAlign: "right" }}>HOUSE</span></div>
          {ORDER.map((n) => pl(n) && (
            <div key={n} style={{ padding: "10px 16px" }}><span style={{ flex: 1, fontWeight: 600 }}>{n}{pl(n)!.retro ? " (R)" : ""}</span><span style={{ flex: 1 }}>{sname(pl(n))}</span><span style={{ width: 50, textAlign: "right" }}>{pl(n)!.house}</span></div>
          ))}
          {pl("Rahu") && <div style={{ padding: "10px 16px" }}><span style={{ flex: 1, fontWeight: 600 }}>Rahu / Ketu</span><span style={{ flex: 1 }}>{sname(pl("Rahu"))} / {sname(pl("Ketu"))}</span><span style={{ width: 50, textAlign: "right" }}>{pl("Rahu")!.house} / {pl("Ketu")?.house}</span></div>}
        </section>
        {c.mahadashas && c.mahadashas.length > 0 && (
          <section aria-label="Dasha timeline" className="stack" style={{ gap: 8 }}>
            <span className="label">Dasha timeline</span>
            <div className="row" style={{ gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
              {c.mahadashas.filter((m) => m.end >= now).slice(0, 4).concat(c.mahadashas.filter((m) => m.end < now).slice(-1)).sort((a, b) => a.start.localeCompare(b.start)).map((m) => {
                const cur = m.start <= now && now < m.end;
                return <span key={m.start} style={{ flex: "none", padding: "8px 12px", borderRadius: 12, fontSize: 12, fontWeight: cur ? 700 : 600,
                  background: cur ? "var(--saffron)" : m.end < now ? "#F3EEFF" : "#fff", border: cur ? 0 : "1px solid var(--line)", color: m.end < now ? "var(--muted)" : "var(--ink)" }}>
                  {m.lord}{cur ? ` · now to ${m.end.slice(0, 4)}` : ` · ${m.start.slice(0, 4)}`}</span>;
              })}
            </div>
            {c.dasha && <span className="small">Now: {c.dasha.maha} Mahadasha, {c.dasha.antar} Antardasha until {new Date(c.dasha.antar_end).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}.</span>}
          </section>
        )}
      </>) : r === undefined ? <div className="skel" style={{ height: 300 }} /> : !r ? (
        <div className="card stack" style={{ gap: 10, borderRadius: 20 }}>
          <h2 className="serif" style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>The partner your chart is looking for</h2>
          <span className="sub">The Moon signs and nakshatras that score best with yours on the 36-point Guna match, and what your 7th house asks for.</span>
          <ErrorNote error={error} />
          <Primary onClick={buy} busy={busy}>See who suits me · {price(prices, "who_suits_me", 49)} credits</Primary>
          <span className="small">If it can&apos;t be written, your credits come back.</span>
        </div>
      ) : <>
        {r.status === "generating" && <div className="card row" style={{ gap: 12 }}><span className="spinner" aria-hidden="true" /><span className="sub">Writing your reading…</span></div>}
        {r.content && <h2 className="serif" style={{ margin: 0, fontSize: 22, fontWeight: 600, lineHeight: 1.25 }}>{r.content.title}</h2>}
        {r.suits && <>
          <div className="stack"><span className="label">Best Moon signs for you</span>
            <div className="chips">{r.suits.moon_signs.map((s, i) => <span key={s} className="chip sm" aria-pressed={i === 0} style={{ display: "inline-flex", alignItems: "center" }}>{SIGNS[s]}</span>)}</div></div>
          <div className="stack"><span className="label">Nakshatras that click</span>
            <div className="chips">{r.suits.nakshatras.map((n) => <span key={n} className="chip sm" style={{ display: "inline-flex", alignItems: "center", background: "var(--rose-soft)", borderColor: "#FFC6D4" }}>{NAKSHATRAS[n]}</span>)}</div></div>
        </>}
        {r.content?.sections.map((s) => <section key={s.heading} className="stack" style={{ padding: "14px 16px", borderRadius: 18, background: "#F3EEFF", gap: 6, fontSize: 13, lineHeight: 1.5 }}>
          <strong style={{ fontSize: 14 }}>{s.heading}</strong><span>{s.body}</span></section>)}
        <ErrorNote error={error} />
        <Primary onClick={sortFirst} busy={busy}>Show me these people first</Primary>
        <span className="small" style={{ textAlign: "center" }}>Sorts Discover by this. Everyone else still shows. <Link href="/filters">Filters</Link></span>
      </>}
    </div>
  );
}
export default function MyKundli() { return <Suspense><Kundli /></Suspense>; }
