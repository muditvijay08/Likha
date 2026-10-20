"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useFlow } from "@/lib/flow";

export function BackButton({ href }: { href?: string }) {
  const router = useRouter();
  const icon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>;
  return href
    ? <Link href={href} className="back tip" data-tip="Back" aria-label="Back">{icon}</Link>
    : <button type="button" onClick={() => router.back()} className="back tip" data-tip="Back" aria-label="Back">{icon}</button>;
}

/** Back button + "Step n of 8" + credit slider, as in O4–O11. */
export function StepHeader({ step, back, last }: { step: number; back?: string; last?: boolean }) {
  const { credits, gender } = useFlow();
  const c = credits(step);
  const earned = c.earnedBefore + c.thisStep;               // the design shows this step's credits as already in reach
  const pct = (step / 8) * 100;
  const tip = `Welcome credits unlock as you finish each step. ${gender === "woman" ? "Women" : "Men"} get ${c.total}.`;
  return (
    <div className="row" style={{ gap: 12, alignItems: "center" }}>
      <BackButton href={back} />
      <div className="stepper">
        <div className="top"><span>Step {step} of 8</span>
          <span className="earned tip tip-r" tabIndex={0} data-tip={tip}>{earned} of {c.total} credits earned</span></div>
        <div className="bar" role="progressbar" aria-label={`Credits earned: ${earned} of ${c.total}`} aria-valuemin={0} aria-valuemax={c.total} aria-valuenow={earned}>
          <div className="track" /><div className="fill" style={{ width: `${pct}%` }} />
          {[1, 2, 3, 4, 5, 6, 7].map((i) => <span key={i} className="tick" style={{ left: `calc(${i * 12.5}% - 3px)` }} />)}
          <span className="knob" style={{ left: `calc(${pct}% - 9px)` }} />
        </div>
        <div className="hint" style={last ? { color: "#1F5E49", fontWeight: 700 } : undefined}>{last ? `Last step. All ${c.total} credits unlock after it.` : `Finish this step: +${c.thisStep} credits`}</div>
      </div>
    </div>
  );
}

export function Screen({ children, tight, style }: { children: ReactNode; tight?: boolean; style?: React.CSSProperties }) {
  return <main className={`screen${tight ? " tight" : ""}`} style={style}>{children}</main>;
}

export function Chips<T extends string>({ label, options, value, onChange, fill, name, small }: {
  label: string; options: { v: T; label: string }[]; value: T | null; onChange(v: T): void; fill?: boolean; name?: string; small?: boolean;
}) {
  return (
    <div className="stack" role="group" aria-label={name ?? label}>
      <span className="label">{label}</span>
      <div className={`chips${fill ? " fill" : ""}`}>
        {options.map((o) => (
          <button key={o.v} type="button" className={small ? "chip sm" : "chip"} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

export function Primary({ children, onClick, disabled, busy, type = "button" }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; busy?: boolean; type?: "button" | "submit";
}) {
  return (
    <button type={type} className="btn" onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy ? <span className="spinner" aria-label="Please wait" /> : children}
    </button>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  return error ? <div className="error" role="alert">{error}</div> : null;
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }
  return { busy, error, run, setError };
}

export const Shield = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E07B00" strokeWidth="2" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /></svg>
);
export const Lock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E07B00" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);
export const Pin = ({ color = "var(--g)" }: { color?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" aria-hidden="true"><path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>
);
