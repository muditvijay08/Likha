// L5 Help (short version for onboarding). Full help centre comes with the Menu build.
import Link from "next/link";
import { BackButton, Screen } from "@/components/ui";

export default function Help() {
  return (
    <Screen style={{ gap: 14 }}>
      <BackButton />
      <h1 className="h1">Help</h1>
      <div className="card stack" style={{ gap: 6 }}>
        <strong>Grievance Officer</strong>
        <span style={{ fontSize: 14 }}>[NAME], Likha, Jaipur, Rajasthan</span>
        <a href="mailto:grievance@likha.in">grievance@likha.in</a>
        <span className="small">We acknowledge within 24 hours and resolve within 15 days.</span>
      </div>
      <div className="card stack" style={{ gap: 6 }}>
        <strong>Support</strong>
        <a href="mailto:help@likha.in">help@likha.in</a>
      </div>
      <div className="row small" style={{ gap: 12, flexWrap: "wrap" }}>
        <Link href="/legal/terms">Terms</Link><Link href="/legal/privacy">Privacy</Link><Link href="/legal/refunds">Refunds</Link><Link href="/legal/disclaimer">Astrology disclaimer</Link>
      </div>
    </Screen>
  );
}
