"use client";
// I14 Support inbox. Drafts written by the support agent wait here; a person edits and sends them.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAction, useAdmin } from "@/components/shell";
import { Kpi, Page, Status, ago, label, rupees, useLoad } from "@/components/ui";
import { api } from "@/lib/api";

const SAVED: [string, string][] = [
  ["Credits added", "Sorry for the trouble! I've added the credits to your wallet. Ref: "],
  ["Birth time proof", "To change a birth time we need a photo of the birth certificate or hospital record. You can attach it here."],
  ["Refund on the way", "Your refund is on its way. Bank refunds take 5 to 7 working days to show up."],
];

function Thread({ id, onChange }: { id: string; onChange(): void }) {
  const { toast } = useAdmin();
  const { data: t, reload } = useLoad(() => api().ticket(id), [id]);
  const draft = t?.messages.find((m) => m.draft) ?? null;
  const [body, setBody] = useState("");
  useEffect(() => { setBody(draft?.body ?? ""); }, [draft?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const { busy, error, run } = useAction();
  if (!t) return <div className="skel" style={{ height: 300 }} />;
  const send = (status: "in_progress" | "waiting_user" | "resolved") => run(async () => {
    await api().replyTicket(t.id, body, status, draft && body.trim() ? draft.id : null); setBody(""); toast(status === "resolved" ? "Sent and solved" : "Sent"); reload(); onChange(); });
  return (
    <section className="card stack" style={{ gap: 12 }} aria-label="Ticket">
      <div className="row"><h2 className="grow">{t.subject}</h2><Status s={t.status} /><span className="pill off">{label(t.channel)}</span></div>
      {t.user && <span className="small"><Link href={`/users/${t.user_id}`}>{t.user.short_id} {t.user.name}</Link> · {t.user.city ?? ""} · {t.user.credits} credits · <Status s={t.user.status} /></span>}
      {t.recent_payments.length > 0 && <div className="small">Recent payments: {t.recent_payments.map((p) => `${rupees(p.amount_paise)} ${p.status}${p.status === "captured" && !p.credited ? " (not credited)" : ""}`).join(" · ")}
        {" "}· <Link href="/payments?filter=not_credited">Payments</Link></div>}
      <div className="stack" style={{ gap: 8 }}>{t.messages.map((m) => (
        <div key={m.id} className={`bubble ${m.draft ? "draft" : m.from === "user" ? "them" : "me"}`}>
          <span className="small">{m.draft ? "Draft from the support agent · not sent" : m.from === "user" ? "Member" : m.by ?? label(m.from)} · {ago(m.at)}</span><br />{m.body}</div>))}</div>
      <textarea className="input" aria-label="Reply" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply, or edit the draft above" />
      <div className="row" style={{ gap: 6 }}>{SAVED.map(([n, txt]) => <button key={n} type="button" className="btn ghost sm" onClick={() => setBody((b) => (b ? b + "\n\n" : "") + txt)}>{n}</button>)}</div>
      {error && <p className="err" role="alert">{error}</p>}
      <div className="row"><button type="button" className="btn" disabled={busy || !body.trim()} onClick={() => send("resolved")}>{draft && body === draft.body ? "Send draft and solve" : "Send and solve"}</button>
        <button type="button" className="btn ghost" disabled={busy || !body.trim()} onClick={() => send("waiting_user")}>Send, wait for member</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => send("resolved")}>Solve without reply</button></div>
      <span className="small">Never promise matches or outcomes. Money back goes through Payments.</span>
    </section>
  );
}

export default function Support() {
  const [tab, setTab] = useState<"open" | "closed">("open"); const [sel, setSel] = useState<string | null>(null);
  const { data, reload } = useLoad(() => api().tickets(tab), [tab]);
  return (
    <Page title="Support inbox" sub="In-app and WhatsApp messages to support. Drafts from the support agent never go out until a person sends them.">
      {data && <div className="kpis"><Kpi k="Open" v={data.kpis.open} s={`${data.kpis.new} new`} /><Kpi k="First reply" v={data.kpis.first_reply_min === null ? "–" : `${data.kpis.first_reply_min} min`} s="target under 1 h" />
        <Kpi k="Satisfaction" v={data.kpis.csat ?? "–"} s="last 7 days" /></div>}
      <div className="tabs" role="tablist"><button type="button" role="tab" aria-selected={tab === "open"} onClick={() => { setTab("open"); setSel(null); }}>Open</button>
        <button type="button" role="tab" aria-selected={tab === "closed"} onClick={() => { setTab("closed"); setSel(null); }}>Solved (30 days)</button></div>
      <div className="split">
        <div className="card flush"><table className="t"><tbody>{(data?.rows ?? []).length === 0 ? <tr><td className="sub">Inbox zero.</td></tr> : data!.rows.map((t) => (
          <tr key={t.id} className="click" aria-selected={sel === t.id} onClick={() => setSel(t.id)}>
            <td>{t.new ? <span className="pill info">New</span> : <Status s={t.status} />}{t.draft && <div><span className="pill warn">draft ready</span></div>}</td>
            <td><strong>{t.subject}</strong><div className="small">{t.user} · {label(t.channel)}</div>{t.last && <div className="small" style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.last}</div>}</td>
            <td className="small">{ago(t.at)}</td></tr>))}</tbody></table></div>
        {sel ? <Thread key={sel} id={sel} onChange={reload} /> : <div className="note">Pick a conversation.</div>}
      </div>
    </Page>
  );
}
