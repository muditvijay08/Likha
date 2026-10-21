"use client";
// O1 Landing and gender pick
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Screen } from "@/components/ui";
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

function Hero() {
  return (
    <div style={{ position: "relative", height: 290, flex: "none", maxWidth: 342, width: "100%", alignSelf: "center" }}>
      <svg width="290" height="290" viewBox="0 0 290 290" aria-hidden="true" style={{ position: "absolute", left: 21, top: 0 }}>
        <circle cx="145" cy="145" r="138" fill="none" stroke="#E7E1F5" strokeWidth="1.5" />
        <circle cx="145" cy="145" r="98" fill="none" stroke="#E7E1F5" strokeWidth="1.5" strokeDasharray="4 6" />
        <circle cx="145" cy="145" r="58" fill="#FFF3D6" />
        <circle cx="283" cy="145" r="7" fill="#FFB020" /><circle cx="76" cy="76" r="5" fill="#FF7A9A" />
        <circle cx="145" cy="7" r="4" fill="#7E5BEF" /><circle cx="214" cy="214" r="4" fill="#7E5BEF" />
      </svg>
      <div style={{ position: "absolute", left: 36, top: 64, width: 148, height: 188, borderRadius: 20, background: "#fff", border: "1px solid var(--line)",
        transform: "rotate(-8deg)", boxShadow: "0 10px 28px rgba(30,24,56,.10)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ flex: 1, background: "#EDE6FF", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--serif)", fontSize: 52, color: "#9C88E6" }}>M</div>
        <div style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}><span>Meera, 25</span><span style={{ color: "var(--link)" }}>88%</span></div>
      </div>
      <div style={{ position: "absolute", left: 172, top: 40, width: 156, height: 200, borderRadius: 20, background: "#fff", border: "1px solid var(--line)",
        transform: "rotate(6deg)", boxShadow: "0 10px 28px rgba(30,24,56,.12)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ position: "relative", flex: 1, background: "#FFE4EC", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--serif)", fontSize: 56, color: "#E0457B" }}>R
          <span style={{ position: "absolute", top: 10, left: 10, background: "#FFB020", color: "#1E1838", borderRadius: 10, padding: "4px 8px", font: "700 13px var(--sans)" }}>92%</span>
        </div>
        <div style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}><span>Riya, 26</span><span style={{ color: "var(--muted)", fontWeight: 600 }}>27 Gunas</span></div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, textAlign: "center", fontSize: 11, color: "var(--muted)" }}>Sample profiles</div>
    </div>
  );
}
