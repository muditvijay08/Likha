"use client";
// C6 Plan a date (Connect > Meet): invite to a public place, they say yes or no, share your plan, a check-in once it starts,
// and a private "how did it go?". A second date shows only when both say yes. Nobody sees the other's answer.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BackButton, ErrorNote, useAction } from "@/components/ui";
import { useApp } from "@/components/app";
import { api, type DatePlan, type MatchRow } from "@/lib/api";

const IDEAS = ["Chai and a walk", "Coffee", "Lunch", "Dessert", "A museum", "A garden walk"];
const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const AGAIN: [DatePlan["my_reflection"] & string, string][] = [["yes", "Yes"], ["maybe", "Maybe"], ["no", "No"]];

export default function PlanDate() {
  const { match } = useParams<{ match: string }>();
  const router = useRouter();
  const { toast } = useApp();
  const [m, setM] = useState<MatchRow | null>(null);
  const [list, setList] = useState<DatePlan[] | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [idea, setIdea] = useState(IDEAS[0]);
  const [place, setPlace] = useState("");
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(17, 0, 0, 0);
  const [at, setAt] = useState(local(tomorrow));
  const [note, setNote] = useState("");
  const [isPublic, setIsPublic] = useState(false);             // starts unticked: the member confirms it themselves
  const [reflect, setReflect] = useState<Record<string, string>>({});
  const { busy, error, run } = useAction();

  const load = useCallback(async () => setList(await api().matchDates(match)), [match]);
  useEffect(() => {
    api().matches().then((ms) => setM(ms.find((x) => x.match_id === match) ?? null)).catch(() => {});
    load().catch((e) => setGone(e instanceof Error ? e.message : "Match not found."));
  }, [match, load]);
  // a just-sent invitation may be answered in a moment: look again shortly
  useEffect(() => { if (!list?.some((d) => d.mine && d.status === "proposed")) return; const t = setTimeout(() => load().catch(() => {}), 1500); return () => clearTimeout(t); }, [list, load]);

  if (gone) return <div className="app-body pad"><div className="empty card"><strong>{gone}</strong><Link className="btn" href="/matches">Back to Connect</Link></div></div>;
  if (!list) return <div className="app-body pad"><div className="skel" style={{ height: 380 }} /></div>;
  const name = m?.first_name ?? "your match";
  const waiting = list.filter((d) => d.status === "proposed").length;
  const open = list.filter((d) => ["proposed", "upcoming", "now", "past"].includes(d.phase));
  const closed = list.filter((d) => d.phase === "declined" || d.phase === "cancelled");

  const send = () => run(async () => {
    await api().dateInvite(match, { idea, place, starts_at: new Date(at).toISOString(), public_place: isPublic, note: note || undefined });
    setPlace(""); setNote(""); setIsPublic(false); await load(); toast(`Invitation sent to ${name}`);
  });

  return (
    <div className="app-body pad" style={{ gap: 16 }}>
      <div className="titlebar"><BackButton href={`/chat/${match}`} /><h1>Plan a date</h1></div>
      <p className="sub" style={{ margin: 0 }}>With {name} · First dates are at a public place. Tell someone you trust where you&apos;ll be.</p>

      {open.map((d) => (
        <section key={d.id} className="card stack" style={{ gap: 10, borderRadius: 14 }} aria-label={`Date: ${d.idea}`}>
          <span className="row" style={{ justifyContent: "space-between", gap: 8 }}>
            <strong style={{ fontSize: 16 }}>{d.idea}</strong>
            <span className="badge-soft">{d.phase === "proposed" ? (d.mine ? "Waiting" : "Invitation") : d.phase === "upcoming" ? "Confirmed" : d.phase === "now" ? "Today" : "Done"}</span>
          </span>
          <span className="small">{d.place} · {when(d.starts_at)}</span>
          {d.note && <span style={{ fontSize: 14 }}>&ldquo;{d.note}&rdquo;</span>}

          {d.phase === "proposed" && d.mine && <>
            <span className="small">Waiting for {name} to say yes or no.</span>
            <button type="button" className="btn sm outline" disabled={busy} onClick={() => run(async () => { await api().dateCancel(d.id); await load(); })}>Cancel invitation</button>
          </>}
          {d.phase === "proposed" && !d.mine && <div className="grid2">
            <button type="button" className="btn sm" disabled={busy} onClick={() => run(async () => { await api().dateAnswer(d.id, true); await load(); toast("You said yes"); })}>Yes, let&apos;s meet</button>
            <button type="button" className="btn sm outline" disabled={busy} onClick={() => run(async () => { await api().dateAnswer(d.id, false); await load(); })}>Can&apos;t make it</button>
          </div>}

          {d.phase === "upcoming" && <>
            <Link className="btn sm" href={`/share-date?match=${match}&place=${encodeURIComponent(d.place)}&at=${encodeURIComponent(d.starts_at)}`}>Share my plan with someone I trust</Link>
            <button type="button" className="btn sm outline" disabled={busy} onClick={() => run(async () => { await api().dateCancel(d.id); await load(); })}>Cancel date</button>
          </>}

          {d.phase === "now" && (d.my_checkin === true
            ? <span className="small">You told us you&apos;re okay. If anything changes, <Link href={`/sos?match=${match}`}>get help</Link>.</span>
            : <div className="stack" style={{ gap: 8 }}>
                <strong style={{ fontSize: 14 }}>All okay?</strong>
                <div className="grid2">
                  <button type="button" className="btn sm" disabled={busy} onClick={() => run(async () => { await api().dateCheckin(d.id, true); await load(); toast("Glad you're okay"); })}>I&apos;m okay</button>
                  <button type="button" className="btn sm outline" disabled={busy} onClick={() => run(async () => { await api().dateCheckin(d.id, false); router.push(`/sos?match=${match}`); })}>I need help</button>
                </div>
              </div>)}

          {d.phase === "past" && (d.my_reflection
            ? <span className="small">{d.both_again ? `You both want a second date. Plan the next one below.` : "Saved. Only you see your answer."}</span>
            : <div className="stack" style={{ gap: 8 }}>
                <strong style={{ fontSize: 14 }}>How did it go? Would you meet {name} again?</strong>
                <span className="small">Private. {name} never sees your answer. If you both say yes, we tell you both.</span>
                <label htmlFor={`note-${d.id}`} className="sr">A private note for yourself</label>
                <input id={`note-${d.id}`} className="input" maxLength={300} placeholder="A note for yourself (optional)" value={reflect[d.id] ?? ""}
                  onChange={(e) => setReflect((r) => ({ ...r, [d.id]: e.target.value }))} />
                <div className="chips fill">{AGAIN.map(([v, l]) => (
                  <button key={v} type="button" className="chip sm" disabled={busy} onClick={() => run(async () => {
                    const r = await api().dateReflect(d.id, v, reflect[d.id]); await load(); toast(r.both_again ? "You both want a second date!" : "Saved");
                  })}>{l}</button>))}</div>
              </div>)}
        </section>
      ))}

      <ErrorNote error={error} />
      <section className="stack" style={{ gap: 12 }} aria-label="New invitation">
        <div className="sec-title"><strong>{open.length ? "Plan another" : `Ask ${name} out`}</strong></div>
        {waiting >= 2 ? <div className="note"><span>Two invitations are waiting already. Give {name} time to answer.</span></div> : <>
          <div className="stack" style={{ gap: 6 }}><span className="label">What</span>
            <div className="chips">{IDEAS.map((x) => <button key={x} type="button" className="chip sm" aria-pressed={idea === x} onClick={() => setIdea(x)}>{x}</button>)}</div></div>
          <div className="field"><label htmlFor="d-place" className="label">Where (a café, restaurant or public place)</label>
            <input id="d-place" className="input" maxLength={80} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Tapri Central, C-Scheme" autoComplete="off" /></div>
          <div className="field"><label htmlFor="d-at" className="label">When</label>
            <input id="d-at" className="input" type="datetime-local" value={at} min={local(new Date(Date.now() + 2 * 3600e3))} onChange={(e) => setAt(e.target.value)} /></div>
          <div className="field"><label htmlFor="d-note" className="label">A line for {name} <span style={{ fontWeight: 400, color: "var(--muted)" }}>(opt.)</span></label>
            <input id="d-note" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Their masala chai is the best in town" /></div>
          <label className="consent-box" htmlFor="d-public">
            <input id="d-public" type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            <span>It&apos;s a public place with other people around. We&apos;ll each get there on our own.</span>
          </label>
          <button type="button" className="btn" disabled={busy || place.trim().length < 3 || !isPublic} onClick={send}>Send invitation</button>
          <span className="small" style={{ textAlign: "center" }}>No phone numbers or links in invitations. Keep chatting on Likha until you&apos;ve met.</span>
        </>}
      </section>

      {closed.length > 0 && <section className="stack" style={{ gap: 4 }} aria-label="Earlier">
        <div className="sec-title"><strong>Earlier</strong></div>
        {closed.map((d) => <span key={d.id} className="small">{d.idea} at {d.place}, {when(d.starts_at)}: {d.phase === "declined" ? (d.mine ? `${name} couldn't make it` : "you couldn't make it") : "cancelled"}</span>)}
      </section>}
    </div>
  );
}
