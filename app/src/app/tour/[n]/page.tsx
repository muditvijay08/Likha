"use client";
// T1–T3 Feature tour
import Link from "next/link";
import { useParams } from "next/navigation";
import { Screen } from "@/components/ui";
import { useFlow } from "@/lib/flow";

export default function Tour() {
  const { n } = useParams<{ n: string }>();
  const i = Math.min(3, Math.max(1, Number(n) || 1));
  const { state } = useFlow();
  const me = state?.first_name?.[0]?.toUpperCase() ?? "A";
  const them = me === "R" ? "M" : "R";
  const today = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }).toUpperCase();

  const T1 = (
    <div style={{ position: "relative", width: 290, height: 290, margin: "0 auto" }}>
      <svg width="290" height="290" viewBox="0 0 290 290" aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
        <circle cx="145" cy="145" r="115" fill="none" stroke="#E7E1F5" strokeWidth="1.5" />
        <circle cx="145" cy="145" r="80" fill="none" stroke="#E7E1F5" strokeWidth="1.5" strokeDasharray="4 6" />
        <circle cx="145" cy="30" r="4" fill="#7E5BEF" /><circle cx="60" cy="68" r="5" fill="#FF7A9A" /><circle cx="260" cy="145" r="6" fill="#FFB020" />
      </svg>
      <Bubble l={me} x={50} y={105} bg="var(--g-soft)" fg="var(--g-ink)" />
      <Bubble l={them} x={160} y={105} bg="#FFE4EC" fg="#E0457B" />
      <div style={{ position: "absolute", left: 85, top: 190, width: 120, padding: "10px 8px", borderRadius: 14, background: "var(--saffron)", textAlign: "center",
        boxShadow: "0 8px 20px rgba(181,89,10,.25)" }}>
        <strong style={{ fontFamily: "var(--serif)", fontSize: 26, display: "block" }}>92%</strong>
        <span style={{ fontSize: 11, fontWeight: 700 }}>Jodi Score · 27 Gunas</span>
      </div>
    </div>
  );
  const T2 = (
    <div className="card stack" style={{ gap: 12, borderRadius: 20, padding: 18, boxShadow: "0 12px 30px rgba(30,24,56,.10)", border: 0 }}>
      <span className="kicker" style={{ color: "#C02660" }}>TODAY · {today}</span>
      <div className="grid2" style={{ gap: 8 }}>
        <span className="tile" style={{ background: "#EDE6FF", border: 0 }}><span>Vibe</span><strong style={{ fontFamily: "var(--serif)", fontSize: 20 }}>7/10</strong></span>
        <span className="tile" style={{ background: "#FFF0F4", border: 0 }}><span>Date score</span><strong style={{ fontFamily: "var(--serif)", fontSize: 20, color: "#C02660" }}>8/10</strong></span>
      </div>
      <span style={{ padding: "8px 10px", borderRadius: 10, background: "var(--saffron-soft)", fontSize: 13, fontWeight: 700 }}>Lucky window 7:40–9:10 PM</span>
      <span style={{ fontSize: 13 }}>Wear yellow. Big talks after sunset.</span>
    </div>
  );
  const T3 = (
    <div className="stack" style={{ gap: 16, alignItems: "center" }}>
      <div className="card stack" style={{ alignSelf: "flex-start", gap: 8, boxShadow: "0 8px 20px rgba(30,24,56,.08)", border: 0, marginLeft: 20 }}>
        <span style={{ fontSize: 14 }}>Hey, check our Jodi Score?</span>
        <span style={{ padding: "6px 10px", borderRadius: 8, background: "#FFF0F4", color: "#C02660", fontSize: 12, fontWeight: 700 }}>likha.in/crush/…</span>
      </div>
      <div className="stack" style={{ gap: 2, alignItems: "center", padding: "16px 22px", borderRadius: 18, background: "#E0457B", color: "#fff",
        boxShadow: "0 12px 26px rgba(224,69,123,.3)" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em" }}>YOUR STARS SAY</span>
        <strong style={{ fontFamily: "var(--serif)", fontSize: 34 }}>88%</strong>
        <span style={{ fontSize: 12 }}>Shared only if you both agree</span>
      </div>
    </div>
  );

  const pages = {
    1: { bg: "var(--bg)", kicker: "MATCHING", title: "Your kundli finds your people", art: T1,
         body: "Every profile shows your Jodi Score, worked out from both birth charts. Tap any ⓘ to learn what a number means." },
    2: { bg: "#FFF9EC", kicker: "EVERY MORNING", title: "Your day, decoded", art: T2,
         body: "Your Daily Kick: vibe, date score, lucky window and one small fix. Golden Hours tell you the best time to text each match." },
    3: { bg: "#FFF5F8", kicker: "FOR YOUR CRUSH", title: "Got a crush? Check together", art: T3,
         body: "Send a crush link to anyone, even outside the app. If they join and agree, you both see your score." },
  } as const;
  const c = pages[i as 1 | 2 | 3];

  return (
    <Screen style={{ gap: 20, background: c.bg }}>
      <div className="row" style={{ justifyContent: "space-between" }}><span className="small" style={{ fontWeight: 700 }}>{i} of 3</span>
        <Link href="/home" style={{ fontWeight: 700, fontSize: 14, color: "var(--muted)", textDecoration: "none" }}>Skip</Link></div>
      <div className="grow" style={{ display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 300 }}>{c.art}</div>
      <div className="stack" style={{ gap: 10 }}>
        <span className="kicker" style={{ color: "#C02660" }}>{c.kicker}</span>
        <h1 className="h1 hero" style={{ fontSize: 30 }}>{c.title}</h1>
        <p className="sub" style={{ fontSize: 15 }}>{c.body}</p>
      </div>
      <div className="row" style={{ justifyContent: "center", gap: 6 }} aria-hidden="true">
        {[1, 2, 3].map((k) => <span key={k} style={{ width: k === i ? 22 : 6, height: 6, borderRadius: 999, background: k === i ? "var(--ink)" : "#D5CFE6" }} />)}
      </div>
      <Link className="btn" href={i < 3 ? `/tour/${i + 1}` : "/home"}>{i < 3 ? "Next" : "Start exploring"}</Link>
    </Screen>
  );
}

function Bubble({ l, x, y, bg, fg }: { l: string; x: number; y: number; bg: string; fg: string }) {
  return <span style={{ position: "absolute", left: x, top: y, width: 80, height: 80, borderRadius: 999, background: bg, color: fg, display: "flex",
    alignItems: "center", justifyContent: "center", fontFamily: "var(--serif)", fontSize: 32, fontWeight: 600, border: "4px solid #fff",
    boxShadow: "0 6px 16px rgba(30,24,56,.1)" }}>{l}</span>;
}
