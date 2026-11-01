"use client";
// P3 Settings: language, notifications, pause, grievance officer, log out, delete.
import Link from "next/link";
import { useEffect, useState } from "react";
import { BackButton, ErrorNote } from "@/components/ui";
import { Toggle, useApp } from "@/components/app";
import { InstallCard } from "@/components/install";
import { api, type MyProfile, type NotifPrefs } from "@/lib/api";
import { enablePush, pushState } from "@/lib/push";
import { useFlow } from "@/lib/flow";

const sec = { fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "var(--muted)" } as const;

export default function Settings() {
  const { toast } = useApp();
  const { settings } = useFlow();
  const [p, setP] = useState<MyProfile | null>(null);
  const [n, setN] = useState<NotifPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api().myProfile().then(setP).catch(() => {}); api().notifPrefs().then(setN).catch(() => {}); }, []);
  const go = async (fn: () => Promise<void>, msg = "Saved") => { try { setError(null); await fn(); toast(msg); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save."); } };
  const setPref = (x: Partial<NotifPrefs>) => { const v = { ...n!, ...x }; setN(v); go(() => api().saveNotifPrefs(v)); };
  const lang = (l: MyProfile["language_pref"]) => { setP({ ...p!, language_pref: l }); go(() => api().saveProfile({ language_pref: l }), l === "hi" ? "Hindi screens are coming soon; Saathi and readings switch now" : "Saved"); };
  const pause = (v: boolean) => { setP({ ...p!, paused: v }); go(() => api().saveProfile({ paused: v }), v ? "Profile paused. Chats stay." : "You're back in Discover"); };
  const logout = async () => { await api().signOut(); location.href = "/start"; };
  const g = settings?.grievance_officer;
  const [device, setDevice] = useState<ReturnType<typeof pushState>>("unsupported");
  useEffect(() => { setDevice(pushState()); }, []);
  const allow = async () => {
    const r = await enablePush().catch(() => "unsupported" as const);
    if (r === "not-set-up") { setError("Notifications aren't switched on for Likha yet. Try again later."); return; }
    setDevice(pushState());
    if (r === "granted") toast("Notifications on for this device");
  };
  const DEVICE = { on: "On", off: "Off", blocked: "Blocked in your browser settings", unsupported: "This browser can't show notifications",
    "ios-needs-install": "Add Likha to your Home Screen first, then open it from there" } as const;

  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/me" /><h1>Settings</h1></div>
      <ErrorNote error={error} />
      <InstallCard />
      {!p || !n ? <div className="skel" style={{ height: 400 }} /> : <>
        <div className="stack"><span style={sec}>LANGUAGE</span>
          <div role="radiogroup" aria-label="Language" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, padding: 4, borderRadius: 14, background: "#EDE6FF" }}>
            {([["en", "English"], ["hi", "हिंदी"], ["hinglish", "Hinglish"]] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={p.language_pref === k} onClick={() => lang(k)}
                style={{ height: 40, border: 0, borderRadius: 10, background: p.language_pref === k ? "#fff" : "transparent", font: `${p.language_pref === k ? 700 : 600} 14px var(--sans)`, color: "var(--ink)" }}>{l}</button>
            ))}
          </div></div>
        <div className="stack"><span style={sec}>NOTIFICATIONS</span>
          <div className="listcard" style={{ padding: 0 }}>
            <div className="row" style={{ justifyContent: "space-between", gap: 12, padding: "12px 16px", fontSize: 14 }}>
              <span className="stack" style={{ gap: 2 }}><span>On this device</span><span style={{ fontSize: 12, color: device === "on" ? "var(--green)" : "var(--muted)" }}>{DEVICE[device]}</span></span>
              {device === "off" && <button type="button" className="btn" onClick={allow} style={{ height: 36, width: "auto", flex: "none", padding: "0 16px", fontSize: 13 }}>Turn on</button>}
            </div>
            <label htmlFor="n-kick" className="row" style={{ justifyContent: "space-between", padding: "12px 16px", fontSize: 14 }}>Daily Kick time
              <input id="n-kick" type="time" value={n.kick_time} onChange={(e) => setPref({ kick_time: e.target.value })} style={{ border: 0, font: "700 14px var(--sans)", background: "transparent", color: "var(--ink)" }} /></label>
            <Toggle id="n-likes" label="New likes" checked={n.new_likes} onChange={(v) => setPref({ new_likes: v })} />
            <Toggle id="n-msgs" label="Matches and messages" checked={n.matches} onChange={(v) => setPref({ matches: v })} />
            <Toggle id="n-golden" label="Golden Hours" checked={n.golden_hours} onChange={(v) => setPref({ golden_hours: v })} />
            <Toggle id="n-offers" label="Offers" hint="Off by default. We never send more than one a week." checked={n.offers} onChange={(v) => setPref({ offers: v })} />
            <div style={{ padding: "12px 16px", fontSize: 14 }}><span>Quiet hours</span>
              <span className="row" style={{ gap: 4 }}><input aria-label="Quiet from" type="time" value={n.quiet_start} onChange={(e) => setPref({ quiet_start: e.target.value })} style={{ border: 0, font: "700 14px var(--sans)", background: "transparent" }} />–
                <input aria-label="Quiet until" type="time" value={n.quiet_end} onChange={(e) => setPref({ quiet_end: e.target.value })} style={{ border: 0, font: "700 14px var(--sans)", background: "transparent" }} /></span></div>
          </div></div>
        <div className="listcard"><Toggle id="s-pause" label="Pause my profile" hint="Hidden from Discover. Chats stay." checked={p.paused} onChange={pause} /></div>
        <div className="listcard">
          <Link href="/privacy">Privacy and safety<span aria-hidden="true">›</span></Link>
          <Link href="/plans">Plans and credit history<span aria-hidden="true">›</span></Link>
          <Link href="/legal/terms">Terms, privacy and refunds<span aria-hidden="true">›</span></Link>
        </div>
        <div className="stack" style={{ gap: 4, padding: "12px 14px", borderRadius: 16, background: "#F3EEFF", fontSize: 13 }}>
          <strong>Grievance Officer: {g?.name ?? "[NAME]"}</strong>
          <span>{g?.email ?? "grievance@likha.in"} · reply within {g?.ack_hours ?? 24} hours, resolved within {g?.resolve_days ?? 15} days</span>
          <Link href="/help#grievance">File a grievance</Link>
        </div>
        <div className="row" style={{ justifyContent: "space-between", padding: "4px 4px 0" }}>
          <button type="button" className="linkbtn" style={{ color: "var(--ink)", textDecoration: "none" }} onClick={logout}>Log out</button>
          <Link href="/delete" style={{ color: "var(--red)", fontWeight: 700, fontSize: 14 }}>Delete account</Link>
        </div>
      </>}
    </div>
  );
}
