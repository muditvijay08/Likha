"use client";
// S3 Why It Didn't Work: a kind, honest reading about a past relationship. Their details are used once, then deleted.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BackButton, ErrorNote, Primary, useAction } from "@/components/ui";
import { price, useApp } from "@/components/app";
import { api } from "@/lib/api";

const DUR: [string, string][] = [["under_6m", "Under 6 months"], ["6m_2y", "6 months to 2 years"], ["2y_plus", "2+ years"]];

export default function WhyNot() {
  const router = useRouter();
  const { prices, reload } = useApp();
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [tob, setTob] = useState("");
  const [dur, setDur] = useState("6m_2y");
  const [ok, setOk] = useState(false);                    // DPDP: starts unticked
  const first = name.trim().split(/\s+/)[0] ?? "";
  const { busy, error, run } = useAction();
  const buy = () => run(async () => {
    const id = await api().startReading("why_not", { name: first, birth_date: dob, birth_time: tob || null, duration: dur, confirm: ok });
    await reload(); router.push(`/readings/${id}`);
  });
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/store" /><h1>Why It Didn&apos;t Work</h1></div>
      <p className="sub">Close the chapter with a kind, honest reading. Then find someone who fits better.</p>
      <div className="field"><label htmlFor="wn-name" className="label">Their first name or a nickname</label>
        <input id="wn-name" className="input" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></div>
      <div className="grid2">
        <div className="field"><label htmlFor="wn-dob" className="label">Date of birth</label>
          <input id="wn-dob" className="input" type="date" min="1940-01-01" max={new Date(Date.now() - 16 * 365.25 * 864e5).toISOString().slice(0, 10)} value={dob} onChange={(e) => setDob(e.target.value)} /></div>
        <div className="field"><label htmlFor="wn-time" className="label">Birth time <span style={{ fontWeight: 400, color: "var(--muted)" }}>(opt.)</span></label>
          <input id="wn-time" className="input" type="time" value={tob} onChange={(e) => setTob(e.target.value)} /></div>
      </div>
      <div className="stack"><span className="label">How long were you together?</span>
        <div className="chips">{DUR.map(([v, l]) => <button key={v} type="button" className="chip sm" aria-pressed={dur === v} onClick={() => setDur(v)}>{l}</button>)}</div></div>
      <div className="card stack" style={{ gap: 4, fontSize: 13, borderRadius: 16 }}>
        <strong style={{ fontSize: 14 }}>Your reading covers</strong>
        <span>1 · What pulled you together</span><span>2 · Where your charts clashed</span><span>3 · What to look for next time</span>
        <span>4 · People in your feed who suit you better</span>
      </div>
      <div className="note"><span>Only you see this. We keep only a first name. Their birth details are deleted as soon as your reading is ready (30 days at most) and are never matched or shown to anyone.</span></div>
      <label className="consent-box" htmlFor="wn-ok">
        <input id="wn-ok" type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>I knew this person and I&apos;m okay using their birth details for my own private reading.</span>
      </label>
      <ErrorNote error={error} />
      <div className="grow" />
      <Primary onClick={buy} busy={busy} disabled={!first || !dob || !ok}>Get my reading · {price(prices, "why_not", 79)} credits</Primary>
      <span className="small" style={{ textAlign: "center" }}>If it can&apos;t be written, your credits come straight back.</span>
    </div>
  );
}
