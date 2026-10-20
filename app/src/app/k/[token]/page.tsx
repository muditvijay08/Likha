"use client";
// L1 Check With Anyone landing (likha.in/k/<token>). The sender stays anonymous until the reading opens; nothing about the visitor is read until they join and agree.
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Screen } from "@/components/ui";
import { api, type CrushLanding } from "@/lib/api";
import { saveClaim } from "@/lib/referral";

export default function CrushLandingPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [v, setV] = useState<CrushLanding | null | undefined>(undefined);
  const [agree, setAgree] = useState(false);
  useEffect(() => { api().crushLanding(token).then(setV).catch(() => setV(null)); }, [token]);
  const join = async () => {
    saveClaim({ type: "crush", token });
    router.push((await api().signedIn().catch(() => false)) ? "/home" : "/start");
  };
  if (v === undefined) return <Screen><div className="skel" style={{ height: 240 }} /></Screen>;
  if (!v || !v.open) return (
    <Screen><div className="wordmark">Likha<span>.</span></div><h1 className="h1">This link has ended</h1>
      <p className="sub">It was already used, or 30 days have passed. You can still join Likha and see who your kundli matches with.</p>
      <a className="btn" href="/start">Join Likha</a></Screen>
  );
  return (
    <Screen style={{ gap: 14 }}>
      <div className="wordmark">Likha<span>.</span></div>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", color: "var(--rose-ink)" }}>JO LIKHA HAI, WOH MILEGA</span>
      <h1 className="h1">Hi {v.name}, someone who knows you wants to see how your kundlis match</h1>
      <p className="sub">They&apos;ve already paid for it. If you join and say yes, you both see the same reading: your Gunas, how your Moons get along, and what to watch for.</p>
      <ul className="sub" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
        <li>Join with the mobile number this link was sent to.</li><li>Your birth details are used only for this reading and your own profile.</li>
        <li>Only the two of you see the reading.</li></ul>
      <label className="row" style={{ gap: 10, fontSize: 14, alignItems: "flex-start" }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
        <span>I agree to my kundli being matched with theirs for this one reading.</span></label>
      <div className="grow" />
      <button type="button" className="btn" disabled={!agree} onClick={join}>Join and see the reading</button>
      <a className="btn text" href="/">Not interested</a>
    </Screen>
  );
}
