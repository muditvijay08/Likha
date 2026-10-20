"use client";
// O8 Live selfie (step 5). The camera preview is local; the real liveness check runs server-side (selfie-check Edge Function).
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ErrorNote, Primary, Screen, Shield, StepHeader, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useGuard } from "@/lib/guard";

const STEPS = ["Look", "Turn", "Blink"];

export default function Selfie() {
  const s = useGuard();
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [cam, setCam] = useState<"off" | "on" | "blocked">("off");
  const [tries, setTries] = useState(0);
  const [phase, setPhase] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const { busy, error, run, setError } = useAction();

  useEffect(() => () => { (video.current?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop()); }, []);
  useEffect(() => { if (s && (s.selfie_status === "passed" || s.selfie_status === "manual_review" || s.selfie_status === "pending")) setResult(s.selfie_status); }, [s]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      if (video.current) { video.current.srcObject = stream; await video.current.play(); }
      setCam("on");
    } catch { setCam("blocked"); }
  }

  const check = () => run(async () => {
    if (cam !== "on") { await startCamera(); return; }
    for (let i = 0; i < STEPS.length; i++) { setPhase(i); await new Promise((r) => setTimeout(r, 700)); }
    const r = await api().startSelfie();
    setTries((t) => t + 1);
    if (r.status === "failed") { setError(r.message ?? "That didn't work. Try again in better light."); return; }
    setResult(r.status);
    await api().setStep(6);
    await api().refresh();
  });

  const done = result === "passed" || result === "manual_review" || result === "pending";
  const instruction = cam === "on" ? ["Look straight at the camera", "Turn your head slowly to the left", "Blink twice"][phase] : "Your face will appear here";

  return (
    <Screen style={{ gap: 16 }}>
      <StepHeader step={5} back="/photos" />
      <div className="stack">
        <h1 className="h1">Prove you&apos;re real</h1>
        <p className="sub">Catfish not allowed in this ocean. A 10-second check keeps Likha real.</p>
      </div>

      <div style={{ position: "relative", alignSelf: "center", width: 240, height: 300, borderRadius: "50% / 45%", overflow: "hidden",
        border: `4px solid ${done ? "#2F7D63" : "var(--saffron)"}`, background: "#1E1838", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <video ref={video} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", display: cam === "on" ? "block" : "none" }} />
        {cam !== "on" && <span style={{ color: "#C9BDEB", fontSize: 13, padding: 20, textAlign: "center" }}>
          {cam === "blocked" ? "Camera is blocked. Allow camera access in your browser settings." : "Camera starts when you tap below"}</span>}
      </div>
      <div role="status" style={{ textAlign: "center", fontWeight: 700, fontSize: 15 }}>
        {done ? (result === "passed" ? "Verified. Welcome to the real side." : "Thanks. A person will review it within 24 hours.") : instruction}
      </div>

      <ol className="row" style={{ listStyle: "none", padding: 0, margin: 0, justifyContent: "center", gap: 8 }}>
        {STEPS.map((t, i) => <li key={t} className={`pill${done || (busy && phase > i) ? " done" : busy && phase === i ? " now" : ""}`} style={{ flex: 1, textAlign: "center" }}>{i + 1} · {t}</li>)}
      </ol>
      <div className="trust" style={{ justifyContent: "center" }}><Shield />Compared with your first photo, then deleted. Never shown on your profile.</div>

      <div className="grow" />
      <ErrorNote error={error} />
      {done ? <Primary onClick={() => router.push("/vibe")}>Continue</Primary>
            : <Primary onClick={check} busy={busy} disabled={tries >= 3}>{cam === "on" ? "Start check" : "Turn on camera"}</Primary>}
      <div className="small" style={{ textAlign: "center" }}>
        {tries >= 3 ? "3 tries used. A person will review your photos within 24 hours." : "3 tries. If it still fails, a person reviews it within 24 hours."}
      </div>
    </Screen>
  );
}
