"use client";
// Verification: how selfies and photos are checked. Auto-approve until the services are connected, the team decides,
// or Likha calls an API. Any API failure goes to the team, never to auto-approve.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAction, useAdmin, when } from "@/components/shell";
import { Kpi, Page, useLoad } from "@/components/ui";
import { api, type Verification, type VerifyMode } from "@/lib/api";

const MODES: [VerifyMode, string, string][] = [
  ["auto", "Auto-approve for now", "No check runs. Members get in at once."],
  ["manual", "Team reviews", "Each one waits in the review queue until someone on the team decides."],
  ["api", "Call an API", "Likha sends each one to your check service and applies its answer."],
];

const CONTRACT = {
  selfie: {
    request: `POST <your address>
Authorization: Bearer <Selfie check API key>
Content-Type: application/json

{
  "user_id": "uuid",
  "selfie_jpeg_base64": "/9j/4AAQ...",       // one frame from the app camera
  "profile_photo_url": "https://...signed"     // their main photo, link valid 10 minutes
}`,
    reply: `{ "score": 0.93, "live": true }   // score 0 to 1 (face match), live = a real person, not a photo`,
    rules: "Passes when live is true and score is at least the pass score on Onboarding. A weak match uses a try; after the last try a person reviews it. The selfie is kept only for that review, then deleted.",
  },
  photos: {
    request: `POST <your address>
Authorization: Bearer <Photo check API key>
Content-Type: application/json

{
  "photo_id": "uuid",
  "user_id": "uuid",
  "image_url": "https://...signed",            // link valid 10 minutes
  "position": 1                                // 1 = main photo
}`,
    reply: `{ "approved": false, "reason": "Group photo: we need just you.", "labels": { "faces": 3 } }`,
    rules: "Approved photos show on the profile at once. A rejected photo is taken down and the member sees your reason. If the call fails or takes over 20 seconds, the photo waits for the team.",
  },
} as const;

