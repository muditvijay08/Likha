"use client";
// D2 Full profile: photos, scores, prompts, chart basics, voice intro. Pass / Cosmic Like / Like, or Message once matched.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ErrorNote, useAction } from "@/components/ui";
import { DIET_LABEL, GOAL_LABEL, Info, PhotoBlock, SampleTag, TIER_LABEL, price, useApp } from "@/components/app";
import { api, type ProfileFull } from "@/lib/api";

const round = { position: "absolute", top: 16, width: 44, height: 44, borderRadius: 999, background: "rgba(255,255,255,0.92)", color: "var(--ink)",
  display: "flex", alignItems: "center", justifyContent: "center", border: 0 } as const;

export default function Profile() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { prices, reload } = useApp();
  const [p, setP] = useState<ProfileFull | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [photo, setPhoto] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const { busy, error, run } = useAction();

  useEffect(() => { api().profile(id).then((v) => { setP(v); api().noteView(id).catch(() => {}); }).catch((e) => setGone(e instanceof Error ? e.message : "This profile isn't available.")); }, [id]);

  const like = (kind: "like" | "cosmic_like") => run(async () => {
    const r = await api().like(id, kind);
    await reload();
    if (r.matched && r.match_id) router.push(`/match/${r.match_id}`);
    else { setP((x) => x && { ...x, i_liked: true }); }
  });
  const pass = () => run(async () => { await api().pass(id); router.push("/discover"); });
  const voice = () => {
    if (!p?.voice_url) return;
    if (!audio.current) { audio.current = new Audio(p.voice_url); audio.current.onended = () => setPlaying(false); }
    if (playing) { audio.current.pause(); setPlaying(false); } else { audio.current.play().then(() => setPlaying(true)).catch(() => {}); }
  };

  if (gone) return <div className="app-body"><div className="empty card"><strong>{gone}</strong><Link className="btn" href="/discover">Back to Discover</Link></div></div>;
  if (!p) return <div className="app-body flush"><div className="skel" style={{ height: 270, borderRadius: 0 }} /><div className="app-body"><div className="skel" style={{ height: 200 }} /></div></div>;
  const n = Math.max(1, p.photos.length);

  return (
    <div className="app-body flush">
      <PhotoBlock name={p.first_name} photos={p.photos} height={270} index={photo}>
        <button type="button" aria-label="Back" className="tip" data-tip="Back" onClick={() => router.back()} style={{ ...round, left: 16 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
        <Link href={`/safety/report?user=${p.id}`} aria-label="Report or block" className="tip tip-r" data-tip="Report or block" style={{ ...round, right: 16 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg></Link>
        {n > 1 && <>
          <button type="button" aria-label="Previous photo" onClick={() => setPhoto((photo + n - 1) % n)} style={{ position: "absolute", left: 0, top: 70, bottom: 30, width: "40%", background: "transparent", border: 0 }} />
          <button type="button" aria-label="Next photo" onClick={() => setPhoto((photo + 1) % n)} style={{ position: "absolute", right: 0, top: 70, bottom: 30, width: "40%", background: "transparent", border: 0 }} />
          <div aria-hidden="true" style={{ position: "absolute", bottom: 12, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6 }}>
            {p.photos.map((_, i) => <span key={i} style={{ width: 22, height: 4, borderRadius: 999, background: i === photo ? "#fff" : "rgba(255,255,255,0.5)" }} />)}
          </div>
        </>}
        <span style={{ position: "absolute", left: 16, bottom: 22 }}><SampleTag on={p.is_sample} /></span>
      </PhotoBlock>

      <div style={{ padding: "16px 20px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div className="stack" style={{ gap: 2 }}>
            <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 28, fontWeight: 600 }}>{p.first_name}{p.age ? `, ${p.age}` : ""}</h1>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>{[p.profession, p.city].filter(Boolean).join(" · ")}</span>
          </div>
          {p.jodi_score != null && (
            <Link href={`/report/${p.id}`} style={{ background: "var(--saffron)", borderRadius: 14, padding: "8px 12px", textAlign: "center", display: "flex", flexDirection: "column", color: "var(--ink)", textDecoration: "none" }}>
              <span className="serif" style={{ fontSize: 24, fontWeight: 600, lineHeight: 1 }}>{p.jodi_score}%</span>
              <span style={{ fontSize: 11, fontWeight: 700 }}>{p.gunas}/36 Gunas<Info cls="tip-r" text="Guna Milan: the traditional 36-point kundli match. 18 or more is seen as good." /></span>
            </Link>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {p.verified && <span className="tag v">Verified</span>}
          {TIER_LABEL[p.tier] && <span className="tag tier">{TIER_LABEL[p.tier]}</span>}
          {p.goal && <span className="tag goal">{GOAL_LABEL[p.goal]}</span>}
          {p.diet && <span className="tag">{DIET_LABEL[p.diet] ?? p.diet}</span>}
          {p.languages?.length > 0 && <span className="tag">{p.languages.join(", ")}</span>}
          {p.height_cm && <span className="tag">{Math.floor(p.height_cm / 30.48)}′{Math.round((p.height_cm / 2.54) % 12)}″</span>}
          {p.liked_me && <span className="tag goal">Likes you</span>}
        </div>
        {(p.prompts.length ? p.prompts : p.prompt ? [p.prompt] : []).map((q) => (
          <div key={q.label} className="card stack" style={{ gap: 4, padding: "12px 14px", borderRadius: 16 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--link)" }}>{q.label}</span>
            <span style={{ fontSize: 14, lineHeight: 1.4 }}>{q.answer}</span>
          </div>
        ))}
        {p.moon_sign && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6, textAlign: "center" }}>
            {[["Lagna", p.lagna], ["Moon", p.moon_sign], ["Nakshatra", p.nakshatra], ["Manglik", p.manglik ? "Yes" : "No"]].map(([k, v]) => (
              <div key={k} style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: "8px 4px", display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 10, color: "var(--muted)" }}>{k}{k === "Manglik" && <Info cls="tip-r" text="Manglik: a Mars placement some families check. We show it, never filter by it." />}</span>
                <strong style={{ fontSize: 12 }}>{v ?? "–"}</strong>
              </div>
            ))}
          </div>
        )}
        {p.voice_url && (
          <div className="row" style={{ gap: 10, padding: "10px 12px", borderRadius: 14, background: "var(--rose-soft)" }}>
            <button type="button" onClick={voice} className="tip tip-up" data-tip={playing ? "Pause" : "Play voice intro"} aria-label={playing ? "Pause voice intro" : "Play voice intro"}
              style={{ width: 36, height: 36, borderRadius: 999, border: 0, background: "var(--rose)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{playing ? <path d="M7 5h4v14H7zM13 5h4v14h-4z" /> : <path d="M7 4l13 8-13 8z" />}</svg></button>
            <div style={{ flex: 1, height: 4, borderRadius: 999, background: "#FFC6D4" }} />
            <span style={{ fontSize: 12, color: "#8A3A55", fontWeight: 600 }}>Voice intro</span>
          </div>
        )}
        {p.interests.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{p.interests.map((x) => <span key={x} className="tag" style={{ fontWeight: 600 }}>{x}</span>)}</div>}
        <Link href={`/report/${p.id}`} style={{ fontSize: 13, fontWeight: 600 }}>Full compatibility report · {price(prices, "full_report", 29)} credits</Link>
        <ErrorNote error={error} />
      </div>

      <div className="row" style={{ gap: 10, padding: "12px 20px 24px" }}>
        {p.match_id ? (
          <Link href={`/chat/${p.match_id}`} className="btn mid">Message {p.first_name}</Link>
        ) : p.i_liked ? (
          <button type="button" className="btn mid" disabled>Liked. Fingers crossed</button>
        ) : <>
          <button type="button" className="btn outline" style={{ flex: 1, fontSize: 14 }} onClick={pass} disabled={busy}>Pass</button>
          <button type="button" className="btn rose" style={{ flex: 1.2 }} onClick={() => like("cosmic_like")} disabled={busy}>Cosmic Like · {price(prices, "cosmic_like", 9)}</button>
          <button type="button" className="btn mid" style={{ flex: 1.2, fontSize: 14 }} onClick={() => like("like")} disabled={busy}>Like</button>
        </>}
      </div>
    </div>
  );
}
