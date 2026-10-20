"use client";
// L6 Account states: selfie being reviewed, paused or removed (with an appeal), and how to get help.
import Link from "next/link";
import { useEffect, useState } from "react";
import { BackButton, ErrorNote, Primary, Screen, useAction } from "@/components/ui";
import { api, type AccountState } from "@/lib/api";
import { useGuard } from "@/lib/guard";

const WHAT: Record<string, string> = { warn: "A warning on your account", hide: "Your profile is hidden while we review it", suspend: "Account paused", ban: "Account removed" };

export default function AccountStatus() {
  useGuard();
  const [s, setS] = useState<AccountState | null>(null);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction();
  useEffect(() => { api().accountState().then(setS).catch(() => {}); }, []);
  const appeal = () => run(async () => { await api().appeal(s!.action!.id, text.trim()); setSent(true); setS(await api().accountState()); });

  if (!s) return <Screen><div className="skel" style={{ height: 300 }} /></Screen>;
  const a = s.action;
  const blocked = ["suspended", "banned", "under_review"].includes(s.status);
  return (
    <Screen>
      {!blocked && <BackButton href="/home" />}
      {s.status === "active" && (s.selfie_status === "manual_review" || s.selfie_status === "pending") ? <>
        <h1 className="h1">A person is checking your selfie</h1>
        <p className="sub">The automatic check wasn&apos;t sure, or you changed your name or main photo, so a reviewer is looking. Usually done within 24 hours.</p>
        <ol className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 10 }}>
          <li className="row"><span style={{ width: 12, height: 12, borderRadius: 999, background: "var(--saffron)" }} />Being reviewed</li>
          <li className="row" style={{ color: "var(--muted)" }}><span style={{ width: 12, height: 12, borderRadius: 999, border: "2px solid var(--line)" }} />Verified badge</li>
        </ol>
        <div className="note"><span>Meanwhile you can browse and read your Daily Kick. Likes unlock once you&apos;re verified.</span></div>
        <div className="grow" />
        <Link className="btn" href="/home">Back to Home</Link>
      </> : s.status === "active" && s.selfie_status === "failed" ? <>
        <h1 className="h1">We couldn&apos;t verify your selfie</h1>
        <p className="sub">It didn&apos;t match your main photo. Try again in good light, or contact Help if you think this is wrong.</p>
        <div className="grow" />
        <Link className="btn" href="/selfie">Try the selfie again</Link>
        <Link className="btn text" href="/help">Contact Help</Link>
      </> : a ? <>
        <h1 className="h1">{WHAT[a.action] ?? "About your account"}</h1>
        <div className="card stack" style={{ gap: 6, borderRadius: 18 }}>
          <span><strong>Reason:</strong> {a.reason}</span>
          {a.until && <span><strong>Back on:</strong> {new Date(a.until).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}
          {s.tier_paused_until && <span className="small">Your tier discount is on hold until {new Date(s.tier_paused_until).toLocaleDateString("en-IN")}.</span>}
        </div>
        {a.appealed || sent ? (
          <div className="note"><span>{a.appeal_status === "overturned" ? "Your appeal was accepted." : a.appeal_status === "upheld" ? "Your appeal was reviewed and the decision stands." : "Appeal received. A different person from our team reviews it, usually within 3 days."}</span></div>
        ) : a.can_appeal ? <>
          <div className="field"><label htmlFor="ap" className="label">Appeal this decision <span style={{ fontWeight: 400, color: "var(--muted)" }}>(once, within 30 days)</span></label>
            <textarea id="ap" className="input" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell us what happened." /></div>
          <ErrorNote error={error} />
          <Primary onClick={appeal} busy={busy} disabled={!text.trim()}>Send appeal</Primary>
        </> : <span className="small">The time to appeal this decision has passed.</span>}
        <div className="grow" />
        <Link className="btn text" href="/help">Help and grievances</Link>
      </> : <>
        <h1 className="h1">All good</h1>
        <p className="sub">Your account is in good standing.</p>
        <Link className="btn" href="/home">Back to Home</Link>
      </>}
    </Screen>
  );
}
