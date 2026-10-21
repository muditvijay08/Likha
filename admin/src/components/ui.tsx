"use client";
// Small shared pieces for admin screens.
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useAction } from "./shell";

export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
export const ago = (iso: string | null) => {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 0) { const d = Math.ceil(-m / 1440); return d <= 1 ? "in a day" : `in ${d} days`; }
  return m < 1 ? "now" : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
};
export const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
export const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const TONE: Record<string, string> = { active: "ok", passed: "ok", captured: "ok", resolved: "ok", processed: "ok", ready: "ok", live: "ok", credited: "ok",
  urgent: "bad", banned: "bad", failed: "bad", rejected: "bad", high: "warn", suspended: "warn", under_review: "warn", manual_review: "warn", open: "info",
  in_progress: "info", waiting_user: "off", awaiting_second_approval: "warn", approved: "info", generating: "info", created: "off", refunded: "off", deleted: "off",
  onboarding: "off", dismissed: "off", normal: "off", low: "off", waitlist: "info" };
export function Status({ s, text }: { s: string; text?: string }) { return <span className={`pill ${TONE[s] ?? "off"}`}>{text ?? label(s)}</span>; }

export function Kpi({ k, v, s, alert, href }: { k: string; v: ReactNode; s?: ReactNode; alert?: boolean; href?: string }) {
  const body = <><span className="k">{k}</span><span className="v">{v}</span>{s && <span className="s">{s}</span>}</>;
  return href ? <a className={`kpi ${alert ? "alert" : ""}`} href={href}>{body}</a> : <div className={`kpi ${alert ? "alert" : ""}`}>{body}</div>;
}

export function Photo({ path, name, bucket = "photos", label }: { path: string | null; name: string; bucket?: "photos" | "selfies"; label?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { api().photoUrl(path, bucket).then(setUrl).catch(() => {}); }, [path, bucket]);
  return <div className="photo" aria-label={label ?? `Photo of ${name}`}>{url ? <img src={url} alt={label ?? `${name}'s main photo`} /> : name.slice(0, 1)}</div>;
}

/** A button that opens a small form asking for a note (and optionally days), then runs. */
export function NoteAction({ label: text, tone = "ghost", placeholder, days, onRun, done }: { label: string; tone?: string; placeholder?: string; days?: number;
  onRun(note: string, days: number | null): Promise<unknown>; done?(): void }) {
  const [open, setOpen] = useState(false); const [note, setNote] = useState(""); const [d, setD] = useState(days ?? 0);
  const { busy, error, run } = useAction();
  if (!open) return <button type="button" className={`btn ${tone} sm`} onClick={() => setOpen(true)}>{text}</button>;
  return (
    <form className="card stack" style={{ gap: 8, padding: 12 }} aria-label={text} onSubmit={(e) => { e.preventDefault(); run(async () => { await onRun(note.trim(), days !== undefined ? d : null); setOpen(false); setNote(""); done?.(); }); }}>
      <strong style={{ fontSize: 13 }}>{text}</strong>
      <textarea className="input" aria-label="Note" placeholder={placeholder ?? "Reason (goes in the audit log)"} value={note} onChange={(e) => setNote(e.target.value)} />
      {days !== undefined && <label className="f">Days<input className="input" type="number" min={1} max={365} value={d} onChange={(e) => setD(Number(e.target.value))} style={{ width: 100 }} /></label>}
      {error && <p className="err" role="alert">{error}</p>}
      <div className="row"><button className={`btn ${tone === "danger" ? "danger" : ""} sm`} disabled={busy}>Confirm</button><button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  );
}

export function Page({ title, sub, actions, children }: { title: string; sub?: string; actions?: ReactNode; children: ReactNode }) {
  return <>
    <div className="row" style={{ alignItems: "flex-end" }}><div className="stack grow" style={{ gap: 4 }}><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>{actions}</div>
    {children}
  </>;
}

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null); const [err, setErr] = useState<string | null>(null); const [n, setN] = useState(0);
  useEffect(() => { let live = true; fn().then((d) => { if (live) { setData(d); setErr(null); } }).catch((e: Error) => live && setErr(e.message)); return () => { live = false; }; }, [n, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, err, reload: () => setN((x) => x + 1) };
}

export function download(name: string, text: string, type = "application/json") {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
}
