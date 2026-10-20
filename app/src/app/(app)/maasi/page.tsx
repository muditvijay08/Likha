"use client";
// X3 Rishta Maasi: three people picked for you each Sunday (checked by our team). Interested on both sides means a match.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BackButton, ErrorNote, useAction } from "@/components/ui";
import { Avatar, DIET_LABEL, SampleTag, rupees } from "@/components/app";
import { api, type MaasiState } from "@/lib/api";

export default function Maasi() {
  const router = useRouter();
  const [m, setM] = useState<MaasiState | null>(null);
  const [answered, setAnswered] = useState<Record<string, string>>({});
  const { busy, error, run } = useAction();
  useEffect(() => { api().maasi().then(setM).catch(() => {}); }, []);
  const answer = (id: string, yes: boolean) => run(async () => {
    const r = await api().answerMaasi(id, yes);
    setAnswered((a) => ({ ...a, [id]: yes ? "interested" : "not_for_me" }));
    if (r.matched && r.match_id) router.push(`/match/${r.match_id}`);
  });
  if (!m) return <div className="app-body pad"><div className="skel" style={{ height: 400 }} /></div>;

  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="row" style={{ gap: 12 }}>
        <BackButton href="/store" />
        <span className="avatar" style={{ width: 52, height: 52, background: "var(--saffron-soft)", color: "var(--link)", fontSize: 24 }}>M</span>
        <div className="stack" style={{ gap: 0 }}><h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 24, fontWeight: 600 }}>Rishta Maasi</h1>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Your matchmaker · Sunday picks · {rupees(m.price_paise)}/month</span></div>
      </div>
      {!m.until ? <>
        <div className="serif" style={{ padding: "16px 18px", borderRadius: 20, background: "#FFF3D6", fontSize: 18, lineHeight: 1.4 }}>
          Beta, every Sunday I&apos;ll look through the charts and send you three people I have a good feeling about.</div>
        <div className="card stack" style={{ gap: 6, fontSize: 13, lineHeight: 1.5, borderRadius: 18 }}>
          <span>Three picks every Sunday, with a note on why.</span><span>Our team checks every pick before it reaches you.</span>
          <span>Interested on both sides means a match.</span><span>One month prepaid. It doesn&apos;t renew by itself.</span>
        </div>
        <div className="grow" />
        <Link className="btn" href="/checkout?type=subscription&key=rishta_maasi">Start for {rupees(m.price_paise)}</Link>
      </> : <>
        <span className="small">Active until {new Date(m.until).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
        {m.picks.length === 0 ? (
          <div className="serif" style={{ padding: "16px 18px", borderRadius: 20, background: "#FFF3D6", fontSize: 18, lineHeight: 1.4 }}>Your first picks arrive this Sunday. Maasi is looking!</div>
        ) : <>
          <div className="serif" style={{ padding: "14px 16px", borderRadius: 18, background: "#FFF3D6", fontSize: 16, lineHeight: 1.4 }}>Beta, these three, I have a good feeling about.</div>
          {m.picks.map((p) => {
            const res = answered[p.pick_id] ?? p.response;
            return (
              <article key={p.pick_id} className="row" style={{ gap: 12, alignItems: "flex-start", padding: 14, borderRadius: 20, background: "#fff", border: "1px solid var(--line)" }}>
                <Link href={`/profile/${p.id}`}><Avatar name={p.first_name} photo={p.photos[0]} size={56} /></Link>
                <div className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}><strong style={{ fontSize: 15 }}>{p.first_name}{p.age ? `, ${p.age}` : ""}</strong>
                    {p.gunas != null && <span style={{ fontSize: 12, fontWeight: 700, color: "var(--link)" }}>{p.gunas} Gunas</span>}</div>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{[p.profession, p.city, p.diet ? DIET_LABEL[p.diet] : null].filter(Boolean).join(" · ")}</span>
                  <span style={{ fontSize: 13, fontStyle: "italic", color: "#3D3560" }}>&ldquo;{p.note}&rdquo;</span>
                  <SampleTag on={p.is_sample} />
                  {res ? <span style={{ fontSize: 12, fontWeight: 700, color: res === "interested" ? "#1F5E49" : "var(--muted)" }}>{res === "interested" ? "You're interested" : "Not for you"}</span> : (
                    <div className="row" style={{ gap: 8, paddingTop: 4 }}>
                      <button type="button" className="chip sm" style={{ background: "var(--saffron)", borderColor: "var(--saffron)" }} disabled={busy} onClick={() => answer(p.pick_id, true)}>Interested</button>
                      <button type="button" className="chip sm" disabled={busy} onClick={() => answer(p.pick_id, false)}>Not for me</button>
                    </div>)}
                </div>
              </article>
            );
          })}
        </>}
        <ErrorNote error={error} />
        <span className="small" style={{ textAlign: "center" }}>Interested on both sides means a match. Picks get sharper every week.</span>
      </>}
    </div>
  );
}
