"use client";
// P2 Edit profile: photos, about, lifestyle, prompts and bio, looking for. Birth details stay locked.
// Changing your name or main photo sends the profile to a person for a quick re-check.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BackButton, Chips, ErrorNote, Primary, useAction } from "@/components/ui";
import { DIET_LABEL, GOAL_LABEL, useApp } from "@/components/app";
import { api, type MyProfile, type ProfilePatch } from "@/lib/api";

const HEIGHTS = Array.from({ length: 31 }, (_, i) => 54 + i).map((inch) => ({ cm: Math.round(inch * 2.54), label: `${Math.floor(inch / 12)}′ ${inch % 12}″` }));
const EDU = ["High school", "Diploma", "Graduate", "Post-graduate", "Doctorate", "CA / CS / CFA", "Medicine", "Law"];
const LANGS = ["Hindi", "English", "Marwari", "Gujarati", "Punjabi", "Marathi", "Bengali", "Tamil", "Telugu", "Urdu"];
const opt = (xs: [string, string][]) => xs.map(([v, label]) => ({ v, label }));
const LIFE = {
  diet: opt([["vegetarian", "Vegetarian"], ["jain", "Jain"], ["eggetarian", "Eggetarian"], ["non_veg", "Non-veg"], ["vegan", "Vegan"]]),
  drinking: opt([["never", "Never"], ["socially", "Socially"], ["regularly", "Regularly"]]), smoking: opt([["never", "Never"], ["socially", "Socially"], ["regularly", "Regularly"]]),
  workout: opt([["daily", "Daily"], ["often", "Often"], ["sometimes", "Sometimes"], ["never", "Never"]]),
  kids: opt([["want", "Want"], ["dont_want", "Don't want"], ["have", "Have"], ["not_sure", "Not sure"]]), relocate: opt([["yes", "Yes"], ["maybe", "Maybe"], ["no", "No"]]),
};
type Section = "about" | "lifestyle" | "prompts" | "goal" | null;

