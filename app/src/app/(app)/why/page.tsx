// N3 Why Likha.
import Link from "next/link";
import { BackButton } from "@/components/ui";

export default function Why() {
  const pts: [string, string][] = [
    ["Exact charts.", "Calculated to the minute with NASA JPL planetary data and the Lahiri ayanamsa, matched by the classical Ashtakoota rules."],
    ["Women first.", "Selfie checks, a free Likes view, SOS and date sharing built in."],
    ["Your birth details stay yours.", "Never shown on your profile. Only the chart positions are used."],
  ];
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <BackButton href="/menu" />
      <span className="kicker">WHY LIKHA</span>
      <h1 className="h1 hero">Kundli first. Not after the families meet.</h1>
      <p className="sub" style={{ fontSize: 15 }}>In India, kundli matching usually comes last: after you&apos;ve liked someone, met them, maybe told your parents. Then a stranger with a chart decides. Dating apps ignore it completely.</p>
      <p className="sub" style={{ fontSize: 15 }}>We flipped it. Your chart works for you from the first swipe, free and private, so you spend your time on people your stars already like.</p>
      <div className="stack" style={{ gap: 10 }}>
        {pts.map(([b, t], i) => <div key={b} className="row" style={{ gap: 12, alignItems: "flex-start", padding: "12px 14px", borderRadius: 16, background: "#fff", border: "1px solid var(--line)" }}>
          <strong className="serif" style={{ fontSize: 22, color: "var(--link)" }}>{i + 1}</strong><span style={{ fontSize: 14, lineHeight: 1.5 }}><strong>{b}</strong> {t}</span></div>)}
      </div>
      <p className="sub">Made in Jaipur. The stars guide; you decide. <Link href="/legal/disclaimer">How our readings work</Link></p>
    </div>
  );
}