function CheckCard({ check, v, done }: { check: "selfie" | "photos"; v: Verification; done(): void }) {
  const { toast } = useAdmin();
  const cur = v.config[check];
  const [mode, setMode] = useState<VerifyMode>(cur.mode); const [url, setUrl] = useState(cur.url ?? ""); const [note, setNote] = useState("");
  const [showApi, setShowApi] = useState(cur.mode === "api");
  const act = useAction(); const test = useAction();
  const [result, setResult] = useState<{ ok: boolean; note: string } | null>(null);
  useEffect(() => { setMode(cur.mode); setUrl(cur.url ?? ""); }, [cur.mode, cur.url]);
  const title = check === "selfie" ? "Selfie check" : "Photo check";
  const keyName = check === "selfie" ? "Selfie check API key" : "Photo check API key";
  const dirty = mode !== cur.mode || (url.trim() || null) !== cur.url;
  const last = v.last_tests[check];
  return (
    <section className="card stack" style={{ gap: 12 }} aria-label={title}>
      <div className="row"><h2 className="grow">{title}</h2>
        <span className={`pill ${cur.mode === "auto" ? "warn" : cur.mode === "api" ? "ok" : "info"}`}>{MODES.find((m) => m[0] === cur.mode)![1]}</span></div>
      {cur.mode === "auto" && <div className="note warn">{check === "selfie"
        ? `Auto-approve is on: ${v.counts.auto_members.toLocaleString("en-IN")} members got in without a check. They don't get the Verified badge until a real check passes.`
        : `Auto-approve is on: photos go live without a check. ${v.counts.unreviewed_auto_photos} from the last 7 days haven't been looked at yet. Spot-check them in Selfie review > Photos.`}</div>}
      <div role="radiogroup" aria-label={`${title} mode`} className="stack" style={{ gap: 6 }}>
        {MODES.map(([m, label, sub]) => (
          <label key={m} className="row" style={{ gap: 10, padding: "10px 12px", borderRadius: 12, border: `1px solid ${mode === m ? "var(--violet)" : "var(--line)"}`, alignItems: "flex-start", flexWrap: "nowrap" }}>
            <input type="radio" name={`${check}-mode`} checked={mode === m} disabled={!v.can_edit} onChange={() => { setMode(m); if (m === "api") setShowApi(true); }} style={{ marginTop: 3 }} />
            <span className="stack" style={{ gap: 2 }}><strong style={{ fontSize: 14 }}>{label}</strong><span className="small">{sub}</span></span>
          </label>))}
      </div>

      <div className="stack" style={{ gap: 8, padding: 12, borderRadius: 12, background: "#FBF9FE" }} aria-label={`${title} API`}>
        <button type="button" className="row" onClick={() => setShowApi(!showApi)} style={{ background: "none", border: 0, padding: 0, font: "700 13px var(--sans)", color: "var(--ink)", justifyContent: "space-between" }}
          aria-expanded={showApi}>API to call<span className="small">{showApi ? "Hide" : "Show"}</span></button>
        {showApi && <>
          <label className="f">Address (https)<input className="input" value={url} disabled={!v.can_edit} onChange={(e) => setUrl(e.target.value)}
            placeholder={check === "selfie" ? "https://verify.example.com/selfie" : "https://verify.example.com/photo"} /></label>
          <div className="row small"><span className={`pill ${v.keys[check] ? "ok" : "off"}`}>{v.keys[check] ? "Key set" : "Key not set"}</span>
            <span>{keyName}</span><Link href="/keys">Set it on Keys and integrations →</Link></div>
          <div className="row">
            <button type="button" className="btn ghost sm" disabled={test.busy || !cur.url || !v.keys[check]}
              onClick={() => test.run(async () => { setResult(await api().testVerification(check)); done(); })}>Send a test call</button>
            <span className="small">{!cur.url ? "Save an address first." : !v.keys[check] ? "Set the key first." : "Sends one labelled sample, no member data."}</span></div>
          {(result ?? (last ? { ok: last.ok === "true", note: last.note } : null)) && (() => { const r = result ?? { ok: last!.ok === "true", note: last!.note };
            return <div className={`note ${r.ok ? "" : "warn"}`} role="status"><strong>{r.ok ? "Worked" : "Didn't work"}</strong> · {r.note}{!result && last ? ` · ${when(last.at)}` : ""}</div>; })()}
          {test.error && <p className="err" role="alert">{test.error}</p>}
          <details><summary className="small" style={{ cursor: "pointer" }}>What Likha sends and expects back</summary>
            <div className="stack" style={{ gap: 6, marginTop: 8 }}>
              <pre className="mono" style={{ margin: 0, padding: 10, borderRadius: 10, background: "#1E1838", color: "#EDE6FF", fontSize: 12, overflowX: "auto" }}>{CONTRACT[check].request}</pre>
              <span className="small">Reply (JSON, within 20 seconds):</span>
              <pre className="mono" style={{ margin: 0, padding: 10, borderRadius: 10, background: "#1E1838", color: "#EDE6FF", fontSize: 12, overflowX: "auto" }}>{CONTRACT[check].reply}</pre>
              <span className="small">{CONTRACT[check].rules}</span>
            </div></details>
        </>}
      </div>

      {v.can_edit && dirty && <form className="row" aria-label={`Save ${title}`} onSubmit={(e) => { e.preventDefault(); act.run(async () => {
          await api().setVerification(check, mode, url.trim() || null, note); setNote(""); toast(`${title} saved`); done(); }); }}>
        <input className="input grow" aria-label={`${title} note`} placeholder="Why? (goes in the history)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn sm" disabled={act.busy || note.trim().length < 3}>Save</button></form>}
      {act.error && <p className="err" role="alert">{act.error}</p>}
    </section>
  );
}

export default function VerificationPage() {
  const { data, reload } = useLoad(() => api().verification());
  if (!data) return <div className="skel" style={{ height: 400 }} />;
  return (
    <Page title="Verification" sub="How selfies and photos are checked. Use auto-approve until a check service is connected, then switch to Call an API. If a call fails, it goes to the team, never to auto-approve.">
      <div className="kpis">
        <Kpi k="Let in without a check" v={data.counts.auto_members.toLocaleString("en-IN")} s="no Verified badge" alert={data.counts.auto_members > 0} />
        <Kpi k="Selfies waiting" v={data.counts.selfie_queue} href="/selfies" />
        <Kpi k="Photos waiting" v={data.counts.photo_queue} href="/selfies?tab=photos" />
        <Kpi k="Auto-approved photos" v={data.counts.auto_photos_7d.toLocaleString("en-IN")} s="last 7 days" />
      </div>
      <div className="split"><CheckCard check="selfie" v={data} done={reload} /><CheckCard check="photos" v={data} done={reload} /></div>
      <p className="small">Members see honest wording for each mode: in auto-approve the selfie step says checks aren&apos;t running yet, and the photo step doesn&apos;t claim photos are checked.</p>
    </Page>
  );
}
