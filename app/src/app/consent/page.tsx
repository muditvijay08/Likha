"use client";
// O3 Age and consent. Consents are saved with the profile in the next step (they need a profile row).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BackButton, ErrorNote, Primary, Screen, Shield } from "@/components/ui";
import { useFlow } from "@/lib/flow";
import { useGuard } from "@/lib/guard";

const ITEMS = [
  { id: "age", key: null, title: <>I&apos;m 18 or older</>, note: "Required. We check this again with your date of birth.", required: true },
  { id: "terms", key: "terms_privacy", title: <>I agree to the <Link href="/legal/terms">Terms</Link> and <Link href="/legal/privacy">Privacy Policy</Link></>, note: "Required.", required: true },
  { id: "birth", key: "birth_matching", title: <>Use my birth details to build my kundli and matches</>, note: "Required. Never shown on your profile.", required: true },
  { id: "photo", key: "selfie", title: <>Use my photos and selfie for verification and safety</>, note: "Required. The selfie is deleted after the check.", required: true },
  { id: "offers", key: "marketing", title: <>Send me offers on WhatsApp and email</>, note: "Optional. Change anytime in Settings.", required: false },
] as const;

export default function Consent() {
  useGuard(false);
  const router = useRouter();
  const { setDraft, draft } = useFlow();
  const [on, setOn] = useState<Record<string, boolean>>({ age: false, terms: false, birth: false, photo: false, offers: false });
  const [error, setError] = useState<string | null>(null);

  function next() {
    if (ITEMS.some((i) => i.required && !on[i.id])) { setError("Please tick the four required boxes to continue."); return; }
    setDraft({ consents: ITEMS.filter((i) => i.key && on[i.id]).map((i) => i.key as string), marketing: on.offers });
    router.push(draft.gender ? "/basics" : "/start");
  }

  return (
    <Screen style={{ gap: 20 }}>
      <BackButton href="/phone" />
      <div className="stack">
        <h1 className="h1 big">Before we begin</h1>
        <p className="sub">A few promises, both ways.</p>
      </div>
      <div className="stack" style={{ gap: 10 }}>
        {ITEMS.map((i) => (
          <label key={i.id} htmlFor={`c-${i.id}`} className={`check${i.required ? "" : " optional"}`}>
            <input id={`c-${i.id}`} type="checkbox" checked={on[i.id]} onChange={(e) => { setOn({ ...on, [i.id]: e.target.checked }); setError(null); }} />
            <span className="stack" style={{ gap: 2 }}><strong>{i.title}</strong><span className="small">{i.note}</span></span>
          </label>
        ))}
      </div>
      <div className="grow" />
      <div className="stack" style={{ gap: 12 }}>
        <div className="trust"><Shield />Consent recorded under India&apos;s DPDP Act. Withdraw anytime.</div>
        <ErrorNote error={error} />
        <Primary onClick={next}>Agree and continue</Primary>
      </div>
    </Screen>
  );
}
