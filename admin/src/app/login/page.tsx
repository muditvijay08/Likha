"use client";
// Team sign-in: email code, then the authenticator app (set up once). Admin data needs both (aal2).
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAction } from "@/components/shell";
import { api } from "@/lib/api";

type Step = "email" | "code" | "enroll" | "mfa";

export default function Login() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(""); const [code, setCode] = useState(""); const [otp, setOtp] = useState("");
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [factor, setFactor] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  const afterSignIn = async () => {
    const me = await api().me();
    if (!me) { await api().signOut(); throw new Error("This account isn't on the Likha team."); }
    const s = await api().mfaState();
    if (s.level === "aal2") { router.replace("/"); return; }
    if (s.factorId) { setFactor(s.factorId); setStep("mfa"); } else { setEnroll(await api().enrollMfa()); setStep("enroll"); }
  };
  useEffect(() => { api().mfaState().then((s) => { if (s.level) run(afterSignIn); }).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="center">
      <form className="login card" onSubmit={(e) => { e.preventDefault();
        if (step === "email") run(async () => { await api().sendCode(email.trim()); setStep("code"); });
        else if (step === "code") run(async () => { await api().verifyCode(email.trim(), code.trim()); await afterSignIn(); });
        else run(async () => { await api().verifyMfa(step === "enroll" ? enroll!.factorId : factor!, otp.trim()); router.replace("/"); });
      }}>
        <div style={{ font: "600 26px var(--serif)" }}>Likha<span style={{ color: "var(--saffron)" }}>.</span> <span className="small" style={{ fontFamily: "var(--sans)", fontWeight: 700, letterSpacing: ".1em" }}>ADMIN</span></div>
        {api().demo && <div className="note">Demo admin: any email, codes are 123456.</div>}
        {step === "email" && <>
          <label className="f">Work email<input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <button className="btn big" disabled={busy || !email.includes("@")}>Send code</button>
        </>}
        {step === "code" && <>
          <p className="sub">We sent a 6-digit code to {email}.</p>
          <label className="f">Code<input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} /></label>
          <button className="btn big" disabled={busy || code.trim().length !== 6}>Continue</button>
        </>}
        {step === "enroll" && enroll && <>
          <h2>Set up your authenticator app</h2>
          <p className="sub">Admin needs a second step every time. Scan this in Google Authenticator, Microsoft Authenticator or 1Password, then type the 6-digit code.</p>
          <img src={enroll.qr} alt="QR code for your authenticator app" width={160} height={160} style={{ alignSelf: "center", border: "1px solid var(--line)", borderRadius: 12 }} />
          <span className="small">Can&apos;t scan? Enter this key: <span className="mono">{enroll.secret}</span></span>
          <label className="f">Code from the app<input className="input" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} /></label>
          <button className="btn big" disabled={busy || otp.trim().length !== 6}>Turn on and sign in</button>
        </>}
        {step === "mfa" && <>
          <h2>Authenticator code</h2>
          <label className="f">6-digit code from your authenticator app<input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} /></label>
          <button className="btn big" disabled={busy || otp.trim().length !== 6}>Sign in</button>
        </>}
        {error && <p className="err" role="alert">{error}</p>}
        <span className="small">Team members only. Every change is logged with your name.</span>
      </form>
    </div>
  );
}
