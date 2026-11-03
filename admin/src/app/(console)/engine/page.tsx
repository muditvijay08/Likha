"use client";
// Engine check: enter two births, see what Likha's kundli engine computes (positions, 8 kootas, doshas, Jodi Score),
// and compare it with AstroSage or Drik Panchang. Runs the live kundli service through admin-ops; nothing is stored.
import { useState } from "react";
import { useAction, useAdmin } from "@/components/shell";
import { Kpi, Page, Status } from "@/components/ui";
import { api } from "@/lib/api";
import type { BirthInput, EngineChart, EngineCheck } from "@/lib/types";

const CITIES: [string, number, number][] = [
  ["Jaipur", 26.9124, 75.7873], ["Delhi", 28.6139, 77.209], ["Mumbai", 19.076, 72.8777], ["Kolkata", 22.5726, 88.3639],
  ["Bengaluru", 12.9716, 77.5946], ["Chennai", 13.0827, 80.2707], ["Hyderabad", 17.385, 78.4867], ["Ahmedabad", 23.0225, 72.5714],
  ["Lucknow", 26.8467, 80.9462], ["Pune", 18.5204, 73.8567], ["Jodhpur", 26.2389, 73.0243], ["Udaipur", 24.5854, 73.7125],
];
const KOOTAS: [string, string, number, string][] = [
  // key, name, max, which detail each side shows
  ["varna", "Varna", 1, "varna"], ["vashya", "Vashya", 2, "vashya"], ["tara", "Tara", 3, "nakshatra"], ["yoni", "Yoni", 4, "yoni"],
  ["graha_maitri", "Graha Maitri", 5, "sign_lord"], ["gana", "Gana", 6, "gana"], ["bhakoot", "Bhakoot", 7, "sign"], ["nadi", "Nadi", 8, "nadi"],
];
type Form = { date: string; time: string; city: string; lat: string; lng: string; tz: string };
const blank = (date: string, time: string, city: string): Form => {
  const c = CITIES.find((x) => x[0] === city)!;
  return { date, time, city, lat: String(c[1]), lng: String(c[2]), tz: "Asia/Kolkata" };
};
const toBirth = (f: Form, gender: "man" | "woman"): BirthInput => ({ date: f.date, time: f.time, lat: Number(f.lat), lng: Number(f.lng), tz: f.tz.trim(), gender });
const dms = (deg: number) => { const d = Math.floor(deg), m = Math.floor((deg - d) * 60); return `${d}°${String(m).padStart(2, "0")}′`; };
const pts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function Person({ who, f, set }: { who: string; f: Form; set: (f: Form) => void }) {
  const pick = (city: string) => {
    const c = CITIES.find((x) => x[0] === city);
    set(c ? { ...f, city, lat: String(c[1]), lng: String(c[2]), tz: "Asia/Kolkata" } : { ...f, city });
  };
  return (
    <fieldset className="card stack" aria-label={who} style={{ flex: "1 1 min(320px,100%)", margin: 0, minWidth: 0 }}>
      <h2>{who}</h2>
      <div className="row">
        <label className="f grow">Date of birth<input className="input" type="date" aria-label={`${who} date`} value={f.date} onChange={(e) => set({ ...f, date: e.target.value })} /></label>
        <label className="f grow">Time (24-hour)<input className="input" type="time" aria-label={`${who} time`} value={f.time} onChange={(e) => set({ ...f, time: e.target.value })} /></label>
      </div>
      <label className="f">Place<select className="input" aria-label={`${who} place`} value={f.city} onChange={(e) => pick(e.target.value)}>
        {CITIES.map(([c]) => <option key={c}>{c}</option>)}<option value="other">Other place…</option></select></label>
      {f.city === "other" && <div className="row">
        <label className="f grow">Latitude<input className="input" inputMode="decimal" aria-label={`${who} latitude`} value={f.lat} onChange={(e) => set({ ...f, lat: e.target.value })} /></label>
        <label className="f grow">Longitude<input className="input" inputMode="decimal" aria-label={`${who} longitude`} value={f.lng} onChange={(e) => set({ ...f, lng: e.target.value })} /></label>
        <label className="f grow">Time zone<input className="input" aria-label={`${who} time zone`} value={f.tz} onChange={(e) => set({ ...f, tz: e.target.value })} /></label>
      </div>}
    </fieldset>
  );
}

