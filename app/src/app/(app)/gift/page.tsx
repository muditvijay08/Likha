"use client";
// S4 Gift a Reading: they open it in the app on the day you choose and add their own birth details there.
import { useEffect, useState } from "react";
import { BackButton, ErrorNote, Primary, useAction } from "@/components/ui";
import { price, useApp } from "@/components/app";
import { api, type GiftItem } from "@/lib/api";

const KINDS: [string, string][] = [["gift", "Birthday year ahead"], ["who_suits_me", "Who suits you"], ["next_12_months", "Love forecast"]];
const iso = (d: Date) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);

export default function Gift() {
  const { home, prices, reload } = useApp();
  const [kind, setKind] = useState("gift");
  const [name, setName] = useState("");
  const [when, setWhen] = useState(iso(new Date()));
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState<{ token: string } | null>(null);
  const [mine, setMine] = useState<GiftItem[]>([]);
  const { busy, error, run } = useAction();
  useEffect(() => { api().myGifts().then(setMine).catch(() => {}); }, []);
  const send = () => run(async () => { setSent({ token: await api().sendGift(name.trim(), phone, kind, note.trim(), when) }); await reload(); setMine(await api().myGifts()); });
  const label = KINDS.find((k) => k[0] === kind)![1];
  const link = sent ? `${location.origin}/g/${encodeURIComponent(sent.token)}` : "";
  const day = new Date(`${when}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const wa = sent ? `https://wa.me/${phone.replace(/\D/g, "").replace(/^0/, "").replace(/^(?!91)(\d{10})$/, "91$1")}?text=${encodeURIComponent(
    `${name.trim()}, I got you a reading on Likha: "${label}". It opens on ${day}. ${link}`)}` : "";

  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/store" /><h1>Gift a Reading</h1></div>
      <div style={{ padding: 18, borderRadius: 22, background: "linear-gradient(135deg, #FFE7B8, #FFD3E0)", display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "var(--rose-ink)" }}>A GIFT FOR {(name.trim() || "THEM").toUpperCase()}</span>
        <span className="serif" style={{ fontSize: 22, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 13, color: "#3D3560" }}>{note.trim() ? `"${note.trim()}" · ${home?.first_name ?? ""}` : "Add a note below. It shows here."}</span>
      </div>
      {sent ? <>
        <div className="card stack" style={{ gap: 6, borderRadius: 20 }}><strong>Gift ready for {name.trim()}</strong>
          <span className="sub">Send the link now; it opens on {day}. They join with this number to open it and add their own birth details.</span></div>
        <a className="btn" href={wa} target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>
        <button type="button" className="btn ghost" onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button>
        <button type="button" className="btn text" onClick={() => { setSent(null); setName(""); setPhone(""); setNote(""); }}>Send another</button>
      </> : <>
        <div className="stack"><span className="label">Reading</span>
          <div className="chips">{KINDS.map(([v, l]) => <button key={v} type="button" className="chip sm" aria-pressed={kind === v} onClick={() => setKind(v)}>{l}</button>)}</div></div>
        <div className="grid2">
          <div className="field"><label htmlFor="g-name" className="label">Their name</label><input id="g-name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></div>
          <div className="field"><label htmlFor="g-when" className="label">Opens on</label><input id="g-when" className="input" type="date" min={iso(new Date())} value={when} onChange={(e) => setWhen(e.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="g-phone" className="label">Their WhatsApp number</label>
          <input id="g-phone" className="input" inputMode="tel" placeholder="+91 94xxx xxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" /></div>
        <div className="field"><label htmlFor="g-note" className="label">Your note <span style={{ fontWeight: 400, color: "var(--muted)" }}>· {note.length} / 200</span></label>
          <textarea id="g-note" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Happy birthday! Read this before you plan Goa." /></div>
        <ErrorNote error={error} />
        <div className="grow" />
        <Primary onClick={send} busy={busy} disabled={!name.trim() || phone.replace(/\D/g, "").length < 10}>Send gift · {price(prices, "gift", 99)} credits</Primary>
        <span className="small" style={{ textAlign: "center" }}>{name.trim() || "They"} join{name.trim() ? "s" : ""} to open it and add their own birth details. Unopened gifts expire after 30 days.</span>
      </>}
      {mine.length > 0 && (
        <section className="stack" style={{ gap: 8 }} aria-label="Gifts you sent"><strong style={{ fontSize: 14 }}>Gifts you sent</strong>
          <div className="listcard">{mine.map((g) => <div key={g.id}><span>{g.name} <span className="small">· {KINDS.find((k) => k[0] === g.kind)?.[1] ?? g.kind}</span></span>
            <span className="small">{g.opened ? "Opened" : `Opens ${new Date(g.deliver_on).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}</span></div>)}</div>
        </section>
      )}
    </div>
  );
}
