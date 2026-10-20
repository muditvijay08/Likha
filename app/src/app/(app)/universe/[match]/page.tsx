"use client";
// C1 Our Universe: every reading for the two of you. The other person says yes before anything about them is read, and you're only charged then.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BackButton, ErrorNote, useAction } from "@/components/ui";
import { Chevron, useApp, useTried } from "@/components/app";
import { Pair } from "@/components/couple";
import { api, type Universe } from "@/lib/api";

const READINGS: { kind: "our_stars" | "our_alignment"; title: string; body: string; bg: string }[] = [
  { kind: "our_stars", title: "Our Stars", body: "How your two charts get along: Gunas, doshas, what flows and what needs care.", bg: "#FFF3D6" },
  { kind: "our_alignment", title: "Our Alignment", body: "How your current dashas line up over the next few months.", bg: "#EDE6FF" },
];

export default function UniversePage() {
  const { match } = useParams<{ match: string }>();
  const router = useRouter();
  const { home, reload } = useApp();
  const [u, setU] = useState<Universe | null>(null);
  const { busy, error, run } = useAction();
  const tried = useTried();
  const load = useCallback(() => api().universe(match).then(setU).catch(() => setU(null)), [match]);
  useEffect(() => { load(); }, [load]);
  const start = (kind: "our_stars" | "our_alignment") => run(async () => {
    const r = await api().startCoupleReading(match, kind); await reload(); tried("our_universe", "Our Universe"); router.push(`/readings/${r.id}`);
  });
  if (!u) return <div className="app-body pad"><div className="skel" style={{ height: 300 }} /></div>;
  const status = (k: keyof Universe["readings"]) => u.readings[k];
  const others: [string, string, string, string][] = [
    [`/imagine/${match}`, "Imagine Us", status("imagine_us")?.status === "ready" ? "Open your pictures" : `Two painted pictures of you two · ${u.prices.imagine_us} credits`, "var(--rose-soft)"],
    [`/seven/${match}`, "Seven Questions", status("seven_questions") ? "Keep playing" : `Answer together, read what it says · ${u.prices.seven_questions} credits`, "#E4F4EE"],
    [`/guru/${match}`, "Ask Guru Ji", "Questions about the two of you", "#FFF3D6"],
    [`/golden/${match}`, "Golden Hours", "Best times to talk this week", "#EDE6FF"],
    [`/story/${match}`, "Our Story", "Your timeline together", "var(--rose-soft)"],
    [`/couple/${match}`, "Couple Mode", "Found your person? Turn it on together", "#fff"],
  ];
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href={`/chat/${match}`} /><h1>Our Universe</h1></div>
      <Pair me={home?.first_name ?? "You"} other={u.other_name} line={u.couple_plus ? "Couple Mode Plus: 20% off these readings" : "Readings for the two of you"} />
      <div className="note"><span>{u.always_allowed ? `${u.other_name} said yes to all your readings together. You can still be told no on any one of them.`
        : `${u.other_name} is asked first. You're only charged if they say yes.`}</span></div>
      {READINGS.map((r) => {
        const s = status(r.kind);
        return (
          <section key={r.kind} className="stack" style={{ gap: 8, padding: 16, borderRadius: 20, background: r.bg }}>
            <strong style={{ fontSize: 16 }}>{r.title}</strong><span style={{ fontSize: 13, color: "#3D3560" }}>{r.body}</span>
            {!s ? <button type="button" className="btn" disabled={busy} onClick={() => start(r.kind)}>Ask {u.other_name} · {u.prices[r.kind]} credits</button>
              : s.status === "pending_consent" ? <Link className="btn ghost" href={`/readings/${s.id}`}>{s.mine ? `Waiting for ${u.other_name} to say yes` : "Waiting for you to say yes"}</Link>
              : <Link className="btn ghost" href={`/readings/${s.id}`}>{s.status === "ready" ? "Read it" : "Being written…"}</Link>}
          </section>
        );
      })}
      <ErrorNote error={error} />
      <div className="stack" style={{ gap: 8 }}>
        {others.map(([href, t, s, bg]) => (
          <Link key={t} href={href} className="rowlink" style={{ background: bg }}><span className="t"><strong>{t}</strong><span>{s}</span></span><Chevron /></Link>
        ))}
      </div>
      <span className="small" style={{ textAlign: "center" }}>Only the two of you can see these readings. No predictions about health or death, ever.</span>
    </div>
  );
}
