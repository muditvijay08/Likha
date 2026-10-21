"use client";
// Things the team controls from Admin that sit in front of every screen:
// maintenance (Settings > General) and re-agreeing to a republished required document (Settings > Security).
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Primary } from "@/components/ui";
import { api, type ConsentNeeded } from "@/lib/api";
import { APP_VERSION, compareVersions } from "@/lib/version";

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [old, setOld] = useState(false);
  useEffect(() => {
    api().settings().then((s) => {
      setMsg(s.app?.maintenance ? (s.app.maintenance_message || "Back soon.") : null);
      setOld(!!s.app?.min_app_version && compareVersions(APP_VERSION, s.app.min_app_version) < 0);
    }).catch(() => {});
  }, []);
  if (old && msg === null) return (
    <main className="screen" style={{ justifyContent: "center", textAlign: "center", gap: 14 }} role="status">
      <h1 className="h1">A new version of Likha is ready</h1>
      <p className="sub">Refresh to get it. Nothing you&apos;ve done is lost.</p>
      <Primary onClick={async () => {
        try { const r = await navigator.serviceWorker?.getRegistration(); await r?.update(); } catch { /* no service worker */ }
        location.reload();
      }}>Refresh</Primary>
    </main>
  );
  if (msg === null) return <>{children}</>;
  return (
    <main className="screen" style={{ justifyContent: "center", textAlign: "center", gap: 14 }} role="status">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--saffron)" strokeWidth="1.6" aria-hidden="true" style={{ margin: "0 auto" }}>
        <circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></svg>
      <h1 className="h1">Likha is taking a short break</h1>
      <p className="sub">{msg}</p>
      <p className="small">Your matches, chats and credits are safe.</p>
    </main>
  );
}

export function ConsentGate({ children }: { children: ReactNode }) {
  const [need, setNeed] = useState<ConsentNeeded[] | null>(null);
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const path = usePathname();
  useEffect(() => { api().consentsNeeded().then(setNeed).catch(() => setNeed([])); }, []);
  if (need === null || need.length === 0 || path.startsWith("/delete")) return <>{children}</>;
  const all = need.every((n) => on[n.key]);
  const agree = async () => {
    if (!all) { setError("Tick each box to continue."); return; }
    setBusy(true);
    try { await api().acceptConsents(need.map((n) => ({ key: n.key, version: n.version }))); setNeed([]); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <main className="screen" style={{ gap: 16 }}>
      <div className="stack">
        <h1 className="h1">We&apos;ve updated a few things</h1>
        <p className="sub">Please read and agree to keep using Likha.</p>
      </div>
      {need.map((n) => (
        <div key={n.key} className="stack" style={{ gap: 8 }}>
          <div style={{ maxHeight: 220, overflow: "auto", padding: 14, borderRadius: 16, background: "#fff", border: "1px solid var(--line)", fontSize: 14, whiteSpace: "pre-wrap" }}>
            <strong style={{ display: "block", marginBottom: 6 }}>{n.title} · version {n.version}</strong>{n.body}</div>
          <label htmlFor={`rc-${n.key}`} className="check">
            <input id={`rc-${n.key}`} type="checkbox" checked={!!on[n.key]} onChange={(e) => { setOn({ ...on, [n.key]: e.target.checked }); setError(null); }} />
            <span className="stack" style={{ gap: 2 }}><strong>I agree to the {n.title}</strong></span>
          </label>
        </div>
      ))}
      <div className="grow" />
      {error && <p className="error" role="alert">{error}</p>}
      <Primary onClick={agree} busy={busy}>Agree and continue</Primary>
      <p className="small" style={{ textAlign: "center" }}>Full text: <a href="/legal/terms">Terms</a> · <a href="/legal/privacy">Privacy</a>. Don&apos;t agree? <a href="/delete">Delete my account</a>.</p>
    </main>
  );
}
