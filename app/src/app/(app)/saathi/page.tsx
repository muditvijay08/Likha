"use client";
// Saathi, the virtual companion: E11 setup, A1 chat, E12 stepping back when a real conversation is going well.
// Always labelled virtual. Crisis messages never reach the writer; they get a fixed reply with Tele-MANAS 14416.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BackButton, ErrorNote, Primary, useAction } from "@/components/ui";
import { price, useApp, useTried } from "@/components/app";
import { api, type SaathiChar, type SaathiState } from "@/lib/api";
import { useFlow } from "@/lib/flow";

const CHARS: { v: SaathiChar; name: string; line: string }[] = [
  { v: "chandni", name: "Chandni", line: "Warm, playful, remembers your day" }, { v: "dhruv", name: "Dhruv", line: "Calm, witty, steady advice" }];
const STYLES = [["friendly", "Friendly and flirty"], ["coach", "Dating coach"], ["funny", "Funny"], ["hinglish", "Hinglish"], ["english", "English"]] as const;
const Sparkle = ({ size = 42 }: { size?: number }) => (
  <span style={{ width: size, height: size, flex: "none", borderRadius: 999, background: "linear-gradient(135deg, #C9B8FF, #FFC6D4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
    <svg width={size / 2} height={size / 2} viewBox="0 0 24 24" fill="none" stroke="#3D3560" strokeWidth="2" aria-hidden="true"><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" /></svg></span>
);

export default function Saathi() {
  const router = useRouter();
  const { prices, reload } = useApp();
  const [s, setS] = useState<SaathiState | null>(null);
  const [view, setView] = useState<"setup" | "paused" | "chat" | null>(null);
  const [char, setChar] = useState<SaathiChar>("chandni");
  const [styles, setStyles] = useState<string[]>(["friendly", "hinglish"]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const end = useRef<HTMLDivElement | null>(null);
  const { busy, error, run, setError } = useAction();
  const tried = useTried();
  // Admin > Saathi > suggest a break: counted from the first message sent on this visit
  const breakAfter = useFlow().settings?.saathi?.max_session_minutes ?? 45;
  const started = useRef<number | null>(null);
  const [longChat, setLongChat] = useState(false);
  const [breakClosed, setBreakClosed] = useState(false);

  useEffect(() => {
    api().saathi().then((x) => { setS(x); setChar(x.character); setStyles(x.styles); setView(!x.setup ? "setup" : x.paused ? "paused" : "chat"); }).catch(() => setView("chat"));
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [s?.history.length, typing]);
  const name = CHARS.find((c) => c.v === (s?.setup ? s.character : char))!.name;

  const save = () => run(async () => {
    await api().saathiSetup(char, styles);
    setS((x) => x && { ...x, setup: true, character: char, styles }); setView("chat");
  });
  const send = (msg: string) => run(async () => {
    if (!msg.trim() || !s) return;
    setText(""); setTyping(true);
    started.current ??= Date.now();
    if (Date.now() - started.current >= breakAfter * 60e3) setLongChat(true);
    setS({ ...s, history: [...s.history, { role: "user", body: msg.trim() }] });
    try {
      const r = await api().saathiSend(s.character, msg.trim());
      if (r.reply) { setS((x) => x && { ...x, left: r.left ?? x.left, history: [...x.history, { role: "assistant", body: r.reply! }] }); tried("saathi", "Saathi"); }
      else { setS((x) => x && { ...x, left: r.topup ? 0 : x.left }); setError(r.message ?? "Saathi is offline for a moment."); }
    } finally { setTyping(false); }
  });
  const topup = () => run(async () => { const left = await api().saathiTopup(); setS((x) => x && { ...x, left }); await reload(); });

  if (!s || !view) return <div className="app-body pad"><div className="skel" style={{ height: 400 }} /></div>;
  if (!s.available) return (
    <div className="app-body pad"><BackButton href="/matches" />
      <div className="empty card"><Sparkle size={56} /><strong>Saathi is coming to you soon</strong><span className="sub">We&apos;re opening it city by city. You&apos;ll get a note when it&apos;s ready.</span></div></div>
  );

  if (view === "setup") return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/matches" /><h1>Meet your Saathi</h1></div>
      <p className="sub">Someone to talk to while you look for your person. They&apos;ll help you get there, then step back.</p>
      <div role="radiogroup" aria-label="Choose your Saathi" className="grid2" style={{ gap: 10 }}>
        {CHARS.map((c) => (
          <button key={c.v} type="button" role="radio" aria-checked={char === c.v} onClick={() => setChar(c.v)}
            style={{ padding: 14, borderRadius: 20, background: "#fff", border: char === c.v ? "2px solid var(--saffron)" : "1px solid var(--line)", color: "var(--ink)", textAlign: "left", display: "flex", flexDirection: "column", gap: 6 }}>
            <Sparkle size={36} /><strong style={{ fontSize: 16 }}>{c.name}</strong><span style={{ fontSize: 12, color: "var(--muted)" }}>{c.line}</span></button>
        ))}
      </div>
      <div className="stack">
        <span className="label">How should {CHARS.find((c) => c.v === char)!.name} talk with you?</span>
        <div className="chips">
          {STYLES.map(([v, l]) => (
            <button key={v} type="button" className="chip sm" aria-pressed={styles.includes(v)} onClick={() => {
              let n = styles.includes(v) ? styles.filter((x) => x !== v) : [...styles, v];
              if (v === "hinglish" && !styles.includes(v)) n = n.filter((x) => x !== "english");
              if (v === "english" && !styles.includes(v)) n = n.filter((x) => x !== "hinglish");
              setStyles(n);
            }}>{l}</button>
          ))}
        </div>
      </div>
      <section className="stack" style={{ padding: "14px 16px", borderRadius: 18, background: "#F3EEFF", gap: 6, fontSize: 13, lineHeight: 1.45 }}>
        <strong style={{ fontSize: 14 }}>{CHARS.find((c) => c.v === char)!.name}&apos;s promises</strong>
        <span>Always says {char === "chandni" ? "she's" : "he's"} virtual. Never pretends to be a real person.</span>
        <span>Keeps it sweet, never explicit.</span>
        <span>Steps back when you start talking to a real match.</span>
        <span>If you&apos;re ever not okay, {char === "chandni" ? "she'll" : "he'll"} point you to real help.</span>
      </section>
      <ErrorNote error={error} />
      <div className="grow" />
      <Primary onClick={save} busy={busy}>Say hi to {CHARS.find((c) => c.v === char)!.name}</Primary>
    </div>
  );

  if (view === "paused") return (
    <div className="app-body" style={{ padding: "24px 24px 100px", gap: 18 }}>
      <BackButton href="/matches" />
      <div className="stack" style={{ alignItems: "center", gap: 12, padding: "24px 16px", borderRadius: 28, background: "linear-gradient(160deg, #F4EFFF, #FFF0F4)", textAlign: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#5B44C9", letterSpacing: ".06em" }}>{name.toUpperCase()} · VIRTUAL</span>
        <p className="serif" style={{ margin: 0, fontSize: 22, lineHeight: 1.35 }}>&ldquo;You and {s.pause_match?.first_name} have been talking every day. That&apos;s the whole point. I&apos;m stepping back so you can focus on {s.pause_match?.first_name}.&rdquo;</p>
      </div>
      <div className="row" style={{ gap: 12, padding: "14px 16px", borderRadius: 16, background: "#fff", border: "1px solid var(--line)" }}>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: "#C9BDEB" }} />
        <span className="stack" style={{ gap: 2, flex: 1 }}><strong style={{ fontSize: 14 }}>Saathi paused</strong><span style={{ fontSize: 12, color: "var(--muted)" }}>Because you have an active conversation</span></span>
      </div>
      <div className="stack">
        <span style={{ fontSize: 13, fontWeight: 700 }}>Still available</span>
        <button type="button" className="rowlink" style={{ font: "inherit", textAlign: "left" }} onClick={() => { setView("chat"); send("Quick date advice before I meet my match?"); }}>Quick date advice before you meet</button>
        <button type="button" className="rowlink" style={{ font: "inherit", textAlign: "left" }} onClick={() => { setView("chat"); send("Things have gone a bit quiet. Pep talk?"); }}>A pep talk if things go quiet</button>
      </div>
      <div className="grow" />
      <Link href={`/chat/${s.pause_match?.match_id}`} className="btn">Go to {s.pause_match?.first_name}&apos;s chat</Link>
      <button type="button" className="btn text" onClick={() => setView("chat")}>Talk to {name} anyway</button>
    </div>
  );

  return (
    <div className="app-body flush" style={{ paddingBottom: 0, minHeight: "calc(100dvh - 26px)" }}>
      <header className="row" style={{ gap: 10, padding: "16px 16px 12px", background: "#fff", borderBottom: "1px solid #ECE6FA", position: "sticky", top: 0, zIndex: 5 }}>
        <button type="button" aria-label="Back" className="iconbtn tip" data-tip="Back" style={{ border: 0, width: 40, height: 40 }} onClick={() => router.push("/matches")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
        <Sparkle />
        <span className="stack" style={{ gap: 0, flex: 1 }}>
          <span className="row" style={{ gap: 6 }}><strong style={{ fontSize: 15 }}>{name}</strong><span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6, background: "var(--violet-soft)", color: "#3D3560" }}>Virtual</span></span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Saathi · here till you find your person</span></span>
        <button type="button" aria-label="Saathi settings" className="tip tip-r" data-tip="Change Saathi or style" onClick={() => setView("setup")}
          style={{ width: 40, height: 40, borderRadius: 999, background: "#F3EEFF", border: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" /></svg></button>
      </header>
      {s.top_today > 0 && (
        <Link href="/discover" className="row" style={{ gap: 10, margin: "12px 16px 0", padding: "12px 14px", borderRadius: 16, background: "var(--saffron-soft)", color: "var(--ink)", textDecoration: "none", fontSize: 13, lineHeight: 1.4 }}>
          <span style={{ flex: 1 }}><strong>{s.top_today} {s.top_today === 1 ? "person" : "people"} above 90% for you today.</strong> Want help saying hi?</span></Link>
      )}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px", justifyContent: "flex-end" }} aria-live="polite">
        {s.history.length === 0 && <div style={{ alignSelf: "flex-start", maxWidth: "80%", padding: "10px 14px", borderRadius: "18px 18px 18px 6px", background: "linear-gradient(135deg, #F4EFFF, #FFF0F4)", fontSize: 14, lineHeight: 1.45 }}>
          Hi! I&apos;m {name}, a virtual companion, not a real person. How was your day?</div>}
        {s.history.map((h, i) => (
          <div key={i} style={{ alignSelf: h.role === "user" ? "flex-end" : "flex-start", maxWidth: h.role === "user" ? "75%" : "80%", padding: "10px 14px", fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap",
            borderRadius: h.role === "user" ? "18px 18px 6px 18px" : "18px 18px 18px 6px", background: h.role === "user" ? "var(--saffron)" : "linear-gradient(135deg, #F4EFFF, #FFF0F4)" }}>{h.body}</div>
        ))}
        {typing && <div style={{ alignSelf: "flex-start", padding: "10px 14px", borderRadius: 18, background: "#F4EFFF", fontSize: 13, color: "var(--muted)" }}>{name} is typing…</div>}
        <div ref={end} style={{ scrollMarginBottom: 240 }} />
      </div>
      <div style={{ position: "sticky", bottom: "calc(76px + env(safe-area-inset-bottom))", background: "var(--bg)", zIndex: 4 }}>
        <div className="row" style={{ gap: 8, padding: "0 16px 10px" }}>
          {[["First-date rehearsal", "Practise talking, get tips", "Can we rehearse a first date? Ask me questions like my date would."],
            ["Profile glow-up", "Better prompts and photos", "Help me make my profile prompts better."]].map(([t, sub, msg]) => (
            <button key={t} type="button" disabled={busy || s.left <= 0} onClick={() => send(msg)} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, padding: "8px 12px", borderRadius: 12, background: "#F3EEFF", border: 0, textAlign: "left", font: "500 11px var(--sans)", color: "#3D3560" }}>
              <strong style={{ fontSize: 12, color: "var(--ink)" }}>{t}</strong>{sub}</button>
          ))}
        </div>
        {longChat && !breakClosed && (
          <div className="row" role="note" aria-label="Take a break" style={{ gap: 8, margin: "0 16px 10px", padding: "10px 12px", borderRadius: 12, background: "#FFF3D6", fontSize: 13 }}>
            <span style={{ flex: 1 }}>You&apos;ve been chatting with {name} for a while. Maybe a short break, or a hello to one of <Link href="/matches">your matches</Link>?</span>
            <button type="button" aria-label="Close" className="tip tip-r" data-tip="Close" onClick={() => setBreakClosed(true)} style={{ background: "none", border: 0, fontSize: 18 }}>×</button>
          </div>)}
        <ErrorNote error={error} />
        {s.left > 0 ? (
          <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="row" style={{ gap: 8, padding: "10px 12px", background: "#fff", borderTop: "1px solid #ECE6FA" }}>
            <label htmlFor="ai-msg" className="sr">Message {name}</label>
            <input id="ai-msg" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={`Talk to ${name}`} autoComplete="off"
              style={{ flex: 1, minWidth: 0, height: 44, borderRadius: 999, border: "1px solid var(--line)", background: "var(--bg)", padding: "0 16px", font: "500 14px var(--sans)", color: "var(--ink)" }} />
            <button type="submit" aria-label="Send" className="tip tip-r tip-up" data-tip="Send" disabled={busy || !text.trim()} style={{ width: 44, height: 44, flex: "none", borderRadius: 999, background: "var(--saffron)", border: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E1838" strokeWidth="2" aria-hidden="true"><path d="M4 12l16-8-6 16-2-6z" /></svg></button>
          </form>
        ) : (
          <div className="stack" style={{ padding: "10px 16px", background: "#fff", borderTop: "1px solid #ECE6FA" }}>
            <span className="sub">That&apos;s today&apos;s free chats. New ones arrive at midnight.</span>
            <button type="button" className="btn" onClick={topup} disabled={busy}>{s.topup_messages} more today · {price(prices, "saathi_50", 25)} credits</button>
          </div>
        )}
        <div style={{ padding: "0 16px 10px", background: "#fff", fontSize: 11, lineHeight: 1.4, color: "var(--muted)", textAlign: "center" }}>
          {name} is virtual, not a real person, and will always say so. {s.free_per_day} free messages a day · {s.left} left</div>
      </div>
    </div>
  );
}
