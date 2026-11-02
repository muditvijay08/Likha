"use client";
// O1 Landing and gender pick
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Screen } from "@/components/ui";
import { StockPhoto } from "@/components/stock-photo";
import { useFlow } from "@/lib/flow";
import { api, type Gender } from "@/lib/api";

export default function Start() {
  const router = useRouter();
  const { setDraft, draft, settings } = useFlow();
  const options = settings?.gender_options ?? ["woman", "man"];          // Admin > Onboarding
  const [invite, setInvite] = useState(false);
  const [code, setCode] = useState(draft.inviteCode ?? "");

  async function choose(g: Gender) {
    setDraft({ gender: g, inviteCode: code.trim() || undefined });
    document.documentElement.dataset.gender = g;
    router.push((await api().signedIn()) ? "/consent" : "/phone");
  }

  const card = (g: Gender, label: string, icon: React.ReactNode, bg: string, bd: string, fg: string) => (
    <button type="button" onClick={() => choose(g)} style={{ height: 92, borderRadius: 18, background: bg, border: `2px solid ${bd}`, color: fg,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, font: "700 16px var(--sans)" }}>
      {icon}{label}
    </button>
  );

  return (
    <Screen>
      <div className="wordmark">Likha<span>.</span></div>
      <Hero />
      <div className="stack" style={{ gap: 10 }}>
        <h1 className="h1 hero">Swipe less. Jo likha hai, woh milega.</h1>
        <p className="sub" style={{ fontSize: 15 }}>Real people, matched by your kundli. Dating is free. Kundli milao, dil milao.</p>
      </div>
      <div className="grow" />
      <div className="stack" style={{ gap: 10 }}>
        <span className="label" style={{ fontWeight: 700 }}>I am a</span>
        <div className={options.length > 1 ? "grid2" : "stack"} style={{ gap: 10 }}>
          {options.includes("woman") && card("woman", "Woman", <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="9" r="5" /><path d="M12 14v7M9 18h6" /></svg>, "#FFF0F4", "#E0457B", "#A3164C")}
          {options.includes("man") && card("man", "Man", <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10" cy="14" r="5" /><path d="M14 10l6-6M15 4h5v5" /></svg>, "#EAF1FF", "#2F6FE0", "#1F4FA8")}
        </div>
        <span className="small" style={{ textAlign: "center" }}>Your pick sets the app&apos;s colours: rose for women, blue for men.</span>
        {invite ? (
          <div className="row">
            <label htmlFor="invite" className="sr">Invite code</label>
            <input id="invite" className="input" placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="none" />
          </div>
        ) : (
          <button type="button" className="btn ghost" onClick={() => setInvite(true)}>I have an invite code</button>
        )}
        <div className="row small" style={{ justifyContent: "center", gap: 10, paddingTop: 4, flexWrap: "wrap" }}>
          <span>18+ only</span><span aria-hidden="true">·</span><Link href="/legal/terms">Terms</Link><span aria-hidden="true">·</span>
          <Link href="/legal/privacy">Privacy</Link><span aria-hidden="true">·</span><Link href="/help">Grievance Officer</Link>
        </div>
      </div>
    </Screen>
  );
}

// A warm mood photo (stock models, labelled so). Falls back to the brand gradient if it can't load.
function Hero() {
  return (
    <div style={{ position: "relative", height: 300, flex: "none", borderRadius: 28, overflow: "hidden",
      background: "linear-gradient(135deg, #FFE7B8 0%, #FFD3E0 55%, #E3D8FF 100%)", boxShadow: "0 14px 34px rgba(30,24,56,.14)" }}>
      <StockPhoto name="laugh" eager sizes="(max-width: 480px) 100vw, 480px" />
      <span style={{ position: "absolute", left: 14, bottom: 14, padding: "6px 12px", borderRadius: 999, background: "rgba(30,24,56,.78)", color: "#FFD98A", font: "700 12px var(--sans)" }}>Written in the stars</span>
      <span style={{ position: "absolute", right: 12, bottom: 16, fontSize: 10, color: "rgba(255,255,255,.85)", textShadow: "0 1px 2px rgba(0,0,0,.5)" }}>Models · Pexels</span>
    </div>
  );
}
