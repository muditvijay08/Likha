"use client";
// P4 Privacy and safety: visibility, read receipts, blocked people, trusted contacts.
import Link from "next/link";
import { useEffect, useState } from "react";
import { BackButton, ErrorNote } from "@/components/ui";
import { Toggle, useApp } from "@/components/app";
import { api, type MyProfile, type ProfilePatch, type TrustedContact } from "@/lib/api";

export default function Privacy() {
  const { toast } = useApp();
  const [p, setP] = useState<MyProfile | null>(null);
  const [blocked, setBlocked] = useState<{ id: string; first_name: string }[]>([]);
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [showBlocked, setShowBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api().myProfile().then(setP).catch(() => {});
    api().blocks().then(setBlocked).catch(() => {});
    api().trustedContacts().then(setContacts).catch(() => {});
  }, []);
  const set = (x: ProfilePatch) => { setP({ ...p!, ...x } as MyProfile); api().saveProfile(x).then(() => toast("Saved")).catch((e) => setError(e.message)); };
  const unblock = async (id: string) => { await api().unblock(id); setBlocked(blocked.filter((b) => b.id !== id)); toast("Unblocked"); };
  if (!p) return <div className="app-body pad"><div className="skel" style={{ height: 400 }} /></div>;
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/settings" /><h1>Privacy and safety</h1></div>
      <ErrorNote error={error} />
      <div className="listcard" style={{ padding: 0 }}>
        <Toggle id="p-incog" label="Incognito" hint="Only people you've liked can see you" checked={p.incognito} onChange={(v) => set({ incognito: v })} />
        {p.gender === "woman" && <Toggle id="p-first" label="I message first" hint="Matches can't open the chat first." checked={p.i_message_first} onChange={(v) => set({ i_message_first: v })} />}
        <Toggle id="p-company" label="Hide my company" checked={p.hide_company} onChange={(v) => set({ hide_company: v })} />
        <Toggle id="p-religion" label="Show religion on profile" checked={p.show_religion} onChange={(v) => set({ show_religion: v })} />
        <Toggle id="p-read" label="Read receipts" checked={p.read_receipts} onChange={(v) => set({ read_receipts: v })} />
        <Toggle id="p-online" label="Show when I'm online" checked={p.show_online} onChange={(v) => set({ show_online: v })} />
      </div>
      <div className="listcard">
        <button type="button" aria-expanded={showBlocked} onClick={() => setShowBlocked(!showBlocked)} style={{ background: "none", border: 0, font: "inherit", color: "inherit" }}>
          <span>Blocked people</span><span style={{ color: "var(--muted)" }}>{blocked.length}</span></button>
        {showBlocked && blocked.map((b) => <div key={b.id}><span>{b.first_name}</span><button type="button" className="linkbtn" onClick={() => unblock(b.id)}>Unblock</button></div>)}
        <Link href="/trusted"><span>Trusted contacts</span><span style={{ color: "var(--muted)" }}>{contacts.length ? contacts.map((c) => c.name).join(", ") : "Add someone"}</span></Link>
        <Link href="/share-date"><span>Share my date</span><span aria-hidden="true">›</span></Link>
      </div>
      <div className="note"><span>We never show your exact location or birth details. Distance is always rounded.</span></div>
    </div>
  );
}
