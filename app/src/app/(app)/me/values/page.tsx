"use client";
// E15 Life and values: the optional questions Match Intelligence compares. Each answer shows on your profile; tap again to clear.
// Nothing here is required, nothing is scored on its own, and Likha never asks about religion or caste.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app";
import { forgetMySide } from "@/components/match-intel";
import { api, type MyProfile, type ProfilePatch } from "@/lib/api";
import { LABELS } from "@/lib/match-intel";

type Key = "kids" | "family_setup" | "career_plan" | "comm_style" | "conflict_style" | "weekend_style" | "money_style" | "drinking" | "smoking";
const QUESTIONS: { key: Key; q: string; opts: [string, string][] }[] = [
  { key: "kids", q: "Kids someday?", opts: [["want", "I want kids"], ["dont_want", "I don't want kids"], ["have", "I have kids"], ["not_sure", "Not sure yet"]] },
  { key: "family_setup", q: "After marriage, I see us living in…", opts: [["joint", "A joint family"], ["nuclear", "Our own home"], ["open", "Open to either"]] },
  { key: "career_plan", q: "Work after marriage", opts: [["both_work", "We both keep working"], ["one_home", "One of us at home"], ["open", "Whatever works for us"]] },
  { key: "comm_style", q: "Between dates, I'd rather…", opts: [["texter", "Text"], ["caller", "Call"], ["in_person", "Just meet"]] },
  { key: "conflict_style", q: "In a disagreement, I…", opts: [["talk_now", "Talk it out straight away"], ["cool_off", "Cool off first, then talk"]] },
  { key: "weekend_style", q: "A good weekend is…", opts: [["homebody", "Quiet, at home"], ["social", "With people"], ["outdoors", "Outdoors"], ["mix", "A bit of everything"]] },
  { key: "money_style", q: "With money, I'm…", opts: [["saver", "A saver"], ["spender", "A spender"], ["balanced", "Somewhere in between"]] },
  { key: "drinking", q: "Drinking", opts: [["never", "Never"], ["socially", "Socially"], ["regularly", "Regularly"]] },
  { key: "smoking", q: "Smoking", opts: [["never", "Never"], ["socially", "Socially"], ["regularly", "Regularly"]] },
];
const VALUES = Object.entries(LABELS.life_values);

export default function LifeValues() {
  const router = useRouter();
  const { toast } = useApp();
  const [p, setP] = useState<MyProfile | null>(null);
  const [f, setF] = useState<ProfilePatch>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { api().myProfile().then(setP).catch(() => {}); }, []);
  if (!p) return <div className="app-body"><div className="skel" style={{ height: 420 }} /></div>;

  const cur = (k: Key) => (k in f ? (f as Record<string, string | null>)[k] : (p as unknown as Record<string, string | null>)[k]) ?? null;
  const vals = (f.life_values ?? p.life_values ?? []) as string[];
  const pick = (k: Key, v: string) => setF((x) => ({ ...x, [k]: cur(k) === v ? null : v }));
  const toggleValue = (v: string) => setF((x) => {
    const now = vals.includes(v) ? vals.filter((y) => y !== v) : vals.length >= 3 ? vals : [...vals, v];
    return { ...x, life_values: now };
  });
  const answered = QUESTIONS.filter((q) => cur(q.key)).length + (vals.length ? 1 : 0);
  const save = async () => {
    setBusy(true);
    try { if (Object.keys(f).length) await api().saveProfile(f); forgetMySide(); toast("Saved. Match reasons updated."); router.back(); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="app-body" style={{ gap: 22 }}>
      <header className="stack" style={{ gap: 6 }}>
        <Link href="/menu" className="back" aria-label="Back"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></Link>
        <span className="kicker">Match Intelligence</span>
        <h1 className="h1">Life and values</h1>
        <p className="sub">Optional. These show on your profile, and help explain real-life fit next to the kundli. Tap an answer again to clear it.</p>
        <span className="small">{answered} of {QUESTIONS.length + 1} answered</span>
      </header>
      {QUESTIONS.map((q) => (
        <fieldset key={q.key} className="stack" style={{ gap: 10, border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <legend className="label" style={{ fontSize: 15, marginBottom: 8 }}>{q.q}</legend>
          <div className="choice-grid">
            {q.opts.map(([v, label]) => (
              <button key={v} type="button" className="choice" aria-pressed={cur(q.key) === v} onClick={() => pick(q.key, v)}>{label}</button>
            ))}
          </div>
        </fieldset>
      ))}
      <fieldset className="stack" style={{ gap: 10, border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <legend className="label" style={{ fontSize: 15, marginBottom: 8 }}>What matters most? Pick up to 3</legend>
        <div className="choice-grid">
          {VALUES.map(([v, label]) => (
            <button key={v} type="button" className="choice" aria-pressed={vals.includes(v)} disabled={!vals.includes(v) && vals.length >= 3} onClick={() => toggleValue(v)}>
              {label.charAt(0).toUpperCase() + label.slice(1)}</button>
          ))}
        </div>
      </fieldset>
      <p className="small" style={{ margin: 0 }}>Likha never asks about religion or caste, and never scores them.</p>
      <button type="button" className="btn" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
    </div>
  );
}
