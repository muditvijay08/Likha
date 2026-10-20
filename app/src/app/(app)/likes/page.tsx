"use client";
// D5 Likes you. Always free: everyone who liked you, newest first. Like back on their profile to match.
import Link from "next/link";
import { useEffect, useState } from "react";
import { SampleTag, ago, tint, useApp } from "@/components/app";
import { api, type LikeCard } from "@/lib/api";

export default function Likes() {
  const { reload } = useApp();
  const [likes, setLikes] = useState<LikeCard[] | null>(null);
  useEffect(() => {
    api().likesMe().then((l) => { setLikes(l); if (l.some((x) => x.new)) api().markLikesSeen().then(reload).catch(() => {}); }).catch(() => setLikes([]));
  }, [reload]);

  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="row" style={{ alignItems: "baseline", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 28, fontWeight: 600 }}>Likes you</h1>
        {likes && <span style={{ fontSize: 14, color: "var(--muted)" }}>{likes.length} {likes.length === 1 ? "person" : "people"}</span>}
      </div>
      <div className="row" style={{ gap: 10, padding: "12px 14px", borderRadius: 16, background: "var(--green-soft)", color: "#1F5E49", fontSize: 13, lineHeight: 1.4 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ flex: "none" }}><path d="M5 12l5 5L20 7" /></svg>
        <span><strong>Always free.</strong> See everyone who liked you. Like back to match.</span>
      </div>
      {likes === null ? <div className="grid2">{[0, 1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 170 }} />)}</div>
      : likes.length === 0 ? (
        <div className="empty card"><strong>No new likes yet</strong><span className="sub">Complete profiles with a voice intro get noticed more. Meanwhile, shoot your shot on Discover.</span>
          <Link className="btn" href="/discover">Go to Discover</Link></div>
      ) : (
        <div className="grid2" style={{ gap: 10 }}>
          {likes.map((l) => {
            const [bg, fg] = tint(l.first_name);
            return (
              <Link key={l.id} href={`/profile/${l.id}`} style={{ display: "flex", flexDirection: "column", borderRadius: 18, background: "#fff", border: l.kind === "cosmic_like" ? "1.5px solid #FF7A9A" : "1px solid var(--line)", color: "var(--ink)", textDecoration: "none", overflow: "hidden" }}>
                <div style={{ position: "relative", height: 112, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--serif)", fontSize: 40, color: fg }}>
                  {l.photos[0] ? <img src={l.photos[0]} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : l.first_name.slice(0, 1)}
                  {l.jodi_score != null && <span style={{ position: "absolute", top: 8, left: 8, background: "rgba(255,255,255,0.92)", borderRadius: 999, padding: "3px 8px", font: "700 12px var(--sans)", color: "var(--ink)" }}>{l.jodi_score}%</span>}
                  <span style={{ position: "absolute", top: 8, right: 8, font: "600 11px var(--sans)", color: "#3D3560" }}>{l.new ? "New" : ago(l.liked_at)}</span>
                  {l.kind === "cosmic_like" && <span style={{ position: "absolute", bottom: 8, left: 8, background: "var(--rose)", color: "#fff", borderRadius: 999, padding: "2px 8px", font: "700 10px var(--sans)" }}>Cosmic Like</span>}
                  <span style={{ position: "absolute", bottom: 8, right: 8 }}><SampleTag on={l.is_sample} /></span>
                </div>
                <div style={{ padding: "8px 10px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
                  <strong style={{ fontSize: 14 }}>{l.first_name}{l.age ? `, ${l.age}` : ""}</strong>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{[l.profession, l.gunas != null ? `${l.gunas} Gunas` : null].filter(Boolean).join(" · ")}</span>
                  {l.note && <span style={{ fontSize: 12, color: "var(--rose-ink)", fontStyle: "italic" }}>“{l.note}”</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
