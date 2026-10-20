"use client";
// Live location shared from SOS. Opened by a trusted contact, no login. Works only while sharing is on.
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Screen } from "@/components/ui";
import { api } from "@/lib/api";

type View = Awaited<ReturnType<ReturnType<typeof api>["sosView"]>>;

export default function LiveLocation() {
  const { token } = useParams<{ token: string }>();
  const [v, setV] = useState<View | undefined>(undefined);
  useEffect(() => {
    const load = () => api().sosView(token).then(setV).catch(() => setV(null));
    load(); const t = setInterval(load, 30000); return () => clearInterval(t);
  }, [token]);
  if (v === undefined) return <Screen><div className="skel" style={{ height: 200 }} /></Screen>;
  if (!v) return <Screen><div className="wordmark">Likha<span>.</span></div><h1 className="h1">Location sharing has ended</h1><p className="sub">If you&apos;re worried, call them, or call 112.</p><a className="btn" href="tel:112">Call 112</a></Screen>;
  const maps = v.lat != null && v.lng != null ? `https://www.google.com/maps?q=${v.lat},${v.lng}` : null;
  return (
    <Screen>
      <div className="wordmark">Likha<span>.</span></div>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", color: "var(--red)" }}>EMERGENCY · LIVE LOCATION</span>
      <h1 className="h1">{v.first_name} needs help</h1>
      <p className="sub">{maps ? `Last updated ${new Date(v.updated_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}. This page refreshes every 30 seconds.` : "Their location isn't available yet. Keep this page open."}</p>
      {maps && <a className="btn" href={maps} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>}
      <a className="btn" href="tel:112" style={{ background: "var(--red)", color: "#fff" }}>Call 112</a>
      <span className="small">Shared until {new Date(v.share_until).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}.</span>
    </Screen>
  );
}
