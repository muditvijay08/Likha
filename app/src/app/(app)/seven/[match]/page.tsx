"use client";
// Seven Questions: one of you pays, both answer. You see their answer to a question once you've answered it too. Answers can't be changed.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BackButton, ErrorNote, useAction } from "@/components/ui";
import { useApp } from "@/components/app";
import { api, type SevenState } from "@/lib/api";
import { SEVEN } from "@/lib/seven";

export default function Seven() {
  const { match } = useParams<{ match: string }>();
  const { home, reload } = useApp();
  const [s, setS] = useState<SevenState | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const load = useCallback(() => api().seven(match).then(setS).catch(() => {}), [match]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {                                            // waiting on them: check every few seconds
    if (!s?.reading || Object.keys(s.mine).length < 7 || s.reading.status === "ready") return;
    const t = setTimeout(load, 3000); return () => clearTimeout(t);
  }, [s, load]);
  if (!s) return <div className="app-body pad"><div className="skel" style={{ height: 300 }} /></div>;
  const next = SEVEN.findIndex((_, i) => !s.mine[String(i + 1)]);
  const begin = () => run(async () => { await api().startSeven(match); await reload(); await load(); });
  const answer = () => run(async () => { if (!pick) return; await api().answerSeven(match, next + 1, pick); setPick(null); await load(); });

  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href={`/universe/${match}`} /><h1>Seven Questions</h1></div>
      {!s.reading ? <>
        <div style={{ padding: 18, borderRadius: 22, background: "#E4F4EE" }} className="stack">
          <strong className="serif" style={{ fontSize: 22 }}>Seven quick questions for you and {s.other_name}</strong>
          <span style={{ fontSize: 13, color: "#3D3560" }}>You both answer on your own phones. Once you&apos;ve both answered a question, you see each other&apos;s answer. When you&apos;ve both finished, we read your answers next to your charts.</span>
        </div>
        <ul className="sub" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}><li>One of you pays, both play.</li><li>Answers are locked once given.</li><li>Only the two of you see them.</li></ul>
        <ErrorNote error={error} />
        <div className="grow" />
        <button type="button" className="btn" disabled={busy} onClick={begin}>Start · {s.price} credits</button>
      </> : next >= 0 ? <>
        <span className="small">Question {next + 1} of 7 · {s.other_name} has answered {s.theirs_count}</span>
        <div style={{ height: 6, borderRadius: 999, background: "#ECE6FA" }}><div style={{ width: `${(next / 7) * 100}%`, height: 6, borderRadius: 999, background: "var(--rose)" }} /></div>
        <h2 className="serif" style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>{SEVEN[next].q}</h2>
        <div className="stack" role="radiogroup" aria-label={SEVEN[next].q} style={{ gap: 8 }}>
          {SEVEN[next].options.map((o) => <button key={o} type="button" role="radio" aria-checked={pick === o} className="chip" style={{ justifyContent: "flex-start", padding: "14px 16px" }}
            aria-pressed={pick === o} onClick={() => setPick(o)}>{o}</button>)}
        </div>
        <ErrorNote error={error} />
        <div className="grow" />
        <button type="button" className="btn" disabled={!pick || busy} onClick={answer}>Lock in answer</button>
      </> : <>
        <div className="card stack" style={{ gap: 6, borderRadius: 20 }}>
          {s.reading.status === "ready" ? <><strong>Your reading is ready</strong><span className="sub">What your answers say, next to your charts.</span>
            <Link className="btn" href={`/readings/${s.reading.id}`}>Read it</Link></>
            : s.theirs_count < 7 ? <><strong>Waiting for {s.other_name}</strong><span className="sub">They&apos;ve answered {s.theirs_count} of 7. Your reading opens here once they finish.</span></>
            : <><strong>Writing what your answers say</strong><span className="sub">Usually under a minute.</span></>}
        </div>
        <section className="stack" style={{ gap: 8 }} aria-label="Your answers">
          {SEVEN.map((q, i) => { const a = s.mine[String(i + 1)], b = s.theirs[String(i + 1)];
            return <div key={q.q} className="stack" style={{ gap: 4, padding: "12px 14px", borderRadius: 16, background: a === b ? "var(--green-soft)" : "#fff", border: "1px solid var(--line)" }}>
              <strong style={{ fontSize: 13 }}>{q.q}</strong>
              <span style={{ fontSize: 13 }}>{home?.first_name ?? "You"}: {a}</span>
              <span style={{ fontSize: 13, color: b ? "var(--ink)" : "var(--muted)" }}>{s.other_name}: {b ?? "not answered yet"}</span>
            </div>; })}
        </section>
      </>}
    </div>
  );
}
