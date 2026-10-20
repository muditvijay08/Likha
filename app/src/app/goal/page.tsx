"use client";
// O10 Dating or matchmaking (step 7)
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorNote, Primary, Screen, StepHeader, useAction } from "@/components/ui";
import { api, type Goal } from "@/lib/api";
import { useGuard } from "@/lib/guard";

const OPTIONS: { v: Goal; title: string; body: string; icon: React.ReactNode }[] = [
  { v: "dating", title: "Dating", body: "Meet people, go on dates, see where the stars take it",
    icon: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /> },
  { v: "matchmaking", title: "Matchmaking", body: "Marriage-minded. Kundli first, then coffee.",
    icon: <><circle cx="9" cy="14" r="5" /><circle cx="15" cy="14" r="5" /><path d="M12 3l2 3h-4z" /></> },
];

export default function GoalPage() {
  const s = useGuard();
  const router = useRouter();
  const [goal, setGoal] = useState<Goal | null>(null);
  const { busy, error, run } = useAction();
  useEffect(() => { if (s?.goal) setGoal(s.goal); }, [s]);

  const submit = () => run(async () => {
    if (!goal) throw new Error("Pick one. You can change it anytime.");
    await api().saveGoal(goal);
    await api().setStep(8);
    await api().refresh();
    router.push("/preferences");
  });

  return (
    <Screen style={{ gap: 16 }}>
      <StepHeader step={7} back="/vibe" />
      <div className="stack">
        <h1 className="h1">What are you looking for?</h1>
        <p className="sub">Shown as a chip on your profile. Change it anytime.</p>
      </div>
      <div role="radiogroup" aria-label="Looking for" className="stack" style={{ gap: 12 }}>
        {OPTIONS.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={goal === o.v} className="rcard" onClick={() => setGoal(o.v)}>
            <span style={{ width: 44, height: 44, flex: "none", borderRadius: 12, background: o.v === "dating" ? "#FFFFFF" : "var(--red-soft)",
              display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--line)" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E0457B" strokeWidth="2" aria-hidden="true">{o.icon}</svg></span>
            <span className="stack" style={{ gap: 4, flex: 1 }}><strong style={{ fontSize: 17 }}>{o.title}</strong><span className="sub" style={{ fontSize: 13 }}>{o.body}</span></span>
            {goal === o.v && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B5590A" strokeWidth="2.6" aria-hidden="true" style={{ flex: "none", alignSelf: "center" }}><path d="M5 12l5 5L20 7" /></svg>}
          </button>
        ))}
      </div>
      <div className="grow" />
      <ErrorNote error={error} />
      <Primary onClick={submit} busy={busy}>Continue</Primary>
    </Screen>
  );
}