function Chart({ who, c }: { who: string; c: EngineChart }) {
  const m = c.manglik;
  return (
    <section className="card flush" aria-label={`${who} positions`} style={{ flex: "1 1 min(380px,100%)", minWidth: 0 }}>
      <div style={{ padding: "14px 16px 6px" }} className="stack">
        <h2>{who}</h2>
        <span className="small">Lagna <strong>{c.summary.lagna}</strong> · Moon <strong>{c.summary.moon_sign}</strong>, {c.summary.nakshatra} pada {c.summary.pada}
          {c.summary.current_dasha ? ` · Dasha ${c.summary.current_dasha}` : ""}</span>
        <span className="small">Manglik: <strong>{m.effective ? `yes (${m.strength})` : m.present ? "present but cancelled" : "no"}</strong>
          {m.reason ? ` · ${m.reason}` : ` · Mars in house ${m.from_lagna} from Lagna, ${m.from_moon} from Moon`}{m.cancelled_by ? ` · cancelled: ${m.cancelled_by}` : ""}</span>
        {c.summary.borderline && <span className="small" role="note">⚠️ Moon is within minutes of a nakshatra edge: a birth time a few minutes off changes the result.</span>}
      </div>
      <div style={{ overflowX: "auto" }}><table className="t"><thead><tr><th>Graha</th><th>Sign</th><th>Degree</th><th>Nakshatra</th><th>House</th></tr></thead>
        <tbody>{c.planets.map((p) => <tr key={p.planet}><td><strong>{p.planet}</strong>{p.retro && p.planet !== "Rahu" && p.planet !== "Ketu" ? " (R)" : ""}</td>
          <td>{p.sign}</td><td className="mono">{dms(p.deg)}</td><td>{p.nakshatra} {p.pada}</td><td>{p.house}</td></tr>)}</tbody></table></div>
    </section>
  );
}

function summaryText(r: EngineCheck) {
  const k = KOOTAS.map(([key, name, max]) => `${name} ${pts(r.milan.kootas[key])}/${max}`).join(", ");
  return [`Likha engine ${r.engine ?? ""} rules ${r.rules ?? r.milan.rules_version} (Lahiri, North Indian Ashtakoota)`,
    `Boy: Moon ${r.boy.summary.moon_sign}, ${r.boy.summary.nakshatra} pada ${r.boy.summary.pada}, Lagna ${r.boy.summary.lagna}`,
    `Girl: Moon ${r.girl.summary.moon_sign}, ${r.girl.summary.nakshatra} pada ${r.girl.summary.pada}, Lagna ${r.girl.summary.lagna}`,
    `${k}. Total ${pts(r.milan.total)}/36${r.milan.adjusted_total !== r.milan.total ? `, after cancellations ${pts(r.milan.adjusted_total)}` : ""}. Jodi Score ${r.jodi_score}.`].join("\n");
}

