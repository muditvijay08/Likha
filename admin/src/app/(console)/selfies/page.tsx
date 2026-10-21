"use client";
// I13 Selfie review: the automatic check wasn't sure, or Verification is set to "Team reviews". Keyboard: A approve, S ask for a new selfie, R reject.
// A selfie is kept only while it waits here, then deleted. Photos tab: photos waiting for the team, and spot checks of auto-approved photos.
import { useCallback, useEffect, useState } from "react";
import { useAction, useAdmin } from "@/components/shell";
import { Kpi, NoteAction, Page, Photo, ago, useLoad } from "@/components/ui";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { PhotoRow } from "@/lib/api";
import { api } from "@/lib/api";

function PhotoCard({ p, kind, done }: { p: PhotoRow; kind: "pending" | "auto"; done(): void }) {
  const { toast } = useAdmin(); const act = useAction();
  return (
    <div className="card stack" style={{ gap: 8, padding: 12 }} aria-label={`Photo ${p.position} of ${p.user}`}>
      <Photo path={p.path} name={p.user.split(" ").pop() ?? "?"} label={`Photo ${p.position} of ${p.user}`} />
      <div className="small">{p.user} · photo {p.position}{p.position === 1 ? " (main)" : ""} · {ago(p.at)}</div>
      <div className="row">
        <button type="button" className="btn sm" disabled={act.busy}
          onClick={() => act.run(async () => { await api().decidePhoto(p.id, true, null); toast(kind === "auto" ? "Marked as checked" : "Photo approved"); done(); })}>{kind === "auto" ? "Looks fine" : "Approve"}</button>
        <NoteAction label="Take down" tone="danger" placeholder="Why? The member sees this, e.g. Group photo: we need just you."
          onRun={(n) => api().decidePhoto(p.id, false, n)} done={() => { toast("Photo taken down; the member was told"); done(); }} />
      </div>
      {act.error && <p className="err" role="alert">{act.error}</p>}
    </div>
  );
}

function Photos() {
  const { data, reload } = useLoad(() => api().photoQueue());
  if (!data) return <div className="skel" style={{ height: 300 }} />;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="stack" aria-label="Photos waiting">
        <h2>Waiting for the team <span className="small">({data.pending.length})</span></h2>
        {data.pending.length === 0 ? <div className="card sub">{data.mode === "auto" ? "Photos are auto-approved right now (Settings > Verification), so nothing waits here." : "Nothing waiting."}</div>
          : <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>{data.pending.map((p) => <PhotoCard key={p.id} p={p} kind="pending" done={reload} />)}</div>}
      </section>
      <section className="stack" aria-label="Auto-approved photos">
        <h2>Auto-approved, not looked at yet <span className="small">(last 7 days)</span></h2>
        {data.auto_recent.length === 0 ? <div className="card sub">All caught up.</div>
          : <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>{data.auto_recent.map((p) => <PhotoCard key={p.id} p={p} kind="auto" done={reload} />)}</div>}
      </section>
    </div>
  );
}

export default function SelfiesPage() { return <Suspense fallback={<div className="skel" style={{ height: 400 }} />}><Selfies /></Suspense>; }

function Selfies() {
  const params = useSearchParams();
  const [tab, setTab] = useState<"selfies" | "photos">(params.get("tab") === "photos" ? "photos" : "selfies");
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
  const tabs = <div className="tabs" role="tablist">{([["selfies", `Selfies (${rows.length})`], ["photos", "Photos"]] as const).map(([t, l]) =>
    <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{l}</button>)}</div>;
  if (tab === "photos") return <Page title="Selfie and photo review" sub="Photos waiting for the team, and spot checks of photos that were auto-approved.">{tabs}<Photos /></Page>;
  return (
    <Page title="Selfie and photo review" sub="Selfies waiting for a person: compare with the first photo and decide in seconds.">
      {tabs}
      <div className="kpis"><Kpi k="Waiting" v={rows.length} s={rows[0] ? `oldest ${ago(rows[0].at)}` : "queue empty"} /><Kpi k="Reviewed today" v={data.reviewed_today} />
        <Kpi k="Approved today" v={data.reviewed_today ? `${Math.round((data.approved_today / data.reviewed_today) * 100)}%` : "–"} /><Kpi k="Target" v="24 h" s="from submission" /></div>
      {!s ? <div className="card sub">Nothing to review.</div> : (
        <div className="split">
          <section className="card" style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 18 }} aria-label={`Selfie of ${s.user}`}>
            <div className="stack"><Photo path={s.photo} name={s.user.split(" ").pop() ?? "?"} /><span className="small">First profile photo</span>
              {s.selfie && <><Photo path={s.selfie} bucket="selfies" name={s.user.split(" ").pop() ?? "?"} label={`Selfie of ${s.user}`} /><span className="small">Selfie (deleted after you decide)</span></>}</div>
            <div className="stack" style={{ gap: 10 }}>
              <h2>{s.user}{s.age ? `, ${s.age}` : ""}</h2>
              <dl className="kv"><dt>Match score</dt><dd><strong>{s.score ?? "–"}</strong> <span className="small">{s.score === null ? "(no automatic check: compare by eye)" : "(automatic pass score is on Onboarding)"}</span></dd>
                <dt>Liveness</dt><dd>{s.liveness ? "Passed: a real person, not a photo" : "Not passed"}</dd><dt>Why flagged</dt><dd>{s.why ?? "–"}</dd>
                <dt>Tries</dt><dd>{s.tries} of 3</dd><dt>Same face elsewhere</dt><dd>{s.same_face ? <span className="pill bad">{s.same_face} other account{s.same_face > 1 ? "s" : ""}</span> : "None found"}</dd>
                <dt>Waiting</dt><dd>{ago(s.at)}</dd></dl>
              {s.under_18_report && <div className="note warn">There is an open under-18 report on this account. Check Moderation before approving.</div>}
              {error && <p className="err" role="alert">{error}</p>}
              <div className="row"><button type="button" className="btn" disabled={busy} onClick={() => decide("approve")}>Approve · A</button>
                <button type="button" className="btn ghost" disabled={busy} onClick={() => decide("retry")}>Ask for a new selfie · S</button>
                <button type="button" className="btn danger" disabled={busy} onClick={() => decide("reject")}>Reject · R</button></div>
              <span className="small">The member is told the outcome. The selfie is deleted once you decide; only the score is kept.</span>
            </div>
          </section>
          <div className="card flush"><table className="t"><thead><tr><th>Queue</th><th>Score</th><th>Why</th><th>Waiting</th></tr></thead>
            <tbody>{rows.map((r, n) => <tr key={r.id} className="click" aria-selected={r.id === s.id} onClick={() => setI(n)}><td>{r.user}</td><td>{r.score ?? "–"}</td><td className="small">{r.why}</td><td className="small">{ago(r.at)}</td></tr>)}</tbody></table></div>
        </div>
      )}
    </Page>
  );
}
