"use client";
// F2 Share my date: where, when, who you trust, and when we check in. The member sends the details from their own WhatsApp.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BackButton, ErrorNote, Primary, useAction } from "@/components/ui";
import { Avatar } from "@/components/app";
import { api, type MatchRow, type TrustedContact } from "@/lib/api";

const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function ShareDate() {
  const q = useSearchParams();
  const router = useRouter();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [matchId, setMatchId] = useState<string | null>(q.get("match"));
  const [contacts, setContacts] = useState<TrustedContact[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [place, setPlace] = useState("");
  const now = new Date(Math.ceil(Date.now() / 900000) * 900000);
  const [starts, setStarts] = useState(local(new Date(now.getTime() + 3600e3)));
  const [hours, setHours] = useState(2.5);
  const { busy, error, run } = useAction();
  useEffect(() => {
    api().matches().then(setMatches).catch(() => {});
    api().trustedContacts().then((c) => { setContacts(c); setPicked(c.slice(0, 1).map((x) => x.id)); }).catch(() => setContacts([]));
  }, []);
  const m = matches.find((x) => x.match_id === matchId);
  const startDate = new Date(starts), checkin = new Date(startDate.getTime() + hours * 3600e3);
  const t = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const share = () => run(async () => {
    const id = await api().shareDate(matchId, place, startDate, checkin, picked);
    const chosen = (contacts ?? []).filter((c) => picked.includes(c.id));
    const text = `I'm meeting ${m?.first_name ?? "someone"} from Likha at ${place}, ${startDate.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}. ` +
      `If I don't check in by ${t(checkin)}, Likha will text you. Please call me then.`;
    const first = chosen[0];
    if (first) window.open(`https://wa.me/${first.phone.replace(/\D/g, "").replace(/^0/, "").replace(/^(?!91)(\d{10})$/, "91$1")}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    router.push(`/checkin/${id}`);
  });

  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton /><h1>Share my date</h1></div>
      <p className="sub">Someone you trust knows where you are. We check in after.</p>
      <section className="row" style={{ gap: 12, padding: 14, borderRadius: 20, background: "#fff", border: "1px solid var(--line)", alignItems: "flex-start" }}>
        {m ? <Avatar name={m.first_name} photo={m.photo} size={44} /> : <span className="avatar" style={{ width: 44, height: 44, background: "#F3EEFF", color: "#5B44C9", fontSize: 18 }}>?</span>}
        <div className="stack" style={{ flex: 1, gap: 8 }}>
          <label className="label" htmlFor="sd-who">Meeting</label>
          <select id="sd-who" className="input" value={matchId ?? ""} onChange={(e) => setMatchId(e.target.value || null)}>
            <option value="">Someone not on Likha</option>{matches.map((x) => <option key={x.match_id} value={x.match_id}>{x.first_name}</option>)}</select>
          <label className="label" htmlFor="sd-place">Where</label>
          <input id="sd-place" className="input" maxLength={120} placeholder="Neel Rooftop Cafe, C-Scheme" value={place} onChange={(e) => setPlace(e.target.value)} />
          <label className="label" htmlFor="sd-when">When</label>
          <input id="sd-when" className="input" type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
        </div>
      </section>
      <div className="stack"><span className="label">Send to</span>
        {contacts === null ? <div className="skel" style={{ height: 60 }} /> : contacts.length === 0 ?
          <Link href="/trusted?back=/share-date" className="rowlink"><span className="t"><strong>Add a trusted contact</strong><span>A sister, a friend: someone who'd pick up</span></span></Link> :
          contacts.map((c) => (
            <label key={c.id} htmlFor={`sd-${c.id}`} className="rowlink" style={{ cursor: "pointer" }}>
              <span className="avatar" style={{ width: 40, height: 40, background: "var(--green-soft)", color: "var(--green)", fontSize: 18 }}>{c.name[0]}</span>
              <span className="t"><strong>{c.name}{c.relation ? ` (${c.relation})` : ""}</strong><span>via WhatsApp, then SMS if you don&apos;t check in</span></span>
              <input id={`sd-${c.id}`} type="checkbox" checked={picked.includes(c.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))} style={{ width: 22, height: 22, accentColor: "var(--link)" }} />
            </label>))}
      </div>
      <div className="row" style={{ justifyContent: "space-between", padding: "12px 14px", borderRadius: 16, background: "#fff", border: "1px solid var(--line)" }}>
        <span className="stack" style={{ gap: 2 }}><strong>Check in at</strong><span className="small">We&apos;ll ask &quot;Are you okay?&quot;</span></span>
        <select aria-label="Check in after" value={hours} onChange={(e) => setHours(Number(e.target.value))} style={{ border: 0, font: "700 15px var(--sans)", background: "transparent" }}>
          {[1, 1.5, 2, 2.5, 3, 4, 5].map((h) => <option key={h} value={h}>{t(new Date(startDate.getTime() + h * 3600e3))}</option>)}</select>
      </div>
      <div className="note"><span>No tap on &quot;I&apos;m okay&quot; by {t(checkin)}? We remind you. Still nothing after 15 minutes? {(contacts ?? []).filter((c) => picked.includes(c.id)).map((c) => c.name).join(" and ") || "Your contact"} get{picked.length === 1 ? "s" : ""} an SMS alert.</span></div>
      <ErrorNote error={error} />
      <div className="grow" />
      <div className="row" style={{ gap: 10 }}>
        <Link href={`/sos${matchId ? `?match=${matchId}` : ""}`} className="btn" style={{ flex: "0 0 96px", background: "var(--red)", color: "#fff" }}>SOS</Link>
        <div style={{ flex: 1 }}><Primary onClick={share} busy={busy} disabled={!place.trim() || picked.length === 0}>Share with {(contacts ?? []).find((c) => picked.includes(c.id))?.name ?? "contact"}</Primary></div>
      </div>
    </div>
  );
}
export default function ShareDatePage() { return <Suspense><ShareDate /></Suspense>; }
