"use client";
// Rishta Maasi: three picks a week for each subscriber, written by the team, out on Sunday. No promises, ever.
import { useState } from "react";
import { useAction, useAdmin } from "@/components/shell";
import { Page, label, useLoad } from "@/components/ui";
import { api, type MaasiMember } from "@/lib/api";

function Member({ m, week, per, done }: { m: MaasiMember; week: string; per: number; done(): void }) {
  const { toast } = useAdmin();
  const [open, setOpen] = useState(false);
  const cands = useLoad(() => open ? api().maasiCandidates(m.user_id) : Promise.resolve([]), [open]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { busy, error, run } = useAction();
  const full = m.picks.length >= per;
  return (
    <section className="card stack" aria-label={`Picks for ${m.user}`}>
      <div className="row"><strong className="grow">{m.user}{m.age ? `, ${m.age}` : ""} <span className="small">{label(m.gender)} · {m.city} · plan to {new Date(m.until).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></strong>
        <span className={`pill ${full ? "ok" : "warn"}`}>{m.picks.length} of {per} for {new Date(week).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></div>
      {m.picks.map((p) => <div key={p.id} className="row" style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 6 }}>
        <span className="grow"><strong>{p.name}</strong>: &ldquo;{p.note}&rdquo;</span>{p.response ? <span className="pill info">{label(p.response)}</span>
          : <button type="button" className="btn ghost sm" disabled={busy} onClick={() => run(async () => { await api().removeMaasiPick(p.id); done(); })}>Remove</button>}</div>)}
      {!full && (open ? (
        <div className="stack">{(cands.data ?? []).length === 0 && <span className="small">{cands.data ? "No one new to suggest in their city right now." : "Finding the best matches…"}</span>}
          {(cands.data ?? []).slice(0, 6).map((c) => <div key={c.id} className="stack" style={{ gap: 6, borderTop: "1px solid var(--line-soft)", paddingTop: 8 }}>
            <div className="row"><strong>{c.name}{c.age ? `, ${c.age}` : ""}</strong><span className="small">{c.profession} · {c.moon} Moon, {c.nakshatra}</span>
              <span className="pill info">{c.jodi_score}% Jodi · {c.gunas} Gunas</span></div>
            <div className="row" style={{ flexWrap: "nowrap" }}><input className="input grow" aria-label={`Maasi's note about ${c.name}`} placeholder="Why Maasi thinks so, in her voice (no promises)" value={notes[c.id] ?? ""} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} />
              <button type="button" className="btn sm" disabled={busy || !(notes[c.id] ?? "").trim()} onClick={() => run(async () => { await api().addMaasiPick(m.user_id, c.id, notes[c.id]); toast(`${c.name} picked for ${m.user}`); done(); cands.reload(); })}>Pick</button></div>
          </div>)}
          <button type="button" className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setOpen(false)}>Close</button></div>
      ) : <button type="button" className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setOpen(true)}>Choose picks</button>)}
      {error && <p className="err" role="alert">{error}</p>}
    </section>
  );
}

export default function Maasi() {
  const { data, reload } = useLoad(() => api().maasi());
  if (!data) return <div className="skel" style={{ height: 300 }} />;
  return (
    <Page title="Rishta Maasi picks" sub={`Three picks per subscriber for Sunday ${new Date(data.week_of).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}. Suggestions are their best Jodi Scores in their city, never people they've already seen.`}>
      <div className="note">Write like Maasi: warm, specific, from the charts. Never promise a match or a marriage. Interested on both sides makes a match.</div>
      {data.members.length === 0 ? <div className="card sub">No active Rishta Maasi subscribers.</div> : data.members.map((m) => <Member key={m.user_id} m={m} week={data.week_of} per={data.per_week} done={reload} />)}
    </Page>
  );
}
