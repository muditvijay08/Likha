"use client";
// E1 Guru Ji: one shared astrology chat for a matched couple. A few free questions, then packs of 20 for both of you.
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ErrorNote, useAction } from "@/components/ui";
import { price, useApp } from "@/components/app";
import { api, type GuruState } from "@/lib/api";

const IDEAS = ["When should we meet each other's parents?", "How do we argue better?", "Which month suits our first trip?", "What do our Moon signs need from each other?"];
const G = { bg: "#F2FAF6", line: "#D6EDE3" };

export default function Guru() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { prices, reload } = useApp();
  const [g, setG] = useState<GuruState | null>(null);
  const [text, setText] = useState("");
  const [asking, setAsking] = useState<string | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  const { busy, error, run } = useAction();
  useEffect(() => { api().guru(id).then(setG).catch(() => router.replace("/matches")); }, [id, router]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [g?.messages.length, asking]);

  const ask = (q: string) => run(async () => {
    if (!q.trim()) return;
    setAsking(q.trim()); setText("");
    try { setG(await api().askGuru(id, q.trim())); } finally { setAsking(null); }
  });
  const buy = () => run(async () => { setG(await api().buyGuru(id)); await reload(); });

  return (
    <div className="app-body flush" style={{ background: G.bg, paddingBottom: 0, minHeight: "calc(100dvh - 26px)" }}>
      <header className="row" style={{ gap: 10, padding: 16, background: "#fff", borderBottom: `1px solid ${G.line}`, position: "sticky", top: 0, zIndex: 5 }}>
        <button type="button" aria-label="Back" className="iconbtn tip" data-tip="Back to chat" style={{ border: 0, width: 40, height: 40 }} onClick={() => router.push(`/chat/${id}`)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
        <span className="stack" style={{ gap: 0, flex: 1 }}><strong style={{ fontSize: 15 }}>Guru Ji</strong>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{g ? `About you and ${g.other_name} · ${g.left} of ${g.allowed} questions left` : "…"}</span></span>
      </header>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, padding: 16, justifyContent: "flex-end" }} aria-live="polite">
        {g && g.messages.length === 0 && !asking && (
          <div className="empty" style={{ padding: 8 }}><strong>Ask Guru Ji about you two</strong>
            <span className="sub">Answers use only your two kundlis and your Guna match. {g.other_name} sees this chat too.</span></div>
        )}
        {g?.messages.map((m) => (
          <div key={m.id} style={{ alignSelf: m.from === "guru" ? "flex-start" : "flex-end", maxWidth: m.from === "guru" ? "86%" : "78%", padding: m.from === "guru" ? "12px 14px" : "10px 14px",
            borderRadius: m.from === "guru" ? "18px 18px 18px 6px" : "18px 18px 6px 18px", background: m.from === "guru" ? "#fff" : m.from === "me" ? "var(--saffron)" : "#FFE7B8",
            border: m.from === "guru" ? `1px solid ${G.line}` : 0, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
            {m.from === "them" && <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--saffron-ink)" }}>{g.other_name}</span>}{m.body}
          </div>
        ))}
        {asking && <>
          <div style={{ alignSelf: "flex-end", maxWidth: "78%", padding: "10px 14px", borderRadius: "18px 18px 6px 18px", background: "var(--saffron)", fontSize: 14 }}>{asking}</div>
          <div className="row" style={{ alignSelf: "flex-start", gap: 8, padding: "10px 14px", borderRadius: 18, background: "#fff", border: `1px solid ${G.line}`, fontSize: 13, color: "var(--muted)" }}>
            <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} aria-hidden="true" />Guru Ji is reading your charts…</div>
        </>}
        {g && g.left > 0 && !asking && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {IDEAS.map((q) => <button key={q} type="button" onClick={() => ask(q)} disabled={busy}
              style={{ padding: "8px 12px", borderRadius: 999, background: "#fff", border: `1px solid ${G.line}`, font: "700 12px var(--sans)", color: "var(--ink)" }}>{q}</button>)}
          </div>
        )}
        <div ref={end} style={{ scrollMarginBottom: 240 }} />
      </div>

      <div style={{ position: "sticky", bottom: "calc(76px + env(safe-area-inset-bottom))", background: "#fff", borderTop: `1px solid ${G.line}`, zIndex: 4 }}>
        <ErrorNote error={error} />
        {g && g.left <= 0 ? (
          <div className="stack" style={{ padding: "12px 16px", gap: 8 }}>
            <span className="sub">You two have used all your questions.</span>
            <button type="button" className="btn" onClick={buy} disabled={busy}>{busy ? "…" : `${g.pack_questions} more questions · ${price(prices, "guru_20", 29)} credits`}</button>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="row" style={{ padding: "10px 12px 8px", gap: 8 }}>
            <label htmlFor="guru-msg" className="sr">Ask Guru Ji</label>
            <input id="guru-msg" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="Ask about you two" autoComplete="off"
              style={{ flex: 1, minWidth: 0, height: 44, borderRadius: 999, border: `1px solid ${G.line}`, background: G.bg, padding: "0 16px", font: "500 14px var(--sans)", color: "var(--ink)" }} />
            <button type="submit" disabled={busy || !text.trim()} aria-label="Ask" className="tip tip-r tip-up" data-tip="Ask Guru Ji"
              style={{ width: 44, height: 44, flex: "none", borderRadius: 999, background: "var(--saffron)", border: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E1838" strokeWidth="2" aria-hidden="true"><path d="M4 12l16-8-6 16-2-6z" /></svg></button>
          </form>
        )}
        <div style={{ padding: "0 16px 10px", fontSize: 11, color: "var(--muted)", textAlign: "center" }}>Guidance, not a verdict. {g?.other_name ?? "Your match"} sees this chat too.</div>
      </div>
    </div>
  );
}
