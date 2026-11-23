"use client";
// C7 Mutual Intent Check (Connect > Understand): four private questions. Nobody sees the other's answers until both
// have answered. Shown side by side, as "same page" or "worth talking about". Never a score.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BackButton, ErrorNote, useAction } from "@/components/ui";
import { useApp } from "@/components/app";
import { api, type IntentAnswers, type IntentState } from "@/lib/api";

type Q = { key: keyof IntentAnswers; q: string; opts: [string, string][] };
const QS: Q[] = [
  { key: "looking_for", q: "What are you looking for?", opts: [["marriage", "Marriage"], ["serious", "Something serious"], ["getting_to_know", "Getting to know people"]] },
  { key: "timeline", q: "If it works out, marriage in…", opts: [["within_1y", "Within a year"], ["1_2y", "1 to 2 years"], ["not_sure", "Not sure yet"]] },
  { key: "family", q: "When would you involve family?", opts: [["soon", "Soon"], ["in_a_few_months", "In a few months"], ["when_serious", "Once it's serious"]] },
  { key: "exclusive", q: "Talking only to each other?", opts: [["now", "Yes, from now"], ["soon", "Soon, after we meet"], ["not_yet", "Not yet"]] },
];
const label = (q: Q, v: string) => q.opts.find(([k]) => k === v)?.[1] ?? v;
const ORDER: Record<string, number> = { marriage: 0, serious: 1, getting_to_know: 2, within_1y: 0, "1_2y": 1, not_sure: 2, soon: 0, in_a_few_months: 1, when_serious: 2, now: 0, not_yet: 2 };

export default function IntentCheck() {
  const { match } = useParams<{ match: string }>();
  const { toast } = useApp();
  const [s, setS] = useState<IntentState | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<IntentAnswers>>({});
  const [edit, setEdit] = useState(false);
  const { busy, error, run } = useAction();
  useEffect(() => { api().intent(match).then((x) => { setS(x); setDraft(x.mine ?? {}); }).catch((e) => setGone(e instanceof Error ? e.message : "Match not found.")); }, [match]);

  if (gone) return <div className="app-body pad"><div className="empty card"><strong>{gone}</strong><Link className="btn" href="/matches">Back to Connect</Link></div></div>;
  if (!s) return <div className="app-body pad"><div className="skel" style={{ height: 380 }} /></div>;
  const name = s.other_name || "your match";
  const done = QS.every((q) => draft[q.key]);
  const asking = !s.mine || edit;

  const save = () => run(async () => { const x = await api().intentSave(match, draft as IntentAnswers); setS(x); setEdit(false); toast("Saved"); });

  return (
    <div className="app-body pad" style={{ gap: 16 }}>
      <div className="titlebar"><BackButton href={`/chat/${match}`} /><h1>Intent check</h1></div>
      <p className="sub" style={{ margin: 0 }}>Four private questions about what you each want. You see {name}&apos;s answers only when you&apos;ve both answered. Change yours any time.</p>

      {asking ? <>
        {QS.map((q) => (
          <fieldset key={q.key} className="stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
            <legend className="label" style={{ marginBottom: 8 }}>{q.q}</legend>
            <div className="chips">{q.opts.map(([v, l]) => (
              <button key={v} type="button" className="chip sm" aria-pressed={draft[q.key] === v} onClick={() => setDraft((d) => ({ ...d, [q.key]: v }))}>{l}</button>))}</div>
          </fieldset>
        ))}
        <ErrorNote error={error} />
        <button type="button" className="btn" disabled={!done || busy} onClick={save}>{s.mine ? "Save my answers" : s.they_answered ? `Answer and see ${name}'s` : "Save my answers"}</button>
        {s.mine && <button type="button" className="btn text" onClick={() => { setEdit(false); setDraft(s.mine!); }}>Cancel</button>}
        <span className="small" style={{ textAlign: "center" }}>{s.they_answered ? `${name} has answered.` : `${name} hasn't answered yet. We'll let them know you did.`}</span>
      </> : !s.theirs ? <>
        <div className="companion-hero" style={{ padding: 16 }}>
          <strong>Your answers are saved</strong>
          <p className="small" style={{ margin: "6px 0 0" }}>We&apos;ve let {name} know. When they answer, you&apos;ll both see where you stand.</p>
        </div>
        <Mine a={s.mine!} />
        <button type="button" className="btn outline" onClick={() => setEdit(true)}>Change my answers</button>
      </> : <>
        <section className="stack" style={{ gap: 10 }} aria-label="Where you both stand">
          <strong style={{ fontSize: 15 }}>{QS.filter((q) => s.mine![q.key] === s.theirs![q.key]).length} of 4 on the same page</strong>
          {QS.map((q) => {
            const a = s.mine![q.key], b = s.theirs![q.key];
            const same = a === b, far = Math.abs((ORDER[a] ?? 0) - (ORDER[b] ?? 0)) >= 2;
            return (
              <div key={q.key} className="card stack" style={{ gap: 6, borderRadius: 12 }}>
                <span className="row" style={{ justifyContent: "space-between", gap: 8 }}><strong style={{ fontSize: 14 }}>{q.q}</strong>
                  <span className="badge-soft" style={same ? undefined : { background: "var(--action-soft)", color: "var(--ink)" }}>{same ? "Same page" : far ? "Talk about this" : "Close"}</span></span>
                <span className="small">You: {label(q, a)} · {name}: {label(q, b)}</span>
              </div>
            );
          })}
          <span className="small">Different answers are normal early on. A conversation now saves confusion later.</span>
        </section>
        <Link href={`/chat/${match}`} className="btn">Talk about it in chat</Link>
        <button type="button" className="btn outline" onClick={() => setEdit(true)}>Change my answers</button>
      </>}
    </div>
  );
}

function Mine({ a }: { a: IntentAnswers }) {
  return <div className="listcard">{QS.map((q) => <div key={q.key}><span>{q.q}</span><span className="small">{label(q, a[q.key])}</span></div>)}</div>;
}
