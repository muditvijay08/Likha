"use client";
// M3 Chat: live messages, voice notes, Golden Hour banner, Cupid openers (paid), shortcuts to Guru Ji and Golden Hours.
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ErrorNote, useAction } from "@/components/ui";
import { Avatar, SampleTag, price, useApp } from "@/components/app";
import { api, type ChatData, type Msg } from "@/lib/api";
import { clock, goldenHours } from "@/lib/panchang";

const day = (iso: string) => {
  const d = new Date(iso), t = new Date();
  if (d.toDateString() === t.toDateString()) return "Today";
  if (d.toDateString() === new Date(t.getTime() - 864e5).toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

function Chat() {
  const { id } = useParams<{ id: string }>();
  const q = useSearchParams();
  const router = useRouter();
  const { home, prices, reload } = useApp();
  const [c, setC] = useState<ChatData | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sheet, setSheet] = useState(q.get("opener") === "1");
  const [openers, setOpeners] = useState<string[] | null>(null);
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  const { busy, error, run, setError } = useAction();

  useEffect(() => {
    api().chat(id).then((x) => { setC(x); api().markRead(id).then(reload).catch(() => {}); }).catch((e) => setGone(e instanceof Error ? e.message : "Chat not available."));
    return api().onMessages(id, (m) => { setC((x) => x && ({ ...x, messages: [...x.messages, m] })); api().markRead(id).catch(() => {}); });
  }, [id, reload]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [c?.messages.length]);

  const city = home?.city;
  const golden = useMemo(() => city ? goldenHours(city.lat, city.lng, city.timezone, new Date(), 2)[0] : null, [city]);
  const now = Date.now();
  const add = (m: Msg) => setC((x) => x && ({ ...x, messages: [...x.messages, m] }));

  const send = () => run(async () => {
    const body = text.trim(); if (!body) return;
    const m = await api().sendMessage(id, body); setText(""); add(m);
  });
  const getOpeners = () => run(async () => { setOpeners(await api().openers(id)); await reload(); });
  const record = async () => {
    if (rec) { rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream); const parts: Blob[] = [];
      r.ondataavailable = (e) => parts.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop()); setRec(null);
        const blob = new Blob(parts, { type: r.mimeType || "audio/webm" });
        if (blob.size > 0) run(async () => add(await api().sendVoice(id, blob)));
      };
      r.start(); setRec(r);
      setTimeout(() => { if (r.state === "recording") r.stop(); }, 60000);   // one minute at most
    } catch { setError("Allow the microphone to send a voice note."); }
  };

  if (gone) return <div className="app-body"><div className="empty card"><strong>{gone}</strong><Link className="btn" href="/matches">Back to Chats</Link></div></div>;
  if (!c) return <div className="app-body"><div className="skel" style={{ height: 400 }} /></div>;
  const lastMineSeen = [...c.messages].reverse().find((m) => m.mine && m.read_at);

  return (
    <div className="app-body flush" style={{ paddingBottom: 0, minHeight: "calc(100dvh - 26px)" }}>
      <header className="row" style={{ gap: 10, padding: "16px 16px 12px", borderBottom: "1px solid #ECE6FA", background: "#fff", position: "sticky", top: 0, zIndex: 5 }}>
        <button type="button" aria-label="Back" className="iconbtn" style={{ border: 0, width: 40, height: 40 }} onClick={() => router.push("/matches")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
        <Link href={`/profile/${c.other.id}`} className="row" style={{ gap: 10, flex: 1, minWidth: 0, color: "var(--ink)", textDecoration: "none" }}>
          <Avatar name={c.other.first_name} photo={c.other.photo} size={40} />
          <span className="stack" style={{ gap: 0 }}><strong style={{ fontSize: 15 }}>{c.other.first_name} <SampleTag on={c.other.is_sample} /></strong>
            <span style={{ fontSize: 12, color: "#1F5E49" }}>{c.jodi_score != null ? `${c.jodi_score}% match` : "Matched"}</span></span>
        </Link>
        <Link href={`/safety/report?user=${c.other.id}&match=${c.match_id}`} aria-label="More options" className="tip tip-r" data-tip="Unmatch, block or report"
          style={{ width: 40, height: 40, borderRadius: 999, background: "#F3EEFF", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg></Link>
      </header>

      {golden && city && (
        <Link href={`/golden/${c.match_id}`} className="row" style={{ gap: 10, margin: "12px 16px 0", padding: "10px 14px", borderRadius: 14, background: "var(--saffron-soft)", color: "var(--ink)", textDecoration: "none", fontSize: 13 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B5590A" strokeWidth="2" aria-hidden="true" style={{ flex: "none" }}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          {golden.start.getTime() <= now
            ? <span><strong>Golden Hour now</strong> until {clock(golden.end, city.timezone)}. The stars said now.</span>
            : <span><strong>Next Golden Hour:</strong> {golden.day.toLowerCase() === "tonight" ? "today" : golden.day} at {clock(golden.start, city.timezone)}</span>}
        </Link>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px", justifyContent: "flex-end" }} aria-live="polite">
        {c.messages.length === 0 && <div className="empty" style={{ padding: 12 }}><strong>Say hi to {c.other.first_name}</strong><span className="sub">A question about their prompts works better than &quot;hey&quot;.</span></div>}
        {c.messages.map((m, i) => (
          <div key={m.id} style={{ display: "contents" }}>
            {(i === 0 || day(c.messages[i - 1].created_at) !== day(m.created_at)) &&
              <span style={{ alignSelf: "center", fontSize: 11, color: "var(--muted)", padding: "4px 10px", borderRadius: 999, background: "#F3EEFF" }}>{day(m.created_at)}</span>}
            <div style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "75%", padding: "10px 14px", fontSize: 14, lineHeight: 1.4,
              borderRadius: m.mine ? "18px 18px 6px 18px" : "18px 18px 18px 6px", background: m.mine ? "var(--saffron)" : "#fff", border: m.mine ? 0 : "1px solid var(--line)", opacity: m.held ? 0.6 : 1 }}>
              {m.kind === "voice" ? (m.media_url ? <audio controls src={m.media_url} style={{ height: 32, maxWidth: 220 }} aria-label="Voice note" /> : "Voice note") : m.body}
            </div>
            {m.held && <span style={{ alignSelf: "flex-end", fontSize: 11, color: "var(--red)" }}>Not delivered: no numbers or links in the first few messages, for everyone&apos;s safety.</span>}
          </div>
        ))}
        {lastMineSeen && c.messages.at(-1)?.mine && <span style={{ alignSelf: "flex-end", fontSize: 11, color: "var(--muted)" }}>Seen {new Date(lastMineSeen.read_at!).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>}
        <div ref={end} style={{ scrollMarginBottom: 240 }} />
      </div>

      <div style={{ position: "sticky", bottom: "calc(76px + env(safe-area-inset-bottom))", background: "var(--bg)", zIndex: 4 }}>
        <div className="row" style={{ gap: 8, padding: "0 16px 10px", overflowX: "auto", scrollbarWidth: "none" }}>
          {[[`/guru/${c.match_id}`, "Ask Guru Ji", "#E4F4EE", "#1F5E49"], ["/universe", "Our Universe", "#EDE6FF", "#3D3560"], ["/story", "Our Story", "#FFF0F4", "#A3164C"],
            [`/golden/${c.match_id}`, "Golden Hours", "#FFF3D6", "#8A4300"], [`/share-date?match=${c.match_id}`, "Share my date", "#fff", "var(--ink)"]].map(([href, label, bg, fg]) => (
            <Link key={label} href={href} style={{ flex: "none", padding: "8px 12px", borderRadius: 999, background: bg, border: bg === "#fff" ? "1px solid var(--line)" : 0, color: fg, fontSize: 12, fontWeight: 700, textDecoration: "none" }}>{label}</Link>
          ))}
        </div>
        <ErrorNote error={error} />
        {c.open ? (
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="row" style={{ gap: 8, padding: "10px 12px", background: "#fff", borderTop: "1px solid #ECE6FA" }}>
            <button type="button" onClick={() => setSheet(true)} aria-label={`Cupid suggestions, ${price(prices, "cupid_opener", 15)} credits`}
              style={{ height: 44, padding: "0 12px", flex: "none", borderRadius: 999, background: "var(--rose-soft)", border: "1px solid #FFC6D4", color: "var(--rose-ink)", font: "700 12px var(--sans)" }}>Cupid</button>
            <label htmlFor="msg" className="sr">Message</label>
            <input id="msg" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder={rec ? "Recording… tap stop to send" : "Type a message"} autoComplete="off"
              style={{ flex: 1, minWidth: 0, height: 44, borderRadius: 999, border: "1px solid var(--line)", background: "var(--bg)", padding: "0 16px", font: "500 14px var(--sans)", color: "var(--ink)" }} />
            {text.trim() ? (
              <button type="submit" disabled={busy} aria-label="Send" className="tip tip-r tip-up" data-tip="Send"
                style={{ width: 44, height: 44, flex: "none", borderRadius: 999, background: "var(--saffron)", border: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E1838" strokeWidth="2" aria-hidden="true"><path d="M4 12l16-8-6 16-2-6z" /></svg></button>
            ) : (
              <button type="button" onClick={record} aria-label={rec ? "Stop and send voice note" : "Record voice note"} className="tip tip-r tip-up" data-tip={rec ? "Stop and send" : "Record voice note"}
                style={{ width: 44, height: 44, flex: "none", borderRadius: 999, background: rec ? "var(--rose)" : "var(--saffron)", border: 0, color: rec ? "#fff" : "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {rec ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                     : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>}</button>
            )}
          </form>
        ) : <div className="note" style={{ margin: "0 16px 10px" }}>This chat has ended. You can still read it.</div>}
      </div>

      {sheet && (
        <div role="dialog" aria-modal="true" aria-label="Cupid openers" onClick={() => setSheet(false)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(30,24,56,.4)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "#fff", borderRadius: "24px 24px 0 0", padding: "20px 20px calc(24px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 12 }}>
            <strong className="serif" style={{ fontSize: 20 }}>Cupid openers</strong>
            {openers ? <>
              <span className="sub">Tap one to put it in your message box. Edit it so it sounds like you.</span>
              {openers.map((o) => <button key={o} type="button" className="rcard" onClick={() => { setText(o); setSheet(false); }} style={{ fontSize: 14, lineHeight: 1.4 }}>{o}</button>)}
            </> : <>
              <span className="sub">Three first messages written from {c.other.first_name}&apos;s prompts. If they can&apos;t be written, your credits come back.</span>
              <button type="button" className="btn" onClick={getOpeners} disabled={busy}>{busy ? "Writing…" : `Get 3 openers · ${price(prices, "cupid_opener", 15)} credits`}</button>
            </>}
            <ErrorNote error={error} />
            <button type="button" className="btn text" onClick={() => setSheet(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatPage() { return <Suspense><Chat /></Suspense>; }
