"use client";
// L5 Help: quick answers by topic, talk to a person (ticket), and a formal grievance under India's IT Rules.
// Works before sign-in too (answers, email, Grievance Officer); tickets and grievances need an account.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { BackButton, ErrorNote, Primary, Screen, useAction } from "@/components/ui";
import { api, type Ticket } from "@/lib/api";
import { useFlow } from "@/lib/flow";

const TOPICS: { key: string; label: string; qa: [string, string][] }[] = [
  { key: "payments", label: "Payments and credits", qa: [
    ["My payment is stuck on \"Paisa raste mein hai\"", "Banks sometimes take a few minutes. Don't pay again: credits land on their own as soon as the bank confirms. If it's been over an hour, talk to a person below with the time of payment."],
    ["Do credits expire?", "Credits you buy never expire. Bonus and reward credits expire after 90 days; your wallet shows when."],
    ["A reading failed", "Your credits come back automatically, usually within a minute. Check Plans and history."],
    ["Refunds", "See the refund policy. Talk to a person below if something went wrong."]] },
  { key: "matches", label: "Matches and chat", qa: [
    ["Why can't I send my number in chat?", "For everyone's safety, numbers and links are held in the first few messages. Keep chatting on Likha a little longer."],
    ["How is the Jodi Score worked out?", "70% from the 36-point Guna match, 15% from Manglik compatibility, 15% from your Moon and Venus signs. Your birth details are never shown."],
    ["Someone disappeared from my chats", "They unmatched, paused or deleted their account. We don't say which."]] },
  { key: "verification", label: "Verification", qa: [
    ["My selfie is being checked", "A person reviews it, usually within 24 hours. You can browse meanwhile; likes unlock once you're verified."],
    ["I changed my name or main photo", "That sends your profile for a quick re-check. Your verified badge comes back once it's done."],
    ["My birth details are wrong", "They're locked to keep matches honest. You get one free correction: talk to a person below."]] },
];

