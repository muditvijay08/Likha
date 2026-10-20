"use client";
// Pieces shared by the member app screens (Home, Discover, Likes, Chats, Menu).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type HomeData, type Prices } from "@/lib/api";

// ---------------------------------------------------------------- app data (Home summary + prices, loaded once)
interface AppData { home: HomeData | null; prices: Prices; reload(): Promise<void>; toast(msg: string): void }
const Ctx = createContext<AppData>({ home: null, prices: {}, reload: async () => {}, toast: () => {} });
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [home, setHome] = useState<HomeData | null>(null);
  const [prices, setPrices] = useState<Prices>({});
  const [msg, setMsg] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const [h, p] = await Promise.all([api().home(), api().prices()]);
    setHome(h); setPrices(p);
  }, []);
  useEffect(() => { reload().catch(() => {}); }, [reload]);
  const toast = useCallback((m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2600); }, []);
  return (
    <Ctx.Provider value={{ home, prices, reload, toast }}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </Ctx.Provider>
  );
}

/** Price label from the member's own price list (after tier discount). */
export const price = (p: Prices, key: string, fallback: number) => p[key] ?? fallback;

// ---------------------------------------------------------------- bottom navigation
const I = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  discover: <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z" />,
  likes: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  chats: <path d="M4 5h16v11H8l-4 4z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
};
const TABS = [
  { href: "/home", label: "Home", tip: "Your day in the stars", icon: I.home, also: ["/kick"] },
  { href: "/discover", label: "Discover", tip: "Find people your stars like", icon: I.discover, also: ["/profile", "/filters", "/report"] },
  { href: "/likes", label: "Likes", tip: "See who liked you. Always free", icon: I.likes, also: [] },
  { href: "/matches", label: "Chats", tip: "Matches, chats and Saathi", icon: I.chats, also: ["/match", "/chat"] },
  { href: "/menu", label: "Menu", tip: "Wallet, kundli, store and settings", icon: I.menu, also: [] },
] as const;

export function BottomNav() {
  const path = usePathname();
  const { home } = useApp();
  return (
    <nav className="nav" aria-label="Main">
      {TABS.map((t, i) => {
        const on = path === t.href || t.also.some((a) => path.startsWith(a));
        const badge = t.href === "/likes" ? home?.likes_count : t.href === "/matches" ? home?.unread : 0;
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
            className={`tip tip-up${i === 0 ? "" : i === 4 ? " tip-r" : " tip-c"}`} data-tip={t.tip}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill={on && t.href === "/home" ? "#FFE7B8" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden="true">{t.icon}</svg>
            {t.label}<span className="dot" />
            {!!badge && <span className="badge" aria-label={`${badge} new`}>{badge > 99 ? "99+" : badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------- small pieces
export function Info({ text, cls = "" }: { text: string; cls?: string }) {
  return <span className={`info tip ${cls}`} tabIndex={0} role="note" aria-label={text} data-tip={text}>i</span>;
}

const PALETTE = [["#FFE4EC", "#E0457B"], ["#EDE6FF", "#7E5BEF"], ["#FFF3D6", "#B5590A"], ["#E4F4EE", "#2F7D63"], ["#DCEBFF", "#1F4FA8"]];
export const tint = (name: string) => PALETTE[(name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % PALETTE.length];

export function Avatar({ name, photo, size = 56, ring, style }: { name: string; photo?: string | null; size?: number; ring?: string; style?: React.CSSProperties }) {
  const [bg, fg] = tint(name);
  return (
    <span className="avatar" style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.4, border: ring ? `3px solid ${ring}` : undefined, ...style }}>
      {photo ? <img src={photo} alt="" /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Large photo area: real photo if there is one, otherwise the initial on a soft colour (as in the design). */
export function PhotoBlock({ name, photos, height, index = 0, children }: { name: string; photos: string[]; height: number; index?: number; children?: ReactNode }) {
  const [bg, fg] = tint(name);
  const src = photos[index];
  return (
    <div style={{ position: "relative", height, flex: "none", background: bg, display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--serif)", fontSize: 96, color: fg, overflow: "hidden" }}>
      {src ? <img src={src} alt={`${name}, photo ${index + 1}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
           : <span aria-hidden="true">{name.slice(0, 1)}</span>}
      {children}
    </div>
  );
}

export const Chevron = ({ color = "#5E5780" }: { color?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" aria-hidden="true" style={{ flex: "none" }}><path d="M9 5l7 7-7 7" /></svg>
);
export const LockIcon = ({ color = "#5E5780" }: { color?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);
export const Coin = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 8v8M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-3" /></svg>
);

export function CreditsPill({ label }: { label?: string }) {
  const { home } = useApp();
  return (
    <Link href="/wallet" className="pillbtn credits tip tip-r" data-tip="Your credits. 1 credit = ₹1">
      <Coin />{home ? home.balance : "…"}{label ? ` ${label}` : ""}
    </Link>
  );
}

export function SampleTag({ on }: { on?: boolean }) {
  return on ? <span className="sample-tag" title="Demo mode: this is a sample profile, not a real person">SAMPLE PROFILE</span> : null;
}

export const GOAL_LABEL: Record<string, string> = { dating: "Dating", matchmaking: "Matchmaking" };
export const TIER_LABEL: Record<string, string> = { tara: "Tara", graha: "Graha", surya: "Surya" };
export const DIET_LABEL: Record<string, string> = { vegetarian: "Vegetarian", jain: "Jain", eggetarian: "Eggetarian", non_veg: "Non-veg", vegan: "Vegan" };

export const ago = (iso: string) => {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return m < 2 ? "New" : `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
};
