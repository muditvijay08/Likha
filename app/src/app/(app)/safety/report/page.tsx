"use client";
// L7 Unmatch or block, then F1 Report. The person is never told. Reporting shares your last 50 messages with them with our safety team.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BackButton, ErrorNote, Primary, useAction } from "@/components/ui";
import { useApp } from "@/components/app";
import { api, type ReportReason } from "@/lib/api";

const REASONS: [ReportReason, string][] = [["fake_profile", "Fake profile"], ["harassment", "Harassment"], ["inappropriate_photos", "Inappropriate photos"],
  ["scam", "Asked for money or a scam"], ["under_18", "Seems under 18"], ["unsafe_meeting", "Felt unsafe when we met"], ["other", "Something else"]];

function Report() {
  const q = useSearchParams();
  const router = useRouter();
  const { reload, toast } = useApp();
  const user = q.get("user") ?? "", match = q.get("match");
  const [name, setName] = useState("them");
  const [step, setStep] = useState<"choose" | "report" | "done">(match ? "choose" : "report");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [block, setBlock] = useState(true);
  const { busy, error, run } = useAction();
  useEffect(() => {
    (match ? api().chat(match).then((c) => c.other.first_name) : api().profile(user).then((p) => p.first_name)).then(setName).catch(() => {});
  }, [user, match]);
  const unmatch = () => run(async () => { await api().unmatch(match!); await reload(); toast(`Unmatched ${name}`); router.push("/matches"); });
  const doBlock = () => run(async () => { await api().block(user); await reload(); toast(`${name} is blocked`); router.push("/matches"); });
  const send = () => run(async () => { await api().report(user, reason!, details.trim(), block); await reload(); setStep("done"); });

  if (step === "choose") return (
    <div className="app-body" style={{ justifyContent: "flex-end", minHeight: "calc(100dvh - 120px)" }}>
      <section role="dialog" aria-label={`Unmatch or block ${name}`} className="stack" style={{ gap: 10, padding: 20, borderRadius: 24, background: "#fff", boxShadow: "0 -8px 30px rgba(30,24,56,.12)" }}>
        <span aria-hidden="true" style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 999, background: "var(--line)" }} />
        <h1 className="serif" style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Unmatch or block {name}?</h1>
        <button type="button" className="rcard" onClick={unmatch} disabled={busy}><span className="stack" style={{ gap: 2 }}><strong>Unmatch</strong>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>The chat closes for both of you. You may see each other in Discover again.</span></span></button>
        <button type="button" className="rcard" onClick={doBlock} disabled={busy}><span className="stack" style={{ gap: 2 }}><strong>Block</strong>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Unmatches and hides you from each other for good. {name} isn&apos;t told.</span></span></button>
        <button type="button" className="rcard" onClick={() => setStep("report")} style={{ borderColor: "#FFC6D4", background: "var(--rose-soft)" }}><span className="stack" style={{ gap: 2 }}>
          <strong style={{ color: "var(--rose-ink)" }}>Block and report</strong><span style={{ fontSize: 13, color: "#8A3A55" }}>Our safety team reviews your last 50 messages with {name}.</span></span></button>
        <ErrorNote error={error} />
        <button type="button" className="btn text" onClick={() => router.back()}>Cancel</button>
      </section>
    </div>
  );
  if (step === "done") return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <h1 className="h1">Thank you for telling us</h1>
      <p className="sub">{reason === "under_18" || reason === "unsafe_meeting" ? "This goes to the top of our safety queue." : "Our safety team reviews every report, usually within 24 hours."} {name} won&apos;t know it was you.{block ? ` ${name} is blocked.` : ""}</p>
      {reason === "unsafe_meeting" && <a className="btn" href="tel:112">Call 112 if you're in danger</a>}
      <button type="button" className="btn ghost" onClick={() => router.push("/matches")}>Done</button>
    </div>
  );
  return (
    <div className="app-body pad" style={{ gap: 12 }}>
      <div className="titlebar"><BackButton /><h1>Report {name}</h1></div>
      <p className="sub">{name} won&apos;t know you reported them.</p>
      <div role="radiogroup" aria-label="Reason" className="stack" style={{ gap: 8 }}>
        {REASONS.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={reason === v} className="rcard" style={{ padding: 12 }} onClick={() => setReason(v)}><span className="dot" />{l}</button>)}
      </div>
      <div className="field"><label htmlFor="r-details" className="label">What happened? <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span></label>
        <textarea id="r-details" className="input" maxLength={1000} rows={2} value={details} onChange={(e) => setDetails(e.target.value)} /></div>
      <label htmlFor="r-block" className="row" style={{ justifyContent: "space-between", fontSize: 14 }}>Also block {name}
        <input id="r-block" type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} style={{ width: 22, height: 22, accentColor: "var(--link)" }} /></label>
      <ErrorNote error={error} />
      <Primary onClick={send} busy={busy} disabled={!reason}>Send report</Primary>
      <span className="small" style={{ textAlign: "center" }}>Your last 50 messages with {name} go to our safety team. Under-18 and in-person safety reports are reviewed first.</span>
    </div>
  );
}
export default function ReportPage() { return <Suspense><Report /></Suspense>; }