function Help() {
  const q = useSearchParams();
  const { settings } = useFlow();
  const g = settings?.grievance_officer;
  const [signedIn, setSignedIn] = useState(false);
  const [topic, setTopic] = useState<string | null>(q.get("topic"));
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [talk, setTalk] = useState(false);
  const [msg, setMsg] = useState("");
  const [cat, setCat] = useState("Content or user complaint");
  const [detail, setDetail] = useState("");
  const [shot, setShot] = useState<File | null>(null);
  const [filed, setFiled] = useState<string | null>(null);
  const [reply, setReply] = useState<Record<string, string>>({});
  const file = useRef<HTMLInputElement | null>(null);
  const t1 = useAction(), t2 = useAction();
  useEffect(() => { api().signedIn().then((s) => { setSignedIn(s); if (s) api().tickets().then(setTickets).catch(() => {}); }).catch(() => {}); }, []);
  const sendTicket = () => t1.run(async () => {
    await api().openTicket(TOPICS.find((x) => x.key === topic)?.label ?? "Help", msg.trim());
    setMsg(""); setTalk(false); setTickets(await api().tickets());
  });
  const sendReply = (id: string) => t1.run(async () => { await api().replyTicket(id, reply[id]); setReply({ ...reply, [id]: "" }); setTickets(await api().tickets()); });
  const grieve = () => t2.run(async () => { const r = await api().fileGrievance(cat, detail.trim(), shot); setFiled(r.ticket_no); setDetail(""); setShot(null); });
  const T = TOPICS.find((x) => x.key === topic);

  return (
    <Screen style={{ gap: 14 }}>
      <div className="titlebar"><BackButton /><h1>Help</h1></div>
      <div style={{ padding: "12px 14px", borderRadius: 16, background: "#F3EEFF", fontSize: 14 }}>What can we help with? Pick a topic, or talk to a person.</div>
      <div className="chips">
        {TOPICS.map((x) => <button key={x.key} type="button" className="chip sm" aria-pressed={topic === x.key} onClick={() => setTopic(topic === x.key ? null : x.key)}>{x.label}</button>)}
        <Link href={signedIn ? "/safety/report" : "/start"} className="chip sm" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Safety concern</Link>
      </div>
      {T && <div className="listcard">{T.qa.map(([qq, a]) => <details key={qq} style={{ padding: "12px 16px", borderBottom: "1px solid var(--line-soft)" }}>
        <summary style={{ fontWeight: 600, cursor: "pointer" }}>{qq}</summary><p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.5, color: "#3D3560" }}>{a}</p></details>)}</div>}

      {signedIn ? <>
        {talk ? (
          <div className="card stack" style={{ gap: 10, borderRadius: 18 }}>
            <label htmlFor="h-msg" className="label">Tell us what happened</label>
            <textarea id="h-msg" className="input" maxLength={2000} value={msg} onChange={(e) => setMsg(e.target.value)} />
            <ErrorNote error={t1.error} />
            <Primary onClick={sendTicket} busy={t1.busy} disabled={!msg.trim()}>Send to our team</Primary>
            <span className="small">A person replies here, usually within a few hours (9 AM–9 PM IST).</span>
          </div>
        ) : <button type="button" className="btn ghost" onClick={() => setTalk(true)}>Talk to a person</button>}
        {tickets.length > 0 && <section className="stack" style={{ gap: 8 }} aria-label="Your conversations with us">
          <strong style={{ fontSize: 14 }}>Your conversations with us</strong>
          {tickets.map((tk) => <details key={tk.id} className="card" style={{ borderRadius: 16 }}>
            <summary style={{ fontWeight: 600, cursor: "pointer" }}>{tk.subject} <span className="small">· {tk.status.replace("_", " ")}</span></summary>
            <div className="stack" style={{ gap: 6, marginTop: 8 }}>
              {tk.messages.map((m, i) => <div key={i} style={{ alignSelf: m.from === "me" ? "flex-end" : "flex-start", maxWidth: "85%", padding: "8px 12px", borderRadius: 14, fontSize: 13,
                background: m.from === "me" ? "var(--saffron-soft)" : "#F3EEFF" }}>{m.body}</div>)}
              <div className="row"><input aria-label="Reply" className="input" value={reply[tk.id] ?? ""} onChange={(e) => setReply({ ...reply, [tk.id]: e.target.value })} placeholder="Reply" />
                <button type="button" className="btn" style={{ width: 80, height: 48 }} disabled={!reply[tk.id]?.trim() || t1.busy} onClick={() => sendReply(tk.id)}>Send</button></div>
            </div></details>)}
        </section>}
        <section id="grievance" aria-label="File a grievance" className="stack" style={{ gap: 10, padding: 16, borderRadius: 20, background: "#fff", border: "1px solid var(--line)" }}>
          <div className="stack" style={{ gap: 2 }}><strong>File a formal grievance</strong><span className="small">Under India&apos;s IT Rules. Reviewed by our Grievance Officer.</span></div>
          {filed ? <div className="note"><span>Grievance <strong>{filed}</strong> received. We acknowledge within {g?.ack_hours ?? 24} hours and resolve within {g?.resolve_days ?? 15} days.</span></div> : <>
            <div className="field"><label htmlFor="g-cat" className="label">Category</label>
              <select id="g-cat" className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
                {["Content or user complaint", "Impersonation or my photos used", "Privacy or my data", "Payments or refunds", "Account decision", "Something else"].map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label htmlFor="g-detail" className="label">What happened</label><textarea id="g-detail" className="input" maxLength={2000} rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} /></div>
            <input ref={file} type="file" accept="image/png,image/jpeg,application/pdf" hidden onChange={(e) => setShot(e.target.files?.[0] ?? null)} />
            <button type="button" className="linkbtn" onClick={() => file.current?.click()}>{shot ? `Attached: ${shot.name}` : "+ Attach screenshot"}</button>
            <ErrorNote error={t2.error} />
            <Primary onClick={grieve} busy={t2.busy} disabled={!detail.trim()}>Submit grievance</Primary>
          </>}
          <span className="small">Grievance Officer: {g?.name ?? "Mudit Dudhoria"}, {g?.email ?? "grievance@likha.in"}</span>
        </section>
      </> : (
        <div className="card stack" style={{ gap: 6, borderRadius: 18 }}>
          <strong>Write to us</strong>
          <a href="mailto:help@likha.in">help@likha.in</a>
          <span className="small">Grievance Officer: {g?.name ?? "Mudit Dudhoria"}, <a href={`mailto:${g?.email ?? "grievance@likha.in"}`}>{g?.email ?? "grievance@likha.in"}</a>. We acknowledge within {g?.ack_hours ?? 24} hours and resolve within {g?.resolve_days ?? 15} days.</span>
        </div>
      )}
      <div className="row small" style={{ gap: 12, flexWrap: "wrap" }}>
        <Link href="/legal/terms">Terms</Link><Link href="/legal/privacy">Privacy</Link><Link href="/legal/refunds">Refunds</Link><Link href="/legal/disclaimer">Astrology disclaimer</Link>
      </div>
    </Screen>
  );
}
export default function HelpPage() { return <Suspense><Help /></Suspense>; }
