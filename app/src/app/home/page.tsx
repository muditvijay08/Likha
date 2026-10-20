"use client";
// Home: next build. For now, confirms onboarding is complete and shows where the member stands.
import Link from "next/link";
import { Screen } from "@/components/ui";
import { useGuard } from "@/lib/guard";

export default function Home() {
  const s = useGuard();
  return (
    <Screen>
      <div className="wordmark">Likha<span>.</span></div>
      <h1 className="h1 big">Namaste{s?.first_name ? `, ${s.first_name}` : ""}</h1>
      <div className="card stack" style={{ gap: 6 }}>
        <strong>Profile {s?.pct ?? 0}% complete</strong>
        <span className="small">Status: {s?.status ?? "…"} · Selfie: {s?.selfie_status ?? "…"} · City: {s?.city?.name ?? "…"}</span>
      </div>
      <p className="sub">Home, Discover, Likes, Chats and Menu come in the next build (screens H1–N3 on the design canvas).</p>
      {(s?.pct ?? 0) < 100 && <Link className="btn" href="/bonus">Finish my profile</Link>}
    </Screen>
  );
}
