"use client";
// F3 SOS: call 112 first; share live location with trusted contacts for 2 hours; flag the match for urgent review.
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { BackButton, ErrorNote, useAction } from "@/components/ui";
import { api, type TrustedContact } from "@/lib/api";

function Sos() {
  const match = useSearchParams().get("match");
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [name, setName] = useState<string | null>(null);
  const [other, setOther] = useState<string | null>(null);
  const [live, setLive] = useState<{ id: string; token: string } | null>(null);
  const [flagged, setFlagged] = useState(false);
  const watch = useRef<number | null>(null);
  const { busy, error, run, setError } = useAction();
  useEffect(() => {
    api().trustedContacts().then(setContacts).catch(() => {});
    if (match) api().chat(match).then((c) => { setName(c.other.first_name); setOther(c.other.id); }).catch(() => {});
    return () => { if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current); };
  }, [match]);

  const where = () => new Promise<GeolocationPosition | null>((ok) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(ok, () => ok(null), { enableHighAccuracy: true, timeout: 8000 }) : ok(null));
  const shareLocation = () => run(async () => {
    const pos = await where();
    if (!pos) setError("Location is off. You can still send the link; it shows once location is allowed.");
    const s = await api().sosStart(match, pos?.coords.latitude ?? null, pos?.coords.longitude ?? null, false);
    setLive(s);
    watch.current = navigator.geolocation?.watchPosition((p) => { api().sosUpdate(s.id, p.coords.latitude, p.coords.longitude).catch(() => {}); }, () => {}, { enableHighAccuracy: true }) ?? null;
    if (contacts[0]) window.open(waLink(s.token, contacts[0].phone), "_blank", "noopener");   // the first contact opens at once
    else window.open(waLink(s.token), "_blank", "noopener");
  });
  // urgent report only: no second SOS event, and the live location (if shared) keeps running
  const flag = () => run(async () => { if (other) await api().report(other, "unsafe_meeting", "Flagged from SOS", false); setFlagged(true); });
  const stop = () => run(async () => { if (live) await api().sosStop(live.id); if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current); setLive(null); });

  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: "space-between" }}><BackButton /><span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", color: "var(--red)" }}>EMERGENCY</span><span style={{ width: 44 }} /></div>
      <h1 className="h1 big">Are you safe?</h1>
      <p className="sub">If you&apos;re in danger, call for help first. We&apos;ll do the rest.</p>
      <a href="tel:112" className="stack" style={{ gap: 2, padding: "18px 20px", borderRadius: 20, background: "var(--red)", color: "#fff", textDecoration: "none" }}>
        <strong style={{ fontSize: 22 }}>Call 112</strong><span style={{ fontSize: 13, opacity: .9 }}>India emergency number · in the UAE, call 999</span></a>
      {live ? (
        <div className="stack" style={{ gap: 8, padding: "16px 18px", borderRadius: 20, background: "var(--green-soft)" }}>
          <strong>Sharing your live location for 2 hours</strong>
          <span style={{ fontSize: 13 }}>Only people you send this private link to can see it. It stops by itself after 2 hours.</span>
          {contacts.map((c) => (
            <a key={c.id} className="btn ghost" href={waLink(live.token, c.phone)} target="_blank" rel="noopener noreferrer">Send to {c.name} on WhatsApp</a>
          ))}
          {!contacts.length && <a className="btn ghost" href={waLink(live.token)} target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>}
          <button type="button" className="btn text" onClick={stop}>Stop sharing</button>
        </div>
      ) : (
        <button type="button" className="rcard" onClick={shareLocation} disabled={busy}><span className="stack" style={{ gap: 2 }}><strong>Share my live location</strong>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{contacts.length ? `With ${contacts.map((c) => c.name).join(" and ")}, for the next 2 hours` : "Send a private link on WhatsApp, for the next 2 hours"}</span></span></button>
      )}
      {!contacts.length && !live && <a href="/trusted" className="small" style={{ textAlign: "center" }}>Add trusted contacts so SOS reaches them in one tap</a>}
      {match && (flagged ? <div className="note"><span>{name ?? "They"} {name ? "is" : "are"} flagged and won&apos;t be told. Our safety team looks at this first and may contact you.</span></div> :
        <button type="button" className="rcard" onClick={flag} disabled={busy}><span className="stack" style={{ gap: 2 }}><strong>Flag {name ?? "my date"} for urgent review</strong>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Our safety team looks at this first</span></span></button>)}
      <ErrorNote error={error} />
      <div className="grow" />
      <span className="small" style={{ textAlign: "center" }}>Location is shared only when you tap. You can stop sharing anytime.</span>
    </div>
  );
}
const waLink = (token: string, phone?: string) => {
  const text = `I need help. My live location for the next 2 hours: ${location.origin}/s/${token}`;
  return phone ? `https://wa.me/${phone.replace(/\D/g, "").replace(/^0/, "").replace(/^(?!91)(\d{10})$/, "91$1")}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
};
export default function SosPage() { return <Suspense><Sos /></Suspense>; }
