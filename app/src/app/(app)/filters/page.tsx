"use client";
// D3 Filters. Saved as you change them; the button shows how many people the filters let through right now.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BackButton, ErrorNote } from "@/components/ui";
import { api, type Filters, type Goal } from "@/lib/api";

const DEFAULTS: Filters = { age_min: 21, age_max: 35, distance: "same_city", diets: [], goals: ["dating", "matchmaking"], languages: [],
  height_min_cm: null, height_max_cm: null, active_this_week: true, has_voice_intro: false };
const LANGS = ["Hindi", "English", "Marwari", "Gujarati", "Punjabi", "Marathi", "Bengali", "Tamil", "Telugu", "Urdu"];
const DIETS = [["vegetarian", "Vegetarian"], ["jain", "Jain"], ["eggetarian", "Eggetarian"], ["non_veg", "Non-veg"]] as const;
const HEIGHTS: [number | null, string][] = [[null, "Any"], [152, "5′0″+"], [160, "5′3″+"], [168, "5′6″+"], [175, "5′9″+"], [183, "6′0″+"]];
const row = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--line-soft)", fontSize: 14 } as const;
const toggle = <T,>(xs: T[], x: T) => xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x];

export default function FiltersPage() {
  const [f, setF] = useState<Filters | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [langs, setLangs] = useState(false);
  const first = useRef(true);

  useEffect(() => { api().filters().then(setF).catch(() => setF(DEFAULTS)); }, []);
  useEffect(() => {
    if (!f) return;
    const t = setTimeout(async () => {
      try {
        if (!first.current) await api().saveFilters(f);
        first.current = false;
        setCount(await api().discoverCount());
        setError(null);
      } catch (e) { setError(e instanceof Error ? e.message : "Could not save filters."); }
    }, first.current ? 0 : 400);
    return () => clearTimeout(t);
  }, [f]);

  if (!f) return <div className="app-body pad"><div className="skel" style={{ height: 400 }} /></div>;
  const set = (x: Partial<Filters>) => setF({ ...f, ...x });
  const lo = 18, hi = 60, left = ((f.age_min - lo) / (hi - lo)) * 100, right = ((f.age_max - lo) / (hi - lo)) * 100;

  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <BackButton href="/discover" />
        <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 24, fontWeight: 600 }}>Filters</h1>
        <button type="button" onClick={() => setF({ ...DEFAULTS })} style={{ height: 44, padding: "0 8px", background: "transparent", border: 0, color: "var(--link)", font: "700 14px var(--sans)" }}>Reset</button>
      </div>

      <div className="listcard" style={{ display: "flex" }}>
        <div style={{ ...row, flexDirection: "column", alignItems: "stretch", gap: 10 }}>
          <div className="row" style={{ justifyContent: "space-between" }}><span>Age</span><strong>{f.age_min} to {f.age_max}</strong></div>
          <div className="range">
            <div className="rail" /><div className="sel" style={{ left: `${left}%`, width: `${right - left}%` }} />
            <input type="range" aria-label="Youngest age" min={lo} max={hi} value={f.age_min} onChange={(e) => set({ age_min: Math.min(Number(e.target.value), f.age_max - 1) })} />
            <input type="range" aria-label="Oldest age" min={lo} max={hi} value={f.age_max} onChange={(e) => set({ age_max: Math.max(Number(e.target.value), f.age_min + 1) })} />
          </div>
        </div>
        <div style={row}><span>Distance</span>
          <span role="radiogroup" aria-label="Distance" style={{ display: "flex", gap: 4, padding: 3, borderRadius: 10, background: "#ECE6FA" }}>
            {([["same_city", "Same city"], ["any_city", "Any city"]] as const).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={f.distance === v} onClick={() => set({ distance: v })}
                style={{ padding: "4px 10px", borderRadius: 8, border: 0, background: f.distance === v ? "#fff" : "transparent", font: `${f.distance === v ? 700 : 500} 13px var(--sans)`, color: f.distance === v ? "var(--ink)" : "#3D3560" }}>{l}</button>
            ))}
          </span>
        </div>
        <label style={row} htmlFor="f-height"><span>Height</span>
          <select id="f-height" value={f.height_min_cm ?? ""} onChange={(e) => set({ height_min_cm: e.target.value ? Number(e.target.value) : null })}
            style={{ border: 0, background: "transparent", font: "700 14px var(--sans)", color: "var(--ink)", textAlign: "right" }}>
            {HEIGHTS.map(([v, l]) => <option key={l} value={v ?? ""}>{l}</option>)}
          </select>
        </label>
        <div style={{ ...row, flexDirection: "column", alignItems: "stretch", gap: 8, borderBottom: 0 }}>
          <button type="button" aria-expanded={langs} onClick={() => setLangs(!langs)} className="row"
            style={{ justifyContent: "space-between", background: "none", border: 0, padding: 0, font: "inherit", color: "inherit" }}>
            <span>Languages</span><strong>{f.languages.length ? f.languages.join(", ") : "Any"} {langs ? "▴" : "▾"}</strong></button>
          {langs && <div className="chips">{LANGS.map((l) => <button key={l} type="button" className="chip sm" aria-pressed={f.languages.includes(l)} onClick={() => set({ languages: toggle(f.languages, l) })}>{l}</button>)}</div>}
        </div>
      </div>

      <div className="stack">
        <span className="label">Looking for</span>
        <div className="chips">
          {([["dating", "Dating"], ["matchmaking", "Matchmaking"]] as [Goal, string][]).map(([v, l]) => (
            <button key={v} type="button" className="chip sm" aria-pressed={f.goals.includes(v)} onClick={() => { const g = toggle(f.goals, v); set({ goals: g.length ? g : [v] }); }}>{l}</button>
          ))}
        </div>
      </div>
      <div className="stack">
        <span className="label">Diet</span>
        <div className="chips">
          <button type="button" className="chip sm" aria-pressed={f.diets.length === 0} onClick={() => set({ diets: [] })}>Any</button>
          {DIETS.map(([v, l]) => <button key={v} type="button" className="chip sm" aria-pressed={f.diets.includes(v)} onClick={() => set({ diets: toggle(f.diets, v) })}>{l}</button>)}
        </div>
      </div>

      <div className="listcard">
        <label htmlFor="f-active" style={{ padding: "12px 16px" }}>Active this week
          <input id="f-active" type="checkbox" checked={f.active_this_week} onChange={(e) => set({ active_this_week: e.target.checked })} style={{ width: 22, height: 22, margin: 0, accentColor: "var(--link)" }} /></label>
        <label htmlFor="f-voice" style={{ padding: "12px 16px" }}>Has a voice intro
          <input id="f-voice" type="checkbox" checked={f.has_voice_intro} onChange={(e) => set({ has_voice_intro: e.target.checked })} style={{ width: 22, height: 22, margin: 0, accentColor: "var(--link)" }} /></label>
      </div>
      <span className="small">Manglik status shows on profiles. It&apos;s never used as a filter.</span>
      <ErrorNote error={error} />
      <div className="grow" />
      <Link href="/discover" className="btn">{count === null ? "Show people" : count === 0 ? "Nobody yet. Try widening" : `Show ${count}${count >= 500 ? "+" : ""} ${count === 1 ? "person" : "people"}`}</Link>
    </div>
  );
}