export default function Engine() {
  const { toast } = useAdmin();
  const [boy, setBoy] = useState<Form>(blank("1995-03-14", "06:30", "Jaipur"));
  const [girl, setGirl] = useState<Form>(blank("1997-11-02", "21:15", "Delhi"));
  const [r, setR] = useState<EngineCheck | null>(null);
  const { busy, error, run } = useAction();
  const check = () => run(async () => { setR(null); setR(await api().engineCheck(toBirth(boy, "man"), toBirth(girl, "woman"))); });
  const doshas = r ? Object.entries(r.milan.doshas).filter(([, d]) => d.present) : [];
  return (
    <Page title="Engine check" sub="Two births in, exactly what Likha's kundli engine computes out. Use it to compare with AstroSage or Drik Panchang. Nothing is saved; only the fact that a check ran goes in the audit log.">
      <form className="stack" onSubmit={(e) => { e.preventDefault(); check(); }}>
        <div className="row" style={{ alignItems: "stretch" }}><Person who="Boy" f={boy} set={setBoy} /><Person who="Girl" f={girl} set={setGirl} /></div>
        <div className="row"><button className="btn" disabled={busy}>{busy ? "Checking…" : "Check"}</button>
          <span className="small">Times are local to the place. Lahiri ayanamsa, NASA JPL DE421 positions.</span></div>
        {error && <p className="err" role="alert">{error}</p>}
      </form>
      {r && <>
        {r.sample && <p className="card small" role="note">Demo admin: there is no kundli service here, so this is the one sample pair (Jaipur 14 Mar 1995 06:30, Delhi 2 Nov 1997 21:15) as computed by the real engine, not your inputs.</p>}
        <div className="kpis">
          <Kpi k="Guna Milan" v={`${pts(r.milan.total)} / 36`} s={r.milan.adjusted_total !== r.milan.total ? `${pts(r.milan.adjusted_total)} after dosha cancellations` : "no cancellations"} />
          <Kpi k="Jodi Score" v={r.jodi_score} s="Gunas + Manglik fit + Moon–Venus" />
          <Kpi k="Doshas" v={doshas.length ? doshas.filter(([, d]) => !d.cancelled).length : 0} s={doshas.length ? `${doshas.length} found, ${doshas.filter(([, d]) => d.cancelled).length} cancelled` : "none found"} alert={doshas.some(([, d]) => !d.cancelled)} />
          <Kpi k="Engine" v={<span className="mono">{r.rules ?? r.milan.rules_version}</span>} s={r.engine ?? ""} />
        </div>
        {r.borderline && <p className="card small" role="note">⚠️ One Moon sits on a nakshatra edge. Other sites may show the neighbouring nakshatra if their birth time or ayanamsa differs slightly.</p>}
        <section className="card flush" aria-label="Kootas"><div style={{ overflowX: "auto" }}><table className="t">
          <thead><tr><th>Koota</th><th>Boy</th><th>Girl</th><th>Score</th></tr></thead>
          <tbody>{KOOTAS.map(([key, name, max, d]) => <tr key={key}><td><strong>{name}</strong></td>
            <td>{String(r.milan.details.boy[d] ?? "")}{d === "nakshatra" ? ` ${r.milan.details.boy.pada}` : ""}</td>
            <td>{String(r.milan.details.girl[d] ?? "")}{d === "nakshatra" ? ` ${r.milan.details.girl.pada}` : ""}</td>
            <td><strong>{pts(r.milan.kootas[key])}</strong> / {max}</td></tr>)}
            <tr><td><strong>Total</strong></td><td /><td /><td><strong>{pts(r.milan.total)}</strong> / 36</td></tr></tbody></table></div></section>
        <section className="card stack" aria-label="Doshas"><h2>Doshas</h2>
          {doshas.length === 0 ? <span className="small">No Bhakoot, Gana or Nadi dosha.</span> : doshas.map(([k, d]) => <div key={k} className="row">
            <Status s={d.cancelled ? "active" : "failed"} text={d.cancelled ? "Cancelled" : "Present"} />
            <strong>{k[0].toUpperCase() + k.slice(1)} dosha</strong>{d.pair && <span className="small">({d.pair})</span>}
            {d.reason && <span className="small">{d.reason}</span>}</div>)}
        </section>
        <div className="row" style={{ alignItems: "stretch" }}><Chart who="Boy" c={r.boy} /><Chart who="Girl" c={r.girl} /></div>
        <section className="card stack" aria-label="Compare"><h2>Compare with other sites</h2>
          <span className="small">Enter the same births on <a href="https://www.astrosage.com/" target="_blank" rel="noreferrer">AstroSage</a> or <a href="https://www.drikpanchang.com/" target="_blank" rel="noreferrer">Drik Panchang</a> (Kundli matching, Lahiri, North Indian). Moon sign, nakshatra and pada should match exactly, and most kootas too.</span>
          <span className="small">Expected differences, from the full cross-check (kundli/CROSSCHECK.md): sites differ on the Vashya table and on where Sagittarius and Capricorn split, and some put Taurus, Virgo and Capricorn in a different Varna. Dosha cancellation rules also vary by site, so compare the total before cancellations.</span>
          <div className="row"><button type="button" className="btn ghost sm" onClick={() => navigator.clipboard.writeText(summaryText(r)).then(() => toast("Copied"), () => toast("Couldn't copy"))}>Copy summary</button></div>
        </section>
      </>}
    </Page>
  );
}
