"use client";
// I13 Selfie review: the automatic check wasn't sure. Keyboard: A approve, S ask for a new selfie, R reject. Selfie images are never stored.
import { useCallback, useEffect, useState } from "react";
import { useAction, useAdmin } from "@/components/shell";
import { Kpi, Page, Photo, ago, useLoad } from "@/components/ui";
import { api } from "@/lib/api";

export default function Selfies() {
  const { toast } = useAdmin();
  const { data, reload } = useLoad(() => api().selfies());
  const [i, setI] = useState(0);
  const { busy, error, run } = useAction();
  const rows = data?.rows ?? []; const s = rows[Math.min(i, rows.length - 1)];
  const decide = useCallback((d: "approve" | "retry" | "reject") => { if (!s || busy) return;
    run(async () => { await api().decideSelfie(s.id, d); toast(d === "approve" ? `${s.user} approved` : d === "retry" ? "New selfie requested" : "Rejected"); reload(); }); }, [s, busy, run, toast, reload]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      if (e.key === "a" || e.key === "A") decide("approve"); else if (e.key === "s" || e.key === "S") decide("retry"); else if (e.key === "r" || e.key === "R") decide("reject");
      else if (e.key === "ArrowRight") setI((x) => Math.min(x + 1, rows.length - 1)); else if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1)); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [decide, rows.length]);
  if (!data) return <div className="skel" style={{ height: 400 }} />;
  return (
    <Page title="Selfie review" sub="Selfies the automatic check wasn't sure about. Compare the live frame score with the first photo and decide in seconds.">
      <div className="kpis"><Kpi k="Waiting" v={rows.length} s={rows[0] ? `oldest ${ago(rows[0].at)}` : "queue empty"} /><Kpi k="Reviewed today" v={data.reviewed_today} />
        <Kpi k="Approved today" v={data.reviewed_today ? `${Math.round((data.approved_today / data.reviewed_today) * 100)}%` : "–"} /><Kpi k="Target" v="24 h" s="from submission" /></div>
      {!s ? <div className="card sub">Nothing to review.</div> : (
        <div className="split">
          <section className="card" style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 18 }} aria-label={`Selfie of ${s.user}`}>
            <div className="stack"><Photo path={s.photo} name={s.user.split(" ").pop() ?? "?"} /><span className="small">First profile photo</span></div>
            <div className="stack" style={{ gap: 10 }}>
              <h2>{s.user}{s.age ? `, ${s.age}` : ""}</h2>
              <dl className="kv"><dt>Match score</dt><dd><strong>{s.score ?? "–"}</strong> <span className="small">(automatic pass at 0.85)</span></dd>
                <dt>Liveness</dt><dd>{s.liveness ? "Passed: a real person, not a photo" : "Not passed"}</dd><dt>Why flagged</dt><dd>{s.why ?? "–"}</dd>
                <dt>Tries</dt><dd>{s.tries} of 3</dd><dt>Same face elsewhere</dt><dd>{s.same_face ? <span className="pill bad">{s.same_face} other account{s.same_face > 1 ? "s" : ""}</span> : "None found"}</dd>
                <dt>Waiting</dt><dd>{ago(s.at)}</dd></dl>
              {s.under_18_report && <div className="note warn">There is an open under-18 report on this account. Check Moderation before approving.</div>}
              {error && <p className="err" role="alert">{error}</p>}
              <div className="row"><button type="button" className="btn" disabled={busy} onClick={() => decide("approve")}>Approve · A</button>
                <button type="button" className="btn ghost" disabled={busy} onClick={() => decide("retry")}>Ask for a new selfie · S</button>
                <button type="button" className="btn danger" disabled={busy} onClick={() => decide("reject")}>Reject · R</button></div>
              <span className="small">The member is told the outcome. The live selfie is checked and deleted; only the score is kept.</span>
            </div>
          </section>
          <div className="card flush"><table className="t"><thead><tr><th>Queue</th><th>Score</th><th>Why</th><th>Waiting</th></tr></thead>
            <tbody>{rows.map((r, n) => <tr key={r.id} className="click" aria-selected={r.id === s.id} onClick={() => setI(n)}><td>{r.user}</td><td>{r.score ?? "–"}</td><td className="small">{r.why}</td><td className="small">{ago(r.at)}</td></tr>)}</tbody></table></div>
        </div>
      )}
    </Page>
  );
}
