"use client";
// W1 Cosmic wallet: balance, tier progress, top-up packs, recent activity.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Info, Progress, rupees } from "@/components/app";
import { api, type Wallet } from "@/lib/api";

export default function WalletPage() {
  const router = useRouter();
  const [w, setW] = useState<Wallet | null>(null);
  const [pick, setPick] = useState("best");
  useEffect(() => { api().wallet().then(setW).catch(() => {}); }, []);
  if (!w) return <div className="app-body"><div className="skel" style={{ height: 500 }} /></div>;
  const pack = w.packs.find((p) => p.id === pick) ?? w.packs[0];
  const t = w.tier, next = t.next;

  return (
    <div className="app-body" style={{ gap: 16 }}>
      <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 30, fontWeight: 600 }}>Cosmic wallet</h1>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", padding: "18px 20px", borderRadius: 22, background: "#fff", border: "1px solid var(--line)" }}>
        <div className="stack" style={{ gap: 2 }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Balance</span>
          <span className="serif" style={{ fontSize: 40, fontWeight: 600, lineHeight: 1 }} data-testid="balance">{w.balance.toLocaleString("en-IN")} <span style={{ fontSize: 16, color: "var(--muted)" }}>credits</span></span>
        </div>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>1 credit = ₹1</span>
      </div>
      {w.expiring && <div className="note"><span><strong>{w.expiring.credits} bonus credits</strong> expire on {new Date(w.expiring.on).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}. Bought credits never expire.</span></div>}

      <Link href="/tiers" aria-label="Activity tier" style={{ padding: "18px 20px", borderRadius: 22, background: "#F4EFFF", border: "1px solid #9C88E6", display: "flex", flexDirection: "column", gap: 12, color: "var(--ink)", textDecoration: "none" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="stack" style={{ gap: 2 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Your tier<Info text="Tiers grow with real conversations and Kick streaks. Higher tier, bigger credit discount." /></span>
            <span className="serif" style={{ fontSize: 22, fontWeight: 600 }}>{t.tier === "none" ? "No tier yet" : `${t.label} · ${t.discount}% off`}</span>
          </div>
          {next && <span style={{ fontSize: 12, fontWeight: 700, background: "#C9B8FF", padding: "6px 10px", borderRadius: 999 }}>Next: {next.label} {next.discount}%</span>}
        </div>
        {t.paused_until && <span className="small">Paused until {new Date(t.paused_until).toLocaleDateString("en-IN")} after a report was upheld.</span>}
        {next && next.min_conversations > 0 && <Progress label="Real conversations" value={t.conversations} max={next.min_conversations} />}
        {next && next.min_streak_days > 0 && <Progress label="Daily Kick streak" value={t.streak} max={next.min_streak_days} />}
        {next && next.min_conversations === 0 && <span style={{ fontSize: 12, color: "#3D3560" }}>Verified, complete profile and active this week. Tiers update on the 1st of each month.</span>}
      </Link>

      <h2 style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 700 }}>Top up</h2>
      <div role="radiogroup" aria-label="Credit packs" className="grid2" style={{ gap: 10 }}>
        {w.packs.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={pick === p.id} onClick={() => setPick(p.id)}
            style={{ textAlign: "left", padding: 14, borderRadius: 18, background: pick === p.id ? "#FFF6E0" : "#fff", border: pick === p.id ? "2px solid var(--saffron)" : "1px solid var(--line)", color: "var(--ink)", display: "flex", flexDirection: "column", gap: 4 }}>
            {p.id === "best" && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--link)", letterSpacing: ".08em" }}>BEST VALUE</span>}
            <span style={{ fontSize: 20, fontWeight: 700 }}>{p.credits.toLocaleString("en-IN")}</span>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>credits{p.bonus_pct ? ` · +${p.bonus_pct}%` : ""}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--link)" }}>{rupees(p.price_paise)}</span>
          </button>
        ))}
      </div>
      <button type="button" className="btn" onClick={() => router.push(`/checkout?type=pack&key=${pack.id}`)}>Pay {rupees(pack.price_paise)} with UPI</button>
      <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>Credits land the moment payment confirms. Prices include GST.</div>

      {w.activity.length > 0 && (
        <section aria-label="Recent activity" className="stack" style={{ gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Recent activity</h2>
          <div className="listcard">
            {w.activity.slice(0, 12).map((a, i) => (
              <div key={i}><span className="stack" style={{ gap: 1 }}><span>{a.reason}</span><span className="small">{new Date(a.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></span>
                <strong style={{ color: a.delta > 0 ? "#1F5E49" : "var(--ink)" }}>{a.delta > 0 ? "+" : ""}{a.delta}</strong></div>
            ))}
          </div>
        </section>
      )}
      <Link href="/legal/refunds" className="small" style={{ textAlign: "center" }}>Refund policy</Link>
    </div>
  );
}
