"use client";
// O9 About you (step 6): two prompts + interests
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ErrorNote, Primary, Screen, StepHeader, useAction } from "@/components/ui";
import { api, type Interest } from "@/lib/api";
import { useGuard } from "@/lib/guard";
import { usePersisted } from "@/lib/persist";
import { useFlow } from "@/lib/flow";

export default function Vibe() {
  useGuard();
  const router = useRouter();
  const [all, setAll] = useState<Interest[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [f, setF] = usePersisted("vibe", { about: "", fond: "", picked: [] as number[] });
  const { busy, error, run } = useAction();
  const { settings } = useFlow();
  const maxLen = settings?.prompts?.max_length ?? 300, need = settings?.prompts?.required ?? 2;
  const iMin = settings?.prompts?.interests_min ?? 3, iMax = settings?.prompts?.interests_max ?? 10;

  useEffect(() => { api().interests().then(setAll).catch(() => {}); }, []);

  // Voice intro: up to 30 seconds, optional
  const [rec, setRec] = useState<"idle" | "recording" | "saving" | "saved" | "blocked">("idle");
  const [secs, setSecs] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  async function toggleRecord() {
    if (rec === "recording") { recorder.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream); const parts: Blob[] = [];
      mr.ondataavailable = (e) => parts.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); setRec("saving");
        try { await api().uploadVoice(new Blob(parts, { type: mr.mimeType || "audio/webm" })); setRec("saved"); } catch { setRec("idle"); }
      };
      recorder.current = mr; mr.start(); setRec("recording"); setSecs(0);
      const t0 = Date.now();
      const tick = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); setSecs(s); if (s >= 30 || mr.state !== "recording") { clearInterval(tick); if (mr.state === "recording") mr.stop(); } }, 250);
    } catch { setRec("blocked"); }
  }

  function toggle(id: number) {
    setF((o) => ({ ...o, picked: o.picked.includes(id) ? o.picked.filter((x) => x !== id) : o.picked.length >= iMax ? o.picked : [...o.picked, id] }));
  }

  const submit = () => run(async () => {
    const answered = [f.about, f.fond].filter((x) => x.trim().length >= 10).length;
    if (answered < need) throw new Error(need === 2 ? "Answer both, at least a line each." : "Answer at least one, a line or more.");
    if (f.picked.length < iMin) throw new Error(`Pick at least ${iMin} interests.`);
    await api().saveVibe([{ key: "about_you", answer: f.about }, { key: "fond_of", answer: f.fond }], f.picked);
    await api().setStep(7);
    await api().refresh();
    router.push("/goal");
  });

  const shown = showAll ? all : all.slice(0, 7);
  const box = (id: string, label: string, value: string, set: (v: string) => void, ph: string) => (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px" }}>
      <label htmlFor={id} style={{ fontSize: 12, fontWeight: 700, color: "var(--link)" }}>{label}</label>
      <textarea id={id} className="input" style={{ border: 0, padding: 0, minHeight: 64, boxShadow: "none" }} maxLength={maxLen} placeholder={ph}
        value={value} onChange={(e) => set(e.target.value)} />
      <span className="small" style={{ alignSelf: "flex-end" }}>{value.length}/{maxLen}</span>
    </div>
  );

  return (
    <Screen style={{ gap: 16 }}>
      <StepHeader step={6} back="/selfie" />
      <div className="stack">
        <h1 className="h1">Show your vibe</h1>
        <p className="sub">Two quick ones. Keep it real, keep it you.</p>
      </div>
      {box("about", "About you", f.about, (v) => setF({ ...f, about: v }), "Product designer, part-time chai critic…")}
      {box("fond", "What are you fond of?", f.fond, (v) => setF({ ...f, fond: v }), "Old Hindi songs, long drives…")}

      <div className="row" style={{ gap: 12, padding: "12px 14px", borderRadius: 16, background: "#FFF0F4", border: "1px solid #FFC6D4" }}>
        <button type="button" onClick={toggleRecord} className="tip" data-tip={rec === "recording" ? "Stop" : "Record voice intro"}
          aria-label={rec === "recording" ? "Stop recording" : "Record voice intro"}
          style={{ width: 44, height: 44, flex: "none", borderRadius: 999, border: 0, background: "#E0457B", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {rec === "recording" ? <span style={{ width: 14, height: 14, background: "#fff", borderRadius: 3 }} />
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>}
        </button>
        <span className="stack" style={{ gap: 2 }}>
          <strong style={{ fontSize: 14 }}>{rec === "saved" ? "Voice intro saved" : rec === "recording" ? `Recording… 0:${String(secs).padStart(2, "0")} / 0:30` : rec === "saving" ? "Saving…" : "Record a voice intro"}</strong>
          <span className="small">{rec === "blocked" ? "Microphone is blocked. You can add this later." : rec === "saved" ? "Tap to record again." : "Up to 30 seconds. Optional."}</span>
        </span>
      </div>

      <div className="stack">
        <span className="label">Interests <span style={{ color: "var(--muted)", fontWeight: 500 }}>· {f.picked.length} of {iMax}</span></span>
        <div className="chips">
          {shown.map((i) => <button key={i.id} type="button" className="chip sm" aria-pressed={f.picked.includes(i.id)} onClick={() => toggle(i.id)}>{i.label}</button>)}
          {!showAll && all.length > 7 && <button type="button" className="chip sm" onClick={() => setShowAll(true)}>+ More</button>}
        </div>
      </div>

      <div className="grow" />
      <ErrorNote error={error} />
      <Primary onClick={submit} busy={busy}>Continue</Primary>
    </Screen>
  );
}
