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

// Why Likha, for the person who just picked. Ad-style, but every line is a real feature; credits come from Admin > Onboarding.
type Pitch = { photo: "her" | "him"; kicker: string; title: string; sub: string; points: [string, string][] };
const WHY: Record<string, Pitch> = {
  woman: { photo: "her", kicker: "FOR HER", title: "Dating, on your terms.", sub: "Safe. Real. Written in your stars.", points: [
    ["\u2728", "You make the first move. Or don\u2019t."],
    ["\ud83d\udd2e", "Know if the stars agree, before you say hi."],
    ["\ud83d\ude48", "Go incognito. Only people you like see you."],
    ["\ud83d\udee1\ufe0f", "No numbers in first chats. One-tap SOS on dates."],
    ["\ud83d\udc8c", "See who likes you. Free."],
  ] },
  man: { photo: "him", kicker: "FOR HIM", title: "Stop swiping blind.", sub: "See if the stars agree before you like.", points: [
    ["\ud83d\udd2e", "Jodi Score + 36 gunas on every profile."],
    ["\ud83d\udcab", "Cosmic Like: say hi before you match."],
    ["\ud83d\udcac", "Never open with \u201chey\u201d again. Cupid helps."],
    ["\u23f0", "Golden Hours: text when it counts."],
    ["\ud83d\udc8c", "See who likes you. Free."],
  ] },
};

function Why({ gender, credits, onGo, onBack }: { gender: Gender; credits: number; onGo(): void; onBack(): void }) {
  const w = WHY[gender] ?? WHY.woman;
  return (
    <Screen style={{ gap: 18, paddingTop: 0 }}>
      <div style={{ position: "relative", margin: "0 -24px", height: 300, overflow: "hidden", background: "linear-gradient(160deg, var(--g-ink), #1E1838)" }}>
        <StockPhoto name={w.photo} eager sizes="(max-width: 480px) 100vw, 480px" />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(20,16,40,.15) 30%, rgba(20,16,40,.88))" }} />
        <button type="button" onClick={onBack} aria-label="Change"
          style={{ position: "absolute", top: 14, left: 16, border: 0, borderRadius: 999, padding: "6px 12px", background: "rgba(255,255,255,.9)", font: "600 13px var(--sans)", color: "var(--ink)" }}>‹ Change</button>
        <span style={{ position: "absolute", top: 20, right: 14, fontSize: 10, color: "rgba(255,255,255,.85)", textShadow: "0 1px 2px rgba(0,0,0,.5)" }}>Models · Pexels</span>
        <div style={{ position: "absolute", left: 24, right: 24, bottom: 22, color: "#fff" }}>
          <span style={{ font: "800 11px var(--sans)", letterSpacing: ".14em", color: "#FFD98A" }}>{w.kicker}</span>
          <h1 style={{ margin: "6px 0 4px", font: "700 36px/1.05 var(--serif)" }}>{w.title}</h1>
          <span style={{ fontSize: 15, opacity: .9 }}>{w.sub}</span>
        </div>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        {w.points.map(([icon, t]) => (
          <li key={t} className="row" style={{ gap: 12, alignItems: "center", font: "600 16px/1.3 var(--sans)" }}>
            <span aria-hidden="true" style={{ width: 36, height: 36, flex: "none", borderRadius: 12, background: "var(--g-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{icon}</span>
            {t}
          </li>
        ))}
      </ul>
      <div className="stack" style={{ gap: 10, padding: 16, borderRadius: 20, background: "linear-gradient(150deg, #241C46, #3A2A6B)", color: "#fff" }}>
        <span style={{ font: "800 11px var(--sans)", letterSpacing: ".14em", color: "#FFD98A" }}>YOUR DATING SIDEKICKS</span>
        <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
          <span aria-hidden="true" style={{ fontSize: 26 }}>👵</span>
          <span className="stack" style={{ gap: 2 }}><strong style={{ fontSize: 15 }}>Rishta Maasi</strong>
            <span style={{ fontSize: 13, opacity: .85 }}>{gender === "man" ? "\u201cBeta, she\u2019s a Pisces Moon.\u201d" : "\u201cBeta, he\u2019s a Pisces Moon.\u201d"} 3 hand-picked people, every Sunday. <em>Maasi plan</em></span></span>
        </div>
        <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
          <span aria-hidden="true" style={{ fontSize: 26 }}>🌙</span>
          <span className="stack" style={{ gap: 2 }}><strong style={{ fontSize: 15 }}>Saathi</strong>
            <span style={{ fontSize: 13, opacity: .85 }}>Talk anytime, warm up before a date. A virtual companion, not a real person.</span></span>
        </div>
      </div>
      {credits > 0 && (
        <div className="row" style={{ gap: 14, padding: "14px 18px", borderRadius: 18, background: "linear-gradient(120deg, #FFE7A8, #FFC94D)", border: "2px dashed rgba(120,70,0,.35)" }}>
          <strong style={{ font: "700 40px/1 var(--serif)", color: "#5A3300" }}>{credits}</strong>
          <span className="stack" style={{ gap: 2 }}>
            <strong style={{ fontSize: 15, color: "#3D2300" }}>free credits, on us</strong>
            <span style={{ fontSize: 12, color: "#5A3300" }}>Earned as you set up your profile</span>
          </span>
        </div>
      )}
      <div className="grow" />
      <button type="button" className="btn" onClick={onGo}>{credits > 0 ? `Claim my ${credits} credits \u2192` : "Let\u2019s go \u2192"}</button>
      <span className="small" style={{ textAlign: "center" }}>Takes about 3 minutes. Jo likha hai, woh milega.</span>
    </Screen>
  );
}
