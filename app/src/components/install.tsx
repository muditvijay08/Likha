"use client";
// "Add Likha to your home screen", for members who skipped it during sign-up. Hidden once Likha is installed.
import { useEffect, useState } from "react";
import { installState, onInstallChange, promptInstall } from "@/lib/install";

export function InstallSteps({ ios }: { ios: boolean }) {
  const steps = ios
    ? [<>Tap <strong>Share</strong> at the bottom of Safari</>, <>Choose <strong>Add to Home Screen</strong></>, <>Open Likha from your home screen</>]
    : [<>Open your browser&apos;s <strong>⋮</strong> menu</>, <>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong></>, <>Open Likha from your home screen</>];
  return (
    <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 14, lineHeight: 1.45 }}>
      {steps.map((t, i) => <li key={i}>{t}</li>)}
    </ol>
  );
}

export function InstallCard() {
  const [state, setState] = useState<ReturnType<typeof installState> | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { const up = () => setState(installState()); up(); return onInstallChange(up); }, []);
  if (!state || state === "installed") return null;
  return (
    <section aria-label="Add Likha to your home screen" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 18, background: "#1E1838", color: "#fff" }}>
      <div className="row" style={{ gap: 12 }}>
        <img src="/icons/apple-touch-icon.png" alt="" width={44} height={44} style={{ borderRadius: 12, flex: "none" }} />
        <span className="stack" style={{ gap: 2, flex: 1 }}><strong style={{ fontSize: 15 }}>Add Likha to your home screen</strong>
          <span style={{ fontSize: 12, color: "#CFC7EE" }}>Opens like an app{state === "ios" ? ". On iPhone, notifications need this." : ", with notifications."}</span></span>
        {state === "prompt"
          ? <button type="button" className="chip sm" style={{ background: "var(--saffron)", border: 0 }} onClick={() => promptInstall()}>Install</button>
          : <button type="button" className="chip sm" style={{ background: "var(--saffron)", border: 0 }} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide" : "How"}</button>}
      </div>
      {open && state !== "prompt" && <div style={{ color: "#EDE6FF" }}><InstallSteps ios={state === "ios"} /></div>}
    </section>
  );
}
