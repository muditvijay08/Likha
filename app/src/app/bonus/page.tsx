"use client";
// O15 Welcome bonus: paid automatically at 100% (profile complete + selfie passed).
import Link from "next/link";
import { useEffect, useState } from "react";
import { BackButton, Screen } from "@/components/ui";
import { api, type OnboardingState, type Refresh } from "@/lib/api";
import { useFlow } from "@/lib/flow";
import { useGuard } from "@/lib/guard";

export default function Bonus() {
  useGuard();
  const { settings, gender, reload } = useFlow();
  const [r, setR] = useState<Refresh | null>(null);
  const [s, setS] = useState<OnboardingState | null>(null);

  useEffect(() => { (async () => { setR(await api().refresh()); setS(await reload()); })().catch(() => {}); }, [reload]);

  const bonus = settings?.welcome_bonus?.[gender] ?? (gender === "woman" ? 150 : 70);
  const pct = r?.pct ?? s?.pct ?? 0;
  const done = pct >= 100;
  const items: [string, boolean, string][] = s ? [
    ["Basic details and lifestyle", (s.step ?? 0) >= 3, "/basics"],
    ["Birth details", !!s.has_birth, "/birth"],
    ["2 or more photos", (s.photos ?? 0) >= 2, "/photos"],
    ["Selfie verified", s.selfie_status === "passed", "/selfie"],
    ["2 prompts answered", (s.prompts ?? 0) >= 2, "/vibe"],
    ["Dating or matchmaking", !!s.goal, "/goal"],
    ["Who to show you", !!s.has_prefs, "/preferences"],
  ] : [];
  const left = items.filter((i) => !i[1]);
  const C = 2 * Math.PI * 52;

  return (
    <Screen style={{ gap: 18 }}>
      <BackButton href="/install" />
      <div className="card row" style={{ gap: 18, borderRadius: 22, background: "var(--saffron-soft)", borderColor: "#FFE1A3" }}>
        <div style={{ position: "relative", width: 120, height: 120, flex: "none" }}>
          <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={`Profile ${pct} percent complete`}>
            <circle cx="60" cy="60" r="52" fill="none" stroke="#FFFFFF" strokeWidth="12" />
            <circle cx="60" cy="60" r="52" fill="none" stroke="#FFB020" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(pct / 100) * C} ${C}`} transform="rotate(-90 60 60)" />
          </svg>
          <span style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <strong style={{ fontSize: 26 }}>{pct}%</strong><span className="small">complete</span></span>
        </div>
        <div className="stack" style={{ gap: 2 }}>
          <span className="kicker">WELCOME BONUS</span>
          <strong style={{ fontFamily: "var(--serif)", fontSize: 28 }}>{bonus} credits</strong>
          <span className="small">{done ? (r?.balance ? `In your wallet. Balance ${r.balance}.` : "On its way to your wallet.") : "waiting at 100%"}</span>
        </div>
      </div>

      <h1 className="h1">{done ? "You're all set. Credits unlocked." : left.length === 1 ? "One step to your cosmic credits" : `${left.length} steps to your cosmic credits`}</h1>
      <ul className="card stack" style={{ listStyle: "none", margin: 0, gap: 0, padding: "4px 16px" }}>
        {items.map(([t, ok, href]) => (
          <li key={t} className="row" style={{ gap: 10, fontSize: 14, padding: "10px 0", borderTop: "1px solid var(--line-soft)" }}>
            <span aria-hidden="true" style={{ width: 22, height: 22, flex: "none", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
              background: ok ? "#2F7D63" : "#fff", border: ok ? 0 : "2px solid #D5CFE6", color: "#fff", fontSize: 13 }}>{ok ? "✓" : ""}</span>
            <span style={{ flex: 1, color: ok ? "var(--muted)" : "var(--ink)", fontWeight: ok ? 500 : 700 }}>{t}<span className="sr">{ok ? " (done)" : " (to do)"}</span></span>
            {!ok && <Link href={href} style={{ fontWeight: 700, fontSize: 14 }}>Add</Link>}
          </li>
        ))}
      </ul>
      <div className="small" style={{ lineHeight: 1.5 }}>One bonus per person. Women get {settings?.welcome_bonus?.woman ?? 150} credits, men get {settings?.welcome_bonus?.man ?? 70}.
        Bonus credits expire {settings?.welcome_bonus?.expiry_days ?? 90} days after they land and are used before purchased ones.</div>
      <div className="grow" />
      {!done && left[0] && <Link className="btn" href={left[0][2]}>Finish my profile</Link>}
      <Link className={done ? "btn" : "btn text"} href="/tour/1">{done ? "Show me around" : "Do it later"}</Link>
    </Screen>
  );
}
