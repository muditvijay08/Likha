"use client";
// O1 Landing and gender pick
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  // Arrived from Log in with a number that has no account yet (already signed in): just pick, then carry on.
  const [fresh, setFresh] = useState(false);
  useEffect(() => { setFresh(new URLSearchParams(window.location.search).get("new") === "1"); }, []);

  // Picking sets the app's colours, then shows what Likha does for them before the phone step.
  const [picked, setPicked] = useState<Gender | null>(null);
  function choose(g: Gender) {
    setDraft({ gender: g, inviteCode: code.trim() || undefined });
    document.documentElement.dataset.gender = g;
    setPicked(g);
    window.scrollTo({ top: 0 });
  }
  async function go() { router.push((await api().signedIn()) ? "/consent" : "/phone"); }
  const credits = picked ? (settings?.onboarding_step_credits?.[picked] ?? []).reduce((a, b) => a + b, 0) : 0;
  if (picked) return <Why gender={picked} credits={credits} onGo={go} onBack={() => setPicked(null)} />;

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
        {fresh && <div className="note" role="status"><span>No account with that number yet. Pick one below to set it up.</span></div>}
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
        {!fresh && <div className="small" style={{ textAlign: "center", fontSize: 14 }}>Already on Likha? <Link href="/login" style={{ fontWeight: 700 }}>Log in</Link></div>}
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

// Why Likha, for the person who just picked. Every line is a real feature; credits come from Admin > Onboarding.
const WHY: Record<string, { title: string; points: [string, string][] }> = {
  woman: { title: "Made for you to feel safe and in control", points: [
    ["You set the pace", "Message first only if you want to. Go incognito, so only people you like can see you."],
    ["Real, verified people", "Everyone takes a selfie check. Numbers and links stay hidden in first messages."],
    ["Safe dates, built in", "Share your date with someone you trust. Likha checks in afterwards, and SOS is one tap away."],
    ["See who likes you, free", "And your kundli match on every profile, before you decide."],
  ] },
  man: { title: "Better matches. Better conversations.", points: [
    ["Know before you like", "Your Jodi Score and 36-Guna match on every profile, from both real charts."],
    ["Stand out", "Send a Cosmic Like with a note. Cupid suggests openers better than \u201chey\u201d."],
    ["Text at the right time", "Golden Hours show when your stars line up to talk."],
    ["See who likes you, free", "No paywall on your likes."],
  ] },
};

function Why({ gender, credits, onGo, onBack }: { gender: Gender; credits: number; onGo(): void; onBack(): void }) {
  const w = WHY[gender] ?? WHY.woman;
  return (
    <Screen style={{ gap: 18 }}>
      <button type="button" className="linkbtn" onClick={onBack} style={{ alignSelf: "flex-start", fontSize: 14 }}>‹ Change</button>
      <div className="stack" style={{ gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", color: "var(--g-ink)" }}>WHY LIKHA</span>
        <h1 className="h1 big" style={{ margin: 0 }}>{w.title}</h1>
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        {w.points.map(([t, d], i) => (
          <li key={t} className="row" style={{ gap: 14, alignItems: "flex-start", padding: 14, borderRadius: 18, background: "#fff", border: "1px solid var(--line)" }}>
            <span aria-hidden="true" style={{ width: 32, height: 32, flex: "none", borderRadius: 999, background: "var(--g-soft)", color: "var(--g-ink)", display: "flex", alignItems: "center", justifyContent: "center", font: "700 14px var(--sans)" }}>{i + 1}</span>
            <span className="stack" style={{ gap: 3 }}><strong style={{ fontSize: 15 }}>{t}</strong><span style={{ fontSize: 13, lineHeight: 1.45, color: "var(--muted)" }}>{d}</span></span>
          </li>
        ))}
      </ol>
      {credits > 0 && (
        <div className="row" style={{ gap: 10, padding: "12px 14px", borderRadius: 16, background: "var(--saffron-soft)", fontSize: 14 }}>
          <strong style={{ fontFamily: "var(--serif)", fontSize: 22, color: "var(--saffron-ink)" }}>{credits}</strong>
          <span>free credits as you set up your profile</span>
        </div>
      )}
      <div className="grow" />
      <button type="button" className="btn" onClick={onGo}>Continue</button>
      <span className="small" style={{ textAlign: "center" }}>Takes about 3 minutes.</span>
    </Screen>
  );
}
