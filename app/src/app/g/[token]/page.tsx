"use client";
// L2 Gift landing (likha.in/g/<token>): who it's from, the note, and when it opens. Opening needs the number it was sent to.
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Screen } from "@/components/ui";
import { api, type GiftLanding } from "@/lib/api";
import { saveClaim } from "@/lib/referral";

const KIND: Record<string, string> = { gift: "Your year ahead in love", who_suits_me: "Who suits you", next_12_months: "Your love forecast" };
const iso = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

export default function GiftLandingPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [v, setV] = useState<GiftLanding | null | undefined>(undefined);
  useEffect(() => { api().giftLanding(token).then(setV).catch(() => setV(null)); }, [token]);
  const open = async () => {
    saveClaim({ type: "gift", token });
    router.push((await api().signedIn().catch(() => false)) ? "/home" : "/start");
  };
  if (v === undefined) return <Screen><div className="skel" style={{ height: 240 }} /></Screen>;
  if (!v || !v.open) return (
    <Screen><div className="wordmark">Likha<span>.</span></div><h1 className="h1">This gift has ended</h1>
      <p className="sub">It was already opened, or 30 days have passed.</p><a className="btn" href="/start">Join Likha</a></Screen>
  );
  const ready = v.deliver_on <= iso();
  const day = new Date(`${v.deliver_on}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long" });
  return (
    <Screen style={{ gap: 14 }}>
      <div className="wordmark">Likha<span>.</span></div>
      <div style={{ padding: 20, borderRadius: 22, background: "linear-gradient(135deg, #FFE7B8, #FFD3E0)" }} className="stack">
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "var(--rose-ink)" }}>A GIFT FOR {v.name.toUpperCase()}</span>
        <strong className="serif" style={{ fontSize: 26 }}>{KIND[v.kind] ?? "A reading"}</strong>
        {v.note && <span style={{ fontSize: 15 }}>&ldquo;{v.note}&rdquo;</span>}
        <span style={{ fontSize: 13, color: "#3D3560" }}>From {v.from}</span>
      </div>
      <p className="sub">{ready ? "It's ready to open." : `It opens on ${day}. You can join now and it'll be waiting.`} Join with the mobile number it was sent to and add your birth details; the reading is written from your own kundli.</p>
      <div className="grow" />
      <button type="button" className="btn" onClick={open}>{ready ? "Open my gift" : "Join now"}</button>
    </Screen>
  );
}
