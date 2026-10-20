"use client";
// Q1 How's it going? A short check-in at 30, 90 and 180 days for pairs who are actually talking. Private: they never see your answer.
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { BackButton, ErrorNote, useAction } from "@/components/ui";
import { api } from "@/lib/api";

const ANSWERS: { key: string; label: string; reply: string; links: [string, string][] }[] = [
  { key: "great", label: "Going really well", reply: "Lovely. When you're both ready, Couple Mode takes you out of Discover together.", links: [["couple", "Couple Mode"], ["story", "Our Story"]] },
  { key: "slow", label: "Taking it slow", reply: "Slow is good. Golden Hours shows the easiest times to talk this week.", links: [["golden", "Golden Hours"], ["universe", "Our Universe"]] },
  { key: "unsure", label: "Not sure yet", reply: "That's normal. Seven Questions is a light way to find out more about each other.", links: [["seven", "Seven Questions"], ["guru", "Ask Guru Ji"]] },
  { key: "stopped", label: "We've stopped talking", reply: "Thanks for telling us. It happens, and it says nothing bad about you. Discover has new people every day.", links: [] },
];

function Together() {
  const { match } = useParams<{ match: string }>();
  const q = useSearchParams();
  const day = Number(q.get("day") ?? 30); const name = q.get("name") ?? "them";
  const [done, setDone] = useState<(typeof ANSWERS)[number] | null>(null);
  const { busy, error, run } = useAction();
  const pick = (a: (typeof ANSWERS)[number]) => run(async () => { await api().answerCheckin(match, day, a.key); setDone(a); });
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/home" /><h1>{day} days</h1></div>
      {done ? <>
        <div className="card stack" style={{ gap: 8, borderRadius: 20 }}><strong>Thanks</strong><span className="sub">{done.reply}</span></div>
        {done.links.map(([r, l]) => <Link key={r} className="btn ghost" href={`/${r}/${match}`}>{l}</Link>)}
        {done.key === "stopped" && <Link className="btn" href="/discover">Go to Discover</Link>}
        <Link className="btn text" href="/home">Back to Home</Link>
      </> : <>
        <h2 className="serif" style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>{day} days since you matched with {name}. How&apos;s it going?</h2>
        <span className="sub">Just for you. {name} never sees your answer.</span>
        <div className="stack" style={{ gap: 8 }}>
          {ANSWERS.map((a) => <button key={a.key} type="button" className="chip" style={{ justifyContent: "flex-start", padding: "14px 16px" }} disabled={busy} onClick={() => pick(a)}>{a.label}</button>)}
        </div>
        <ErrorNote error={error} />
      </>}
    </div>
  );
}

export default function TogetherPage() { return <Suspense><Together /></Suspense>; }
