"use client";
// Every admin screen sits in this shell: signed in, on the team, MFA done. Otherwise back to /login.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type Me } from "@/lib/api";

const Ctx = createContext<{ me: Me; toast(m: string): void } | null>(null);
export const useAdmin = () => useContext(Ctx)!;

type Item = [string, string, string[]];
const NAV: [string, Item[]][] = [
  ["Overview", [["/dashboard", "Dashboard", []]]],
  ["People", [["/users", "Users", ["users.read"]], ["/moderation", "Moderation", ["users.moderate"]], ["/selfies", "Selfie review", ["users.moderate"]],
    ["/support", "Support inbox", ["support.reply"]], ["/grievances", "Grievances", ["grievances.manage"]], ["/data-requests", "Data requests", ["data.manage"]]]],
  ["Money", [["/payments", "Payments and refunds", ["payments.read"]], ["/readings", "Readings", ["users.read"]]]],
  ["Growth", [["/maasi", "Rishta Maasi picks", ["users.moderate"]]]],
  ["Settings", [["/keys", "Keys & live mode", ["keys.manage"]], ["/ai", "AI models", ["ai.view", "settings.write"]]]],
];

export function Shell({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [msg, setMsg] = useState<string | null>(null);
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    api().me().then((m) => { if (!m || !m.mfa) router.replace("/login"); else setMe(m); }).catch(() => router.replace("/login"));
  }, [router]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((m: string) => { setMsg(m); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setMsg(null), 3200); }, []);
  if (!me) return <div className="center"><div className="skel" style={{ width: 320, height: 120 }} /></div>;
  return (
    <Ctx.Provider value={{ me, toast }}>
      {api().demo && <div className="demo-bar" role="note">Demo admin · nothing here reaches a real provider</div>}
      <div className="shell">
        <nav className="side" aria-label="Admin">
          <div className="brand">Likha<span>.</span><small>ADMIN</small></div>
          {NAV.map(([group, items]) => {
            const mine = items.filter(([, , p]) => !p.length || p.some((x) => me.perms.includes(x)));
            return mine.length ? <div key={group} className="navgroup"><span className="navlabel">{group}</span>
              {mine.map(([href, label]) => <Link key={href} href={href} aria-current={path.startsWith(href) ? "page" : undefined}>{label}</Link>)}</div> : null;
          })}
          <div className="who"><strong>{me.name}</strong>{me.role}
            <div><button type="button" onClick={async () => { await api().signOut(); router.replace("/login"); }}>Sign out</button></div></div>
        </nav>
        <main className="main">{children}</main>
      </div>
      {msg && <div className="toast" role="status">{msg}</div>}
    </Ctx.Provider>
  );
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(false); }
  }, []);
  return { busy, error, run, setError };
}

export const when = (iso: string | null) => iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
