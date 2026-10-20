"use client";
// likha.in/i/<code>: a friend's invite. Saves the code for sign-up, where it's redeemed once the profile exists.
import { useParams, useRouter } from "next/navigation";
import { Screen } from "@/components/ui";
import { useFlow } from "@/lib/flow";

export default function InviteLanding() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { setDraft } = useFlow();
  const go = () => { setDraft({ inviteCode: decodeURIComponent(code) }); router.push("/start"); };
  return (
    <Screen style={{ gap: 14 }}>
      <div className="wordmark">Likha<span>.</span></div>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", color: "var(--rose-ink)" }}>YOU&apos;RE INVITED</span>
      <h1 className="h1">A friend invited you to Likha</h1>
      <p className="sub">Dating that starts with your kundli. Every profile is selfie-verified. Join with your friend&apos;s code and you both get bonus credits once you&apos;re verified.</p>
      <div className="card stack" style={{ gap: 4, borderRadius: 18 }}><span className="label">Invite code</span><strong style={{ fontSize: 20 }}>{decodeURIComponent(code)}</strong></div>
      <div className="grow" />
      <button type="button" className="btn" onClick={go}>Join Likha</button>
    </Screen>
  );
}
