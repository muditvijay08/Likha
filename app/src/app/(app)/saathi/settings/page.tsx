"use client";
// A2 Saathi settings: companion, mode, personality, language, romance and memory, with a fixed preview line.
// Romance starts off. Flirty and romantic need an unticked "I understand" box (virtual, not a person, never sexual).
// Memory starts off. Turning it on needs its own unticked box; nothing is kept unless the member approves it.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app";
import { BackButton, ErrorNote, Primary, useAction } from "@/components/ui";
import { api, type Romance, type SaathiChar, type SaathiMode, type SaathiState, type SaathiTone } from "@/lib/api";
import { COMPANION_NAME, MODES, ROMANCE, previewLine } from "@/lib/companion";

type Lang = "english" | "hinglish" | "hindi";
const SLIDERS: [keyof Omit<SaathiTone, "detail">, string, string][] = [["caring", "Caring", "Direct"], ["playful", "Playful", "Serious"], ["expressive", "Reserved", "Expressive"]];

export default function SaathiSettings() {
  const router = useRouter();
  const { toast } = useApp();
  const { busy, error, run } = useAction();
  const [s, setS] = useState<SaathiState | null>(null);
  const [char, setChar] = useState<SaathiChar>("chandni");
  const [mode, setMode] = useState<SaathiMode>("companion");
  const [tone, setTone] = useState<SaathiTone>({ caring: 30, playful: 40, expressive: 60, detail: "short" });
  const [lang, setLang] = useState<Lang>("hinglish");
  const [romance, setRomance] = useState<Romance>("off");
  const [romanceAck, setRomanceAck] = useState(false);
  const [memoryOn, setMemoryOn] = useState(false);
  const [memoryAck, setMemoryAck] = useState(false);
  useEffect(() => {
    api().saathi().then((x) => {
      setS(x); setChar(x.character); setMode(x.mode ?? "companion"); setLang(x.language ?? "hinglish"); setRomance(x.romance ?? "off");
      if (x.tone) setTone(x.tone); setMemoryOn(!!x.memory_on);
    }).catch(() => {});
  }, []);
  if (!s) return <div className="app-body pad"><div className="skel" style={{ height: 480 }} /></div>;
  const name = COMPANION_NAME[char];
  const needsRomanceAck = (romance === "flirty" || romance === "romantic") && !s.romance_ack;
  const needsMemoryAck = memoryOn && !s.memory_on;

  const save = () => run(async () => {
    if (needsRomanceAck && !romanceAck) throw new Error("Tick the box to confirm you understand, or pick Off or Warm.");
    if (needsMemoryAck && !memoryAck) throw new Error("Tick the memory box to turn memory on, or leave it off.");
    await api().saathiPrefs({ character: char, mode, tone, language: lang, romance, romance_ack: romanceAck || undefined, memory_on: memoryOn, memory_ack: memoryAck || undefined });
    toast("Saved"); router.push("/saathi");
  });

  return (
    <div className="app-body pad" style={{ gap: 22 }}>
      <div className="titlebar"><BackButton href="/saathi" /><h1>Saathi settings</h1></div>

      <section aria-label="Preview" className="companion-hero" style={{ padding: 16 }}>
        <span className="kicker" style={{ color: "var(--muted)" }}>Preview · {name} · virtual</span>
        <p style={{ margin: "8px 0 0", fontSize: 16, lineHeight: 1.5 }}>{previewLine({ name, mode, romance, ...tone, language: lang })}</p>
      </section>

      <fieldset className="set-group">
        <legend>Companion</legend>
        <div className="choice-grid" role="radiogroup" aria-label="Companion">
          {(Object.keys(COMPANION_NAME) as SaathiChar[]).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={char === c} aria-pressed={char === c} className="choice" onClick={() => setChar(c)}>{COMPANION_NAME[c]}</button>))}
        </div>
      </fieldset>

      <fieldset className="set-group">
        <legend>Mode</legend>
        <div className="choice-grid" role="radiogroup" aria-label="Mode">
          {MODES.map(([m, label]) => <button key={m} type="button" role="radio" aria-checked={mode === m} aria-pressed={mode === m} className="choice" onClick={() => setMode(m)}>{label}</button>)}
        </div>
      </fieldset>

      <fieldset className="set-group">
        <legend>Personality</legend>
        {SLIDERS.map(([k, left, right]) => (
          <label key={k} className="slider-row">
            <span className="ends"><span>{left}</span><span>{right}</span></span>
            <input type="range" min={0} max={100} step={5} value={tone[k]} aria-label={`${left} to ${right}`}
              onChange={(e) => setTone((t) => ({ ...t, [k]: Number(e.target.value) }))} />
          </label>
        ))}
        <div className="choice-grid" role="radiogroup" aria-label="Reply length">
          {(["short", "detailed"] as const).map((d) => <button key={d} type="button" role="radio" aria-checked={tone.detail === d} aria-pressed={tone.detail === d} className="choice"
            onClick={() => setTone((t) => ({ ...t, detail: d }))}>{d === "short" ? "Short replies" : "Detailed replies"}</button>)}
        </div>
      </fieldset>

      <fieldset className="set-group">
        <legend>Language</legend>
        <div className="choice-grid" role="radiogroup" aria-label="Language">
          {([["hinglish", "Hinglish"], ["english", "English"], ["hindi", "Hindi"]] as const).map(([v, l]) =>
            <button key={v} type="button" role="radio" aria-checked={lang === v} aria-pressed={lang === v} className="choice" onClick={() => setLang(v)}>{l}</button>)}
        </div>
      </fieldset>

      <fieldset className="set-group">
        <legend>Romance</legend>
        <div className="stack" role="radiogroup" aria-label="Romance" style={{ gap: 8 }}>
          {ROMANCE.map(([v, label, sub]) => (
            <button key={v} type="button" role="radio" aria-checked={romance === v} className="opt-row" onClick={() => setRomance(v)}>
              <strong>{label}</strong><span>{sub}</span></button>
          ))}
        </div>
        {needsRomanceAck && (
          <label className="consent-box">
            <input type="checkbox" checked={romanceAck} onChange={(e) => setRomanceAck(e.target.checked)} />
            <span>I&apos;m 18 or older. I understand {name} is a virtual companion, not a real person: romance stays sweet, never sexual, and {name} will never
              claim real feelings or ask me to stop seeing real people.</span>
          </label>
        )}
      </fieldset>

      <fieldset className="set-group">
        <legend>Memory</legend>
        <label className="row toggle-row">
          <span className="stack" style={{ gap: 2, flex: 1 }}><strong>Let {name} remember things I approve</strong>
            <span className="small">{name} may suggest something to remember; it&apos;s kept only if you tap Save. See, edit or delete everything in the Memory Centre.</span></span>
          <input type="checkbox" role="switch" checked={memoryOn} onChange={(e) => setMemoryOn(e.target.checked)} aria-label="Memory" />
        </label>
        {needsMemoryAck && (
          <label className="consent-box">
            <input type="checkbox" checked={memoryAck} onChange={(e) => setMemoryAck(e.target.checked)} />
            <span>Keep the things I approve so {name} can use them in our chats. Never health, religion, caste or money details. I can delete them any time.</span>
          </label>
        )}
        <Link href="/saathi/memory" style={{ fontWeight: 600, fontSize: 14 }}>Open the Memory Centre</Link>
      </fieldset>

      <ErrorNote error={error} />
      <Primary onClick={save} busy={busy}>Save</Primary>
    </div>
  );
}
