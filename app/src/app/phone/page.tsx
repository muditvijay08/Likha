"use client";
// O2 Phone OTP
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BackButton, ErrorNote, Primary, Screen, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { resumePath, useFlow } from "@/lib/flow";

const CODES = [{ cc: "+91", label: "+91", digits: 10 }, { cc: "+971", label: "+971", digits: 9 }, { cc: "+1", label: "+1", digits: 10 }, { cc: "+44", label: "+44", digits: 10 }];

export default function Phone() {
  const router = useRouter();
  const { setDraft } = useFlow();
  const [cc, setCc] = useState("+91");
  const [num, setNum] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [wa, setWa] = useState(true);
  const [left, setLeft] = useState(0);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const send = useAction();
  const verify = useAction();

  useEffect(() => { if (left <= 0) return; const t = setTimeout(() => setLeft(left - 1), 1000); return () => clearTimeout(t); }, [left]);

  const clean = num.replace(/\D/g, "");
  const needed = CODES.find((c) => c.cc === cc)!.digits;
  const e164 = `${cc}${clean}`;
  const pretty = clean.length === 10 ? `${clean.slice(0, 5)} ${clean.slice(5)}` : clean;

  const sendCode = () => send.run(async () => {
    if (clean.length !== needed) throw new Error(`Enter your ${needed}-digit mobile number.`);
    await api().sendOtp(e164, wa ? "whatsapp" : "sms");
    setSentTo(e164); setDraft({ phone: e164 }); setLeft(30);
    setTimeout(() => boxes.current[0]?.focus(), 50);
  });

  const code = digits.join("");
  const doVerify = () => verify.run(async () => {
    if (code.length !== 6) throw new Error("Enter all 6 digits.");
    await api().verifyOtp(sentTo!, code);
    const s = await api().state();
    router.replace(s.has_profile ? resumePath(s) : "/consent");
  });

  function setDigit(i: number, v: string) {
    const only = v.replace(/\D/g, "");
    if (only.length > 1) {                                   // pasted or autofilled the whole code
      const all = only.slice(0, 6).split("");
      setDigits([0, 1, 2, 3, 4, 5].map((k) => all[k] ?? ""));
      boxes.current[Math.min(all.length, 5)]?.focus();
      return;
    }
    const next = [...digits]; next[i] = only; setDigits(next);
    if (only && i < 5) boxes.current[i + 1]?.focus();
  }

  return (
    <Screen style={{ gap: 22 }}>
      <BackButton href="/start" />
      <div className="stack">
        <h1 className="h1 big">What&apos;s your number?</h1>
        <p className="sub">We&apos;ll send a 6-digit code. Your number is never shown to anyone.</p>
      </div>

      <div className="field">
        <label htmlFor="phone" className="label">Mobile number</label>
        <div className="row">
          <label htmlFor="cc" className="sr">Country code</label>
          <select id="cc" className="input lg" value={cc} onChange={(e) => setCc(e.target.value)} style={{ width: 96, flex: "none" }} disabled={!!sentTo}>
            {CODES.map((c) => <option key={c.cc} value={c.cc}>{c.label}</option>)}
          </select>
          <input id="phone" className="input lg" inputMode="numeric" autoComplete="tel-national" placeholder="98290 41234" value={sentTo ? pretty : num}
            onChange={(e) => setNum(e.target.value)} disabled={!!sentTo} />
        </div>
        <span className="small">+971 numbers work too, for Dubai.</span>
      </div>

      {sentTo && (
        <section aria-label="Verification code" className="card" style={{ borderRadius: 20, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 14, lineHeight: 1.45 }}>Code sent to <strong>{cc} {pretty}</strong> ·{" "}
            <button type="button" className="linkbtn" style={{ fontSize: 14, fontWeight: 600 }} onClick={() => { setSentTo(null); setDigits(["", "", "", "", "", ""]); }}>Change</button></div>
          <div className="otp">
            {digits.map((d, i) => (
              <input key={i} ref={(el) => { boxes.current[i] = el; }} aria-label={`Digit ${i + 1}`} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"}
                className={d ? "on" : ""} value={d} maxLength={i === 0 ? 6 : 1}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Backspace" && !d && i > 0) boxes.current[i - 1]?.focus(); if (e.key === "Enter") doVerify(); }} />
            ))}
          </div>
          <div className="row" style={{ justifyContent: "space-between", fontSize: 13, color: "var(--muted)" }}>
            {left > 0 ? <span>Resend in 0:{String(left).padStart(2, "0")}</span>
              : <button type="button" className="linkbtn" style={{ fontSize: 13 }} onClick={sendCode}>Resend code</button>}
            <span>Code expires in 5 min</span>
          </div>
        </section>
      )}

      <label htmlFor="wa" className="check" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="stack" style={{ gap: 2 }}><strong>Get the code on WhatsApp</strong><span className="small">Faster on most phones</span></span>
        <input id="wa" type="checkbox" checked={wa} onChange={(e) => setWa(e.target.checked)} />
      </label>

      <div className="grow" />
      <div className="stack" style={{ gap: 10 }}>
        <ErrorNote error={send.error ?? verify.error} />
        {sentTo ? <Primary onClick={doVerify} busy={verify.busy} disabled={code.length !== 6}>Verify</Primary>
                : <Primary onClick={sendCode} busy={send.busy}>Send code</Primary>}
        <div className="small" style={{ textAlign: "center" }}>5 wrong tries locks sign-in for 1 hour.</div>
        {api().demo && <div className="small" style={{ textAlign: "center" }}>Demo mode: the code is 123456.</div>}
      </div>
    </Screen>
  );
}
