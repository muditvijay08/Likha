"use client";
// E2 Imagine Us: two painted pictures of the two of you, made from your main photos. Both must say yes; every picture is marked as imagined.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BackButton, ErrorNote, useAction } from "@/components/ui";
import { useApp } from "@/components/app";
import { Pair } from "@/components/couple";
import { api, type Universe } from "@/lib/api";

const SCENES: [string, string, string, string][] = [
  ["travel", "On a trip", "A hill-station viewpoint at golden hour", "linear-gradient(160deg, #FFB27A, #7E5BEF)"],
  ["wedding", "Our wedding", "Marigolds and a warm mandap", "linear-gradient(160deg, #FFD36E, #E8456B)"],
  ["old_age", "At 70", "Grey hair, a cosy home, still laughing", "linear-gradient(160deg, #F6E7C8, #8A6F4E)"],
];

export default function Imagine() {
  const { match } = useParams<{ match: string }>();
  const router = useRouter();
  const { home, reload } = useApp();
  const [u, setU] = useState<Universe | null>(null);
  const [scene, setScene] = useState("travel");
  const { busy, error, run } = useAction();
  useEffect(() => { api().universe(match).then(setU).catch(() => {}); }, [match]);
  const go = () => run(async () => { const r = await api().startCoupleReading(match, "imagine_us", scene); await reload(); router.push(`/readings/${r.id}`); });
  if (!u) return <div className="app-body pad"><div className="skel" style={{ height: 300 }} /></div>;
  const done = u.readings.imagine_us;
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href={`/universe/${match}`} /><h1>Imagine Us</h1></div>
      <Pair me={home?.first_name ?? "You"} other={u.other_name} line="Two painted pictures, made from your main photos" />
      {done && <Link className="rowlink" href={`/readings/${done.id}`}><span className="t"><strong>Your last pictures</strong>
        <span>{done.status === "ready" ? "Open them" : done.status === "pending_consent" ? `Waiting for ${u.other_name} to say yes` : "Being painted…"}</span></span></Link>}
      <div className="stack" role="radiogroup" aria-label="Scene" style={{ gap: 8 }}>
        {SCENES.map(([k, t, d, bg]) => (
          <button key={k} type="button" role="radio" aria-checked={scene === k} onClick={() => setScene(k)}
            style={{ display: "flex", gap: 12, alignItems: "center", padding: 10, borderRadius: 18, border: scene === k ? "2px solid var(--ink)" : "1px solid var(--line)", background: "#fff", textAlign: "left", font: "inherit", color: "var(--ink)" }}>
            <span aria-hidden="true" style={{ width: 64, height: 64, borderRadius: 14, background: bg, flex: "none" }} />
            <span className="stack" style={{ gap: 2 }}><strong>{t}</strong><span className="small">{d}</span></span>
          </button>
        ))}
      </div>
      <ul className="sub" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 13 }}>
        <li>{u.other_name} is asked first. You&apos;re only charged if they say yes.</li>
        <li>Every picture is marked &quot;Imagined, not a real photo&quot;.</li>
        <li>Only the two of you can see them. Both of your main photos need to be approved.</li>
      </ul>
      <ErrorNote error={error} />
      <div className="grow" />
      <button type="button" className="btn" disabled={busy} onClick={go}>Ask {u.other_name} · {u.prices.imagine_us} credits</button>
    </div>
  );
}
