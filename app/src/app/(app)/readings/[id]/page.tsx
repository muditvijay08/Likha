"use client";
// Reading result (any paid reading). Waits while it's being written; refunded readings say so.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BackButton } from "@/components/ui";
import { Avatar, useApp } from "@/components/app";
import { api, type Card, type ReadingFull } from "@/lib/api";

const TITLE: Record<string, string> = { why_not: "Why It Didn't Work", who_suits_me: "Who Suits Me", check_anyone: "Check With Anyone", compat_report: "Compatibility report",
  gift: "Your year ahead", next_12_months: "Love forecast", our_stars: "Our Stars" };

export default function ReadingPage() {
  const { id } = useParams<{ id: string }>();
  const { reload } = useApp();
  const [r, setR] = useState<ReadingFull | null | undefined>(undefined);
  const [better, setBetter] = useState<Card[]>([]);
  useEffect(() => {
    let stop = false, n = 0;
    const load = async () => {
      const v = await api().readingView(id).catch(() => null);
      if (stop) return; setR(v);
      if (v?.status === "generating" && ++n < 60) setTimeout(load, 2500);
      if (v?.status === "refunded") reload().catch(() => {});
      if (v?.kind === "why_not" && v.status === "ready") api().discover(0).then((c) => setBetter(c.slice(0, 3))).catch(() => {});
    };
    load();
    return () => { stop = true; };
  }, [id, reload]);

  if (r === undefined) return <div className="app-body pad"><div className="skel" style={{ height: 400 }} /></div>;
  if (!r) return <div className="app-body pad"><BackButton href="/readings" /><div className="empty card"><strong>Reading not found</strong></div></div>;
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/readings" /><h1>{TITLE[r.kind] ?? "Your reading"}</h1></div>
      {r.status === "generating" || r.status === "pending_consent" ? (
        <div className="card stack" style={{ alignItems: "center", textAlign: "center", gap: 10, padding: 24, borderRadius: 22 }}>
          <span className="spinner" aria-hidden="true" />
          <strong>{r.status === "pending_consent" ? `Waiting for ${r.name ?? "them"} to join and agree` : "Writing your reading"}</strong>
          <span className="sub">{r.status === "pending_consent" ? "The full reading unlocks for both of you then." : "Usually under a minute. We'll notify you if you leave."}</span>
        </div>
      ) : r.status === "refunded" || r.status === "failed" ? (
        <div className="card stack" style={{ gap: 8, borderRadius: 20 }}><strong>We couldn&apos;t write this one</strong><span className="sub">Your {r.credits_charged} credits are back in your wallet.</span></div>
      ) : r.status === "declined" ? (
        <div className="card stack" style={{ gap: 8, borderRadius: 20 }}><strong>{r.name ?? "They"} said no to this reading</strong><span className="sub">Nothing was charged.</span></div>
      ) : r.content && <>
        <h2 className="serif" style={{ margin: 0, fontSize: 24, fontWeight: 600, lineHeight: 1.2 }}>{r.content.title}</h2>
        {r.content.summary && <p className="sub" style={{ color: "#3D3560", fontSize: 15 }}>{r.content.summary}</p>}
        {r.content.sections.map((s, i) => (
          <section key={s.heading} className="stack" style={{ padding: "14px 16px", borderRadius: 18, gap: 6, fontSize: 14, lineHeight: 1.55,
            background: ["#FFF3D6", "#F3EEFF", "var(--rose-soft)", "var(--green-soft)"][i % 4] }}>
            <strong style={{ fontSize: 15 }}>{i + 1} · {s.heading}</strong><span>{s.body}</span></section>
        ))}
        {r.content.try_this && <div className="note"><span><strong>Try this:</strong> {r.content.try_this}</span></div>}
        {better.length > 0 && (
          <section className="stack" style={{ gap: 8 }}>
            <strong style={{ fontSize: 14 }}>{r.content.sections.length + 1} · People in your feed who suit you better</strong>
            {better.map((c) => <Link key={c.id} href={`/profile/${c.id}`} className="rowlink"><Avatar name={c.first_name} photo={c.photos[0]} size={44} />
              <span className="t"><strong>{c.first_name}{c.age ? `, ${c.age}` : ""}</strong><span>{c.jodi_score}% Jodi Score · {c.gunas} Gunas</span></span></Link>)}
          </section>
        )}
        <span className="small">Guidance, not a verdict. Astrology shows tendencies, never fate.</span>
      </>}
    </div>
  );
}
