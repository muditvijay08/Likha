"use client";
// F1 Family view: share a read-only page with family on WhatsApp. Your own page goes live at once; a match's page only
// after they say yes. No photos, no birth details, no chat. Links stop after 7 days, or when either of you stops them.
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BackButton, ErrorNote, useAction } from "@/components/ui";
import { useApp } from "@/components/app";
import { api, type FamilyShares, type MatchRow } from "@/lib/api";

const STATUS: Record<string, string> = { waiting: "Waiting for their yes", active: "Live", declined: "They said no", revoked: "Stopped", expired: "Ended after 7 days" };

export default function FamilyPage() { return <Suspense><Family /></Suspense>; }

function Family() {
  const q = useSearchParams();
  const { toast } = useApp();
  const [s, setS] = useState<FamilyShares | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const { busy, error, run } = useAction();
  const load = useCallback(() => api().familyShares().then(setS).catch(() => setS({ mine: [], requests: [] })), []);
  useEffect(() => { load(); api().matches().then(setMatches).catch(() => {}); }, [load]);
  // A waiting request may turn live while the page is open.
  useEffect(() => { if (!s?.mine.some((x) => x.status === "waiting")) return; const t = setInterval(load, 4000); return () => clearInterval(t); }, [s, load]);

  const link = (token: string) => `${location.origin}/f/${token}`;
  const wa = (token: string, about: string | null) =>
    `https://wa.me/?text=${encodeURIComponent(`${about ? `${about}'s profile and our kundli match` : "My Likha profile and kundli"}, for the family: ${link(token)} (works for 7 days)`)}`;
  const create = (matchId?: string) => run(async () => {
    const r = await api().familyShareCreate(matchId);
    toast(r.status === "active" ? "Your family page is ready" : "Asked. We'll tell you when they say yes.");
    await load();
  });
  const preselect = q.get("match");

  return (
    <div className="app-body pad" style={{ gap: 16 }}>
      <div className="titlebar"><BackButton /><h1>Family view</h1></div>
      <p className="sub" style={{ margin: 0 }}>Share a read-only page with your family on WhatsApp. They see the profile and kundli match, never photos, birth details or chats. Links stop after 7 days.</p>

      {s && s.requests.length > 0 && (
        <section aria-label="Requests for you" className="stack" style={{ gap: 10 }}>
          <h2 className="h2" style={{ margin: 0, fontSize: 18 }}>Asked of you</h2>
          {s.requests.map((r) => (
            <div key={r.id} className="card stack" style={{ gap: 10 }}>
              <span style={{ fontSize: 14 }}><strong>{r.from}</strong> would like to show your profile and your kundli match to their family. No photos, birth details or chats.</span>
              <div className="grid2" style={{ gap: 8 }}>
                <button type="button" className="btn ghost" disabled={busy} onClick={() => run(async () => { await api().familyShareAnswer(r.id, false); await load(); })}>Not now</button>
                <button type="button" className="btn" disabled={busy} onClick={() => run(async () => { await api().familyShareAnswer(r.id, true); toast("Shared with their family"); await load(); })}>Yes, that&apos;s fine</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section aria-label="Share" className="stack" style={{ gap: 10 }}>
        <button type="button" className="rowlink" disabled={busy} onClick={() => create()} style={{ textAlign: "left", font: "inherit" }}>
          <span className="t"><strong>Share my own page</strong><span>Your profile and kundli summary, for your family</span></span><span aria-hidden="true">→</span>
        </button>
        {matches.map((m) => (
          <button key={m.match_id} type="button" className="rowlink" disabled={busy} onClick={() => create(m.match_id)} style={{ textAlign: "left", font: "inherit", outline: preselect === m.match_id ? "2px solid var(--saffron)" : undefined }}>
            <span className="t"><strong>Share {m.first_name}&apos;s page</strong><span>{m.gunas != null ? `${m.gunas} of 36 Gunas · ` : ""}{m.first_name} is asked first</span></span><span aria-hidden="true">→</span>
          </button>
        ))}
        {!matches.length && <span className="small">When you match, you can ask to share their page too.</span>}
        <ErrorNote error={error} />
      </section>

      {s && s.mine.length > 0 && (
        <section aria-label="Your links" className="stack" style={{ gap: 10 }}>
          <h2 className="h2" style={{ margin: 0, fontSize: 18 }}>Your links</h2>
          {s.mine.map((f) => (
            <div key={f.id} className="card stack" style={{ gap: 8 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong style={{ fontSize: 15 }}>{f.about ? `${f.about}'s page` : "My page"}</strong>
                <span style={{ fontSize: 12, fontWeight: 700, color: f.status === "active" ? "#1F5E49" : "var(--muted)" }}>{STATUS[f.status]}</span>
              </div>
              {f.token && <>
                <span className="small">Opened {f.views} {f.views === 1 ? "time" : "times"} · until {new Date(f.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                <div className="grid2" style={{ gap: 8 }}>
                  <a className="btn" href={wa(f.token, f.about)} target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>
                  <button type="button" className="btn ghost" onClick={() => navigator.clipboard?.writeText(link(f.token!)).then(() => toast("Link copied"), () => toast(link(f.token!)))}>Copy link</button>
                </div>
              </>}
              {(f.status === "active" || f.status === "waiting") && (
                <button type="button" className="linkbtn" style={{ alignSelf: "flex-start" }} onClick={() => run(async () => { await api().familyShareRevoke(f.id); await load(); })}>Stop this link</button>
              )}
            </div>
          ))}
        </section>
      )}
      <Link href="/privacy" className="small" style={{ textAlign: "center" }}>How we keep family pages private</Link>
    </div>
  );
}
