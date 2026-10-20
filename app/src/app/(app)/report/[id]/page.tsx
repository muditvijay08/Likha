"use client";
// D4 Compatibility report. The Ashtakoot breakdown and doshas are free (computed). The written part costs credits once.
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BackButton, ErrorNote, Primary, useAction } from "@/components/ui";
import { Info, price, useApp } from "@/components/app";
import { api, type ProfileFull, type Reading } from "@/lib/api";

const KOOTAS: [string, string, number, string][] = [
  ["varna", "Varna", 1, "Work style and ego."], ["vashya", "Vashya", 2, "Who leads, who follows."], ["tara", "Tara", 3, "Luck and wellbeing together."],
  ["yoni", "Yoni", 4, "Physical and emotional comfort."], ["graha_maitri", "Graha Maitri", 5, "Friendship between your Moon signs' lords."],
  ["gana", "Gana", 6, "Temperament."], ["bhakoot", "Bhakoot", 7, "Family life and growth."], ["nadi", "Nadi", 8, "Health and genes, traditionally the most weighted."],
];
const verdict = (g: number) => g >= 33 ? ["Excellent match", "33 or more Gunas is traditionally excellent."] : g >= 25 ? ["Good match", "25 to 32 Gunas is traditionally good."]
  : g >= 18 ? ["Average match", "18 to 24 Gunas is traditionally acceptable."] : ["Below the traditional mark", "Under 18 Gunas. Many happy couples are here too."];

export default function Report() {
  const { id } = useParams<{ id: string }>();
  const { prices, reload } = useApp();
  const [p, setP] = useState<ProfileFull | null>(null);
  const [r, setR] = useState<Reading | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  useEffect(() => {
    api().profile(id).then(setP).catch((e) => setGone(e instanceof Error ? e.message : "Not available."));
    api().reading("compat_report", id).then(setR).catch(() => {});
  }, [id]);

  const buy = () => run(async () => {
    const x = await api().compatReport(id);
    setR(x); await reload();
    if (x.status === "refunded" || x.status === "failed") throw new Error("We couldn't write this one. Your credits are back in your wallet.");
  });

  if (gone) return <div className="app-body pad"><BackButton /><div className="empty card"><strong>{gone}</strong></div></div>;
  if (!p) return <div className="app-body pad"><div className="skel" style={{ height: 420 }} /></div>;
  const g = Number(p.gunas ?? 0);
  const [title, line] = verdict(g);
  const d = p.doshas ?? {};
  const doshaLines: string[] = [];
  doshaLines.push(p.manglik === null ? "" : d.manglik_match ? (p.manglik ? "Manglik: both of you, which traditionally balances out." : "Manglik: neither of you.") : "Manglik: one of you. Families often check this; it's one factor of many.");
  for (const [k, label] of [["nadi", "Nadi"], ["bhakoot", "Bhakoot"], ["gana", "Gana"]] as const) {
    const x = d[k];
    if (x?.present) doshaLines.push(`${label}: present${x.cancelled ? `, but cancelled because ${x.reason}` : "."}`);
  }
  if (!d.nadi?.present && !d.bhakoot?.present) doshaLines.push("Nadi and Bhakoot: no dosha.");
  const sections = r?.content?.sections ?? [];

  return (
    <div className="app-body pad">
      <div className="titlebar">
        <BackButton />
        <h1>You and {p.first_name}</h1>
        <span className="badge-soft tip tip-r" tabIndex={0} data-tip={p.borderline ? `${p.first_name}'s birth time is near a boundary: a few minutes could change one detail.` : `${p.first_name}'s birth time is clear of any sign or nakshatra boundary.`}
          style={p.borderline ? { background: "var(--saffron-soft)", color: "var(--saffron-ink)" } : undefined}>{p.borderline ? "Approx." : "Exact"}</span>
      </div>

      {p.kootas ? <>
        <div className="row" style={{ gap: 14, padding: "14px 16px", borderRadius: 20, background: "var(--saffron-soft)" }}>
          <span className="serif" style={{ fontSize: 44, fontWeight: 600, lineHeight: 1 }}>{g}<span style={{ fontSize: 18, color: "var(--saffron-ink)" }}>/36</span></span>
          <span className="stack" style={{ gap: 2 }}><strong style={{ fontSize: 16 }}>{title}</strong><span style={{ fontSize: 13, color: "#3D3560" }}>{line} Jodi Score {p.jodi_score}%.</span></span>
        </div>
        <section aria-label="Ashtakoot breakdown" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 20, padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
          {KOOTAS.map(([k, label, max, tip]) => {
            const v = Number(p.kootas?.[k] ?? 0);
            return (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "104px 1fr 40px", alignItems: "center", gap: 10 }}>
                <span>{label}<Info text={tip} /></span>
                <div style={{ height: 6, borderRadius: 999, background: "#ECE6FA" }} role="meter" aria-label={`${label} ${v} of ${max}`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={v}>
                  {v > 0 && <div style={{ width: `${(v / max) * 100}%`, height: 6, borderRadius: 999, background: "var(--saffron)" }} />}</div>
                <strong style={{ textAlign: "right" }}>{v}/{max}</strong>
              </div>
            );
          })}
        </section>
        <div className="card stack" style={{ gap: 4, fontSize: 13, lineHeight: 1.45, borderRadius: 16 }}>
          <strong>Doshas</strong>
          {doshaLines.filter(Boolean).map((x) => <span key={x}>{x}</span>)}
        </div>
      </> : <div className="card"><strong>Your scores are on their way</strong><p className="sub">We&apos;re still working out this pair. Check back in a minute.</p></div>}

      {r?.status === "ready" && r.content ? <>
        {r.content.summary && <p className="sub" style={{ color: "#3D3560" }}>{r.content.summary}</p>}
        <div className="grid2" style={{ gap: 8, fontSize: 13, lineHeight: 1.4 }}>
          {sections.slice(0, 2).map((s, i) => (
            <div key={s.heading} style={{ background: i === 0 ? "var(--green-soft)" : "var(--rose-soft)", borderRadius: 16, padding: 12, display: "flex", flexDirection: "column", gap: 4 }}>
              <strong style={{ color: i === 0 ? "#1F5E49" : "var(--rose-ink)" }}>{s.heading}</strong><span>{s.body}</span></div>
          ))}
        </div>
        {sections.slice(2).map((s) => <div key={s.heading} className="card stack" style={{ gap: 4, fontSize: 13, lineHeight: 1.45, borderRadius: 16 }}><strong>{s.heading}</strong><span>{s.body}</span></div>)}
        {r.content.try_this && <div className="note"><span><strong>Try this:</strong> {r.content.try_this}</span></div>}
      </> : r?.status === "generating" ? (
        <div className="card row" style={{ gap: 12 }}><span className="spinner" aria-hidden="true" /><span className="sub">Writing your report. It usually takes under a minute; we&apos;ll notify you.</span></div>
      ) : p.kootas && (
        <div className="card stack" style={{ gap: 10, borderRadius: 20 }}>
          <strong style={{ fontSize: 15 }}>The written report</strong>
          <span className="sub">Strengths, watch-outs and how to make it work, written for you two from these scores.</span>
          <Primary onClick={buy} busy={busy}>Read it · {price(prices, "full_report", 29)} credits</Primary>
          <span className="small">If it can&apos;t be written, your credits come straight back.</span>
        </div>
      )}
      <ErrorNote error={error} />
      <div className="small">Guidance, not a verdict. Every couple writes their own story.</div>
    </div>
  );
}
