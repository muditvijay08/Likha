"use client";
// N2 Your cosmic toolkit: try each feature once, get a few credits the first time.
import Link from "next/link";
import { useEffect, useState } from "react";
import { BackButton } from "@/components/ui";
import { api, type Toolkit } from "@/lib/api";

export default function ToolkitPage() {
  const [t, setT] = useState<Toolkit | null>(null);
  useEffect(() => { api().toolkit().then(setT).catch(() => {}); }, []);
  if (!t) return <div className="app-body pad"><div className="skel" style={{ height: 400 }} /></div>;
  const left = t.items.filter((i) => !i.tried).length;
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/menu" /><div className="stack" style={{ gap: 2, flex: 1 }}><h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 24, fontWeight: 600 }}>Your cosmic toolkit</h1>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Try something new, get {t.reward} credits the first time. {left ? `${left * t.reward} credits still to earn.` : "You've tried everything!"}</span></div></div>
      <div className="stack" style={{ gap: 8 }}>
        {t.items.map((i) => (
          <Link key={i.key} href={i.link} className="rowlink" style={{ opacity: i.tried ? 0.7 : 1 }}>
            <span style={{ width: 12, height: 12, borderRadius: 999, flex: "none", background: i.tried ? "var(--green)" : "var(--saffron)" }} />
            <span className="t"><strong>{i.title}</strong><span>{i.body}</span></span>
            <span style={{ fontSize: 12, fontWeight: 700, color: i.tried ? "#1F5E49" : "var(--link)" }}>{i.tried ? "Tried" : `+${t.reward} cr`}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
