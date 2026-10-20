"use client";
// How others see my profile (D2 layout, my own data, no actions).
import { useEffect, useState } from "react";
import { BackButton } from "@/components/ui";
import { DIET_LABEL, GOAL_LABEL, PhotoBlock } from "@/components/app";
import { api, type MyProfile } from "@/lib/api";

export default function Preview() {
  const [p, setP] = useState<MyProfile | null>(null);
  const [i, setI] = useState(0);
  useEffect(() => { api().myProfile().then(setP).catch(() => {}); }, []);
  if (!p) return <div className="app-body"><div className="skel" style={{ height: 400 }} /></div>;
  const photos = p.photos.filter((x) => x.status !== "rejected").map((x) => x.url).filter(Boolean);
  return (
    <div className="app-body flush">
      <PhotoBlock name={p.first_name} photos={photos} height={270} index={i}>
        <div style={{ position: "absolute", top: 16, left: 16 }}><BackButton href="/me" /></div>
        {photos.length > 1 && <button type="button" aria-label="Next photo" onClick={() => setI((i + 1) % photos.length)} style={{ position: "absolute", inset: "70px 0 30px 40%", background: "transparent", border: 0 }} />}
        <span style={{ position: "absolute", right: 16, top: 24, padding: "4px 10px", borderRadius: 999, background: "rgba(30,24,56,.75)", color: "#fff", font: "700 11px var(--sans)" }}>Preview: how others see you</span>
      </PhotoBlock>
      <div style={{ padding: "16px 20px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="stack" style={{ gap: 2 }}><h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 28, fontWeight: 600 }}>{p.first_name}{p.age ? `, ${p.age}` : ""}</h1>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{[p.profession, !p.hide_company && p.company, p.city].filter(Boolean).join(" · ")}</span></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {p.selfie_status === "passed" && <span className="tag v">Verified</span>}
          {p.goal && <span className="tag goal">{GOAL_LABEL[p.goal]}</span>}
          {p.diet && <span className="tag">{DIET_LABEL[p.diet]}</span>}
          {p.languages.length > 0 && <span className="tag">{p.languages.join(", ")}</span>}
          {p.show_religion && p.religion && <span className="tag">{p.religion}</span>}
        </div>
        {p.bio && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{p.bio}</p>}
        {p.prompts.map((q) => <div key={q.key} className="card stack" style={{ gap: 4, borderRadius: 16 }}><span style={{ fontSize: 12, fontWeight: 700, color: "var(--link)" }}>{q.label}</span><span style={{ fontSize: 14 }}>{q.answer}</span></div>)}
        <span className="small" style={{ paddingBottom: 12 }}>Your Jodi Score with each person shows on their screen. Your birth details never do.</span>
      </div>
    </div>
  );
}
