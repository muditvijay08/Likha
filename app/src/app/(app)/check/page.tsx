"use client";
// S2 Check With Anyone: a free Moon-sign preview, then an invite. The full reading unlocks for both once they join and agree.
// We never message them ourselves: the member sends the WhatsApp invite from their own phone.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BackButton, ErrorNote, Primary, useAction } from "@/components/ui";
import { price, useApp } from "@/components/app";
import { api, type CrushCheck } from "@/lib/api";
import { SIGNS, moonSignsOn, previewLine } from "@/lib/moon";

const REL = ["Crush", "Ex", "Partner", "Boss", "Co-founder", "Friend", "Family"];

export default function CheckAnyone() {
  const { prices, reload } = useApp();
  const [rel, setRel] = useState("Crush");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [mine, setMine] = useState<number | null>(null);
  const [mineName, setMineName] = useState<string | null>(null);
  const [state, setState] = useState<{ prepaid: number; checks: CrushCheck[] } | null>(null);
  const [sent, setSent] = useState<{ token: string; name: string; phone: string } | null>(null);
  const { busy, error, run } = useAction();
  useEffect(() => {
    api().myChart().then((c) => { if (c) { setMineName(c.summary.moon_sign); setMine(SIGNS.indexOf(c.summary.moon_sign)); } }).catch(() => {});
    api().myCrushChecks().then(setState).catch(() => {});
  }, []);

  const theirs = useMemo(() => (/^\d{4}-\d{2}-\d{2}$/.test(dob) ? moonSignsOn(dob) : null), [dob]);
  const preview = mine !== null && mine >= 0 && theirs ? (theirs.length === 1 ? previewLine(mine, theirs[0])
    : `${SIGNS[theirs[0]]} or ${SIGNS[theirs[1]]}: their Moon changed sign that day, so it depends on the birth time. The full reading works it out.`) : null;

  const check = () => run(async () => {
    const r = await api().createCrushCheck(name.trim(), phone, rel.toLowerCase(), dob || null);
    setSent({ token: r.token, name: name.trim(), phone }); await reload(); setState(await api().myCrushChecks());
  });
  const buyPack = () => run(async () => { await api().buyCheckPack(); await reload(); setState(await api().myCrushChecks()); });
  const link = sent ? `${location.origin}/k/${encodeURIComponent(sent.token)}` : "";
  const wa = sent ? `https://wa.me/${sent.phone.replace(/\D/g, "").replace(/^0/, "").replace(/^(?!91)(\d{10})$/, "91$1")}?text=${encodeURIComponent(
    `Hey ${sent.name}! I checked our kundli match on Likha 🙂 Join to see the full reading with me: ${link}`)}` : "";

  if (sent) return (
    <div className="app-body pad" style={{ gap: 16 }}>
      <div className="titlebar"><BackButton href="/store" /><h1>Invite ready</h1></div>
      <div className="card stack" style={{ gap: 8, borderRadius: 20 }}>
        <strong style={{ fontSize: 16 }}>Now send it to {sent.name}</strong>
        <span className="sub">The full reading unlocks for both of you once {sent.name} joins with this number and agrees. If nobody joins in 30 days, your credits come back.</span>
      </div>
      <a className="btn" href={wa} target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>
      <button type="button" className="btn ghost" onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button>
      <button type="button" className="btn text" onClick={() => { setSent(null); setName(""); setPhone(""); setDob(""); }}>Check someone else</button>
    </div>
  );

  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/store" /><h1>Check With Anyone</h1></div>
      <div className="stack">
        <span className="label">Who are they to you?</span>
        <div className="chips">{REL.map((r) => <button key={r} type="button" className="chip sm" aria-pressed={rel === r} onClick={() => setRel(r)}>{r}</button>)}</div>
      </div>
      <div className="field"><label htmlFor="cw-name" className="label">Their first name</label>
        <input id="cw-name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></div>
      <div className="field"><label htmlFor="cw-phone" className="label">Their phone, for the invite</label>
        <input id="cw-phone" className="input" inputMode="tel" placeholder="+91 98xxx xxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" /></div>
      <div className="field"><label htmlFor="cw-dob" className="label">Their date of birth <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional, for the free preview)</span></label>
        <input id="cw-dob" className="input" type="date" max={new Date().toISOString().slice(0, 10)} min="1940-01-01" value={dob} onChange={(e) => setDob(e.target.value)} /></div>
      {preview && (
        <div style={{ padding: "12px 14px", borderRadius: 16, background: "var(--violet-soft)", display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "#5B44C9" }}>FREE PREVIEW · MOON SIGNS</span>
          <span style={{ fontSize: 14, lineHeight: 1.45 }}>{preview}</span>
          <span className="small">Your Moon: {mineName}. Theirs is worked out from the date only.</span>
        </div>
      )}
      <ErrorNote error={error} />
      <div className="grow" />
      <Primary onClick={check} busy={busy} disabled={!name.trim() || phone.replace(/\D/g, "").length < 10}>
        {state && state.prepaid > 0 ? `Send invite and check · uses 1 of ${state.prepaid}` : `Send invite and check · ${price(prices, "check_anyone", 29)} credits`}</Primary>
      <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", lineHeight: 1.5 }}>
        {name.trim() || "They"} get{name.trim() ? "s" : ""} &ldquo;Someone checked their kundli match with you.&rdquo; The full reading unlocks for both once they join and agree.</div>
      {state && state.prepaid === 0 && <button type="button" className="linkbtn" style={{ alignSelf: "center" }} onClick={buyPack} disabled={busy}>Or get a 5-pack for {price(prices, "check_anyone_5", 119)} credits</button>}
      {state && state.checks.length > 0 && (
        <section className="stack" style={{ gap: 8 }} aria-label="Your checks">
          <strong style={{ fontSize: 14 }}>Your checks</strong>
          <div className="listcard">
            {state.checks.map((c) => (
              <div key={c.id}><span>{c.name} <span className="small">· {c.relation}</span></span>
                {c.status === "ready" ? <Link href={`/readings/${c.reading_id}`}>Read</Link>
                  : <span className="small">{c.joined ? "Writing…" : c.status === "refunded" ? "Expired, refunded" : "Waiting for them to join"}</span>}</div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