export default function EditProfile() {
  const { reload } = useApp();
  const [p, setP] = useState<MyProfile | null>(null);
  const [open, setOpen] = useState<Section>(null);
  const [f, setF] = useState<ProfilePatch>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  const [slot, setSlot] = useState(1);
  const { busy, error, run } = useAction();
  const load = () => api().myProfile().then((x) => { setP(x); setAnswers(Object.fromEntries(x.prompts.map((q) => [q.key, q.answer]))); });
  useEffect(() => { load().catch(() => {}); }, []);

  const start = (s: Section) => { setOpen(open === s ? null : s); setF({}); setSaved(null); };
  const v = <K extends keyof ProfilePatch>(k: K) => (k in f ? f[k] : p?.[k as keyof MyProfile]) as ProfilePatch[K];
  const save = () => run(async () => {
    if (open === "prompts") {
      await api().saveVibe(Object.entries(answers).map(([key, answer]) => ({ key, answer })), p!.interests);
    }
    if (Object.keys(f).length) await api().saveProfile(f);
    await load(); await reload(); setOpen(null); setF({});
    setSaved(f.first_name && f.first_name !== p!.first_name ? "Saved. A person will quickly re-check your profile; your verified badge comes back after." : "Saved.");
  });
  const upload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fl = e.target.files?.[0]; e.target.value = "";
    if (!fl) return;
    run(async () => {
      if (fl.size > 8 * 1024 * 1024) throw new Error("That photo is over 8 MB.");
      await api().uploadPhoto(fl, slot); await load();
      if (slot === 1) setSaved("Main photo changed. A person will quickly re-check it; your verified badge comes back after.");
    });
  };
  const remove = (id: string) => run(async () => {
    if (p!.photos.length <= 2) throw new Error("Keep at least 2 photos.");
    await api().removePhoto(id); await load();
  });

  if (!p) return <div className="app-body pad"><div className="skel" style={{ height: 500 }} /></div>;
  const rows: [Section, string, string][] = [
    ["about", "About", [p.first_name, HEIGHTS.find((h) => h.cm === p.height_cm)?.label, p.profession, p.city].filter(Boolean).join(" · ")],
    ["lifestyle", "Lifestyle", [p.diet && DIET_LABEL[p.diet], p.drinking && `Drinks ${p.drinking}`, p.smoking === "never" ? "Never smokes" : p.smoking && `Smokes ${p.smoking}`].filter(Boolean).join(" · ") || "Add your lifestyle"],
    ["prompts", "Prompts and bio", `${p.prompts.length} prompt${p.prompts.length === 1 ? "" : "s"} · ${p.bio ? "bio added" : "bio empty"}`],
    ["goal", "Looking for", p.goal ? GOAL_LABEL[p.goal] : "Not set"],
  ];
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/me" /><h1>Edit profile</h1><Link href="/me" style={{ fontWeight: 700, fontSize: 14 }}>Done</Link></div>
      <div className="photos">
        {[1, 2, 3, 4, 5, 6].map((n) => {
          const ph = p.photos.find((x) => x.position === n);
          return ph ? (
            <div key={n} className={`slot filled${ph.status === "rejected" ? " bad" : ""}`}>
              {ph.url ? <img src={ph.url} alt={`Photo ${n}`} /> : <span>Photo {n}</span>}
              {n === 1 && <span className="main">Main</span>}
              <button type="button" className="x" aria-label={`Remove photo ${n}`} onClick={() => remove(ph.id)}>×</button>
              <button type="button" aria-label={`Replace photo ${n}`} onClick={() => { setSlot(n); file.current?.click(); }} style={{ position: "absolute", inset: "36px 0 0 0", background: "transparent", border: 0 }} />
              {ph.status === "pending" && <span style={{ position: "absolute", right: 6, bottom: 6, padding: "2px 6px", borderRadius: 6, background: "rgba(30,24,56,.7)", color: "#fff", fontSize: 10 }}>Checking</span>}
            </div>
          ) : <button key={n} type="button" className="slot" aria-label={`Add photo ${n}`} onClick={() => { setSlot(n); file.current?.click(); }}>+</button>;
        })}
      </div>
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={upload} />
      {saved && <div className="note" role="status"><span>{saved}</span></div>}
      <ErrorNote error={error} />
      <nav aria-label="Profile sections" className="listcard">
        {rows.map(([key, title, sub]) => (
          <div key={title} style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
            <button type="button" aria-expanded={open === key} onClick={() => start(key)} disabled={busy} className="row" style={{ justifyContent: "space-between", background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", textAlign: "left" }}>
              <span className="stack" style={{ gap: 2 }}><strong>{title}</strong><span style={{ fontSize: 12, color: "var(--muted)" }}>{sub}</span></span><span aria-hidden="true">{open === key ? "▴" : "▾"}</span>
            </button>
            {open === "about" && key === "about" && <div className="stack" style={{ gap: 10 }}>
              <div className="field"><label className="label" htmlFor="e-name">First name</label><input id="e-name" className="input" maxLength={40} value={v("first_name") ?? ""} onChange={(e) => setF({ ...f, first_name: e.target.value })} />
                <span className="small">Changing your name sends your profile for a quick re-check.</span></div>
              <div className="grid2">
                <div className="field"><label className="label" htmlFor="e-h">Height</label><select id="e-h" className="input" value={v("height_cm") ?? ""} onChange={(e) => setF({ ...f, height_cm: Number(e.target.value) })}>
                  {HEIGHTS.map((h) => <option key={h.cm} value={h.cm}>{h.label}</option>)}</select></div>
                <div className="field"><label className="label" htmlFor="e-edu">Education</label><select id="e-edu" className="input" value={v("education") ?? ""} onChange={(e) => setF({ ...f, education: e.target.value })}>
                  <option value="">–</option>{EDU.map((x) => <option key={x}>{x}</option>)}</select></div>
              </div>
              {(["profession", "company", "college", "hometown", "mother_tongue"] as const).map((k) => (
                <div key={k} className="field"><label className="label" htmlFor={`e-${k}`}>{k === "mother_tongue" ? "Mother tongue" : k[0].toUpperCase() + k.slice(1)}</label>
                  <input id={`e-${k}`} className="input" maxLength={60} value={(v(k) as string) ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value || null })} /></div>
              ))}
              <div className="stack"><span className="label">Languages</span><div className="chips">{LANGS.map((l) => {
                const cur = (v("languages") as string[]) ?? [];
                return <button key={l} type="button" className="chip sm" aria-pressed={cur.includes(l)} onClick={() => setF({ ...f, languages: cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l] })}>{l}</button>;
              })}</div></div>
            </div>}
            {open === "lifestyle" && key === "lifestyle" && <div className="stack" style={{ gap: 10 }}>
              {(Object.keys(LIFE) as (keyof typeof LIFE)[]).map((k) => <Chips key={k} small label={k === "relocate" ? "Open to relocating" : k[0].toUpperCase() + k.slice(1)} options={LIFE[k]} value={(v(k) as string) ?? null} onChange={(x) => setF({ ...f, [k]: x })} />)}
            </div>}
            {open === "prompts" && key === "prompts" && <div className="stack" style={{ gap: 10 }}>
              {p.prompts.map((q) => <div key={q.key} className="field"><label className="label" htmlFor={`e-p-${q.key}`}>{q.label}</label>
                <textarea id={`e-p-${q.key}`} className="input" maxLength={200} value={answers[q.key] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })} /></div>)}
              <div className="field"><label className="label" htmlFor="e-bio">Bio <span style={{ fontWeight: 400, color: "var(--muted)" }}>· {((v("bio") as string) ?? "").length} / 300</span></label>
                <textarea id="e-bio" className="input" maxLength={300} value={(v("bio") as string) ?? ""} onChange={(e) => setF({ ...f, bio: e.target.value || null })} placeholder="A few lines in your own words." /></div>
            </div>}
            {open === "goal" && key === "goal" && <div role="radiogroup" aria-label="Looking for" className="seg">
              {(["dating", "matchmaking"] as const).map((g) => <button key={g} type="button" role="radio" aria-checked={v("goal") === g} onClick={() => setF({ ...f, goal: g })}>{GOAL_LABEL[g]}</button>)}
            </div>}
            {open === key && <Primary onClick={save} busy={busy}>Save</Primary>}
          </div>
        ))}
      </nav>
      <div className="row" style={{ gap: 10, padding: "12px 14px", borderRadius: 16, background: "#F3EEFF" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B44C9" strokeWidth="2" aria-hidden="true" style={{ flex: "none" }}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
        <span className="stack" style={{ gap: 2, fontSize: 13 }}><strong>Birth details{p.birth ? `: ${new Date(p.birth.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}, ${p.birth.time}, ${p.birth.place}` : ""}</strong>
          <span style={{ color: "var(--muted)" }}>Locked to keep matches honest. 1 free correction via <Link href="/help">Help</Link>.</span></span>
      </div>
      <span className="small">Changing your name or main photo re-runs the selfie check.</span>
    </div>
  );
}
