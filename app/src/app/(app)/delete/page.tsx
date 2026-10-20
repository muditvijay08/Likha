"use client";
// P5 Delete account: reason, what you lose, confirm with a fresh OTP. Data is erased within 30 days (payment records kept for tax law).
import Link from "next/link";
import { useEffect, useState } from "react";
import { BackButton, ErrorNote, Primary, useAction } from "@/components/ui";
import { api, type History } from "@/lib/api";

const WHY = ["I found someone", "Taking a break", "Privacy worries", "Something else"];

export default function Delete() {
  const [why, setWhy] = useState(WHY[1]);
  const [h, setH] = useState<History | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [step, setStep] = useState<"why" | "code">("why");
  const [code, setCode] = useState("");
  const { busy, error, run } = useAction();
  useEffect(() => { api().history().then(setH).catch(() => {}); api().wallet().then((w) => setBalance(w.balance)).catch(() => {}); }, []);
  const active = (h?.plans ?? []).filter((p) => p.status === "active");
  const send = () => run(async () => { await api().sendDeleteOtp(); setStep("code"); });
  const confirm = () => run(async () => { await api().deleteAccount(code, why); location.href = "/start?deleted=1"; });

  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <BackButton href="/settings" />
      <h1 className="h1">Leaving the stars?</h1>
      {step === "why" ? <>
        <div role="radiogroup" aria-label="Why are you leaving" className="stack" style={{ gap: 8 }}>
          {WHY.map((w) => <button key={w} type="button" role="radio" aria-checked={why === w} className="rcard" onClick={() => setWhy(w)}><span className="dot" />{w}</button>)}
        </div>
        {why === "I found someone" && (
          <Link href="/couple" className="stack" style={{ gap: 4, padding: "14px 16px", borderRadius: 18, background: "var(--rose-soft)", color: "var(--ink)", textDecoration: "none" }}>
            <strong>Congratulations! Try Couple Mode instead?</strong><span style={{ fontSize: 13, color: "#8A3A55" }}>Hide from Discover and keep your story, readings and chats.</span></Link>
        )}
        {why === "Taking a break" && <Link href="/settings" className="note" style={{ textDecoration: "none", color: "var(--ink)" }}><span><strong>Pause instead?</strong> You disappear from Discover, chats stay, nothing is lost.</span></Link>}
        <div className="card stack" style={{ gap: 4, fontSize: 13, borderRadius: 16 }}>
          <strong style={{ fontSize: 14 }}>If you delete</strong>
          {balance !== null && balance > 0 && <span>Your {balance.toLocaleString("en-IN")} unused credits will be lost.</span>}
          {active.length > 0 && <span>Your {active.map((p) => p.label).join(" and ")} stop{active.length === 1 ? "s" : ""} now.</span>}
          <span>Your matches and chats close for both sides.</span>
          <span>Your data is erased within 30 days. Payment records are kept as tax law requires.</span>
        </div>
        <ErrorNote error={error} />
        <div className="grow" />
        <Link href="/settings" className="btn ghost">Pause my profile instead</Link>
        <Primary onClick={send} busy={busy}>Delete account with OTP</Primary>
      </> : <>
        <p className="sub">We sent a 6-digit code to your phone. Enter it to delete your account.{api().demo ? " (Demo code: 123456)" : ""}</p>
        <div className="field"><label htmlFor="del-otp" className="label">Code</label>
          <input id="del-otp" className="input lg" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></div>
        <ErrorNote error={error} />
        <div className="grow" />
        <button type="button" className="btn" style={{ background: "var(--red)", color: "#fff" }} onClick={confirm} disabled={busy || code.length !== 6}>{busy ? "Deleting…" : "Delete my account"}</button>
        <button type="button" className="btn text" onClick={() => setStep("why")}>Go back</button>
      </>}
    </div>
  );
}
