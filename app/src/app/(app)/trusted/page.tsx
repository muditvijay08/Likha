"use client";
// Trusted contacts: people who get your date details and an alert if you don't check in.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BackButton, ErrorNote, Primary, useAction } from "@/components/ui";
import { api, type TrustedContact } from "@/lib/api";

function Trusted() {
  const router = useRouter();
  const back = useSearchParams().get("back");
  const [list, setList] = useState<TrustedContact[]>([]);
  const [name, setName] = useState(""), [phone, setPhone] = useState(""), [rel, setRel] = useState("");
  const { busy, error, run } = useAction();
  useEffect(() => { api().trustedContacts().then(setList).catch(() => {}); }, []);
  const add = () => run(async () => { const c = await api().addTrustedContact(name, phone, rel); setList([...list, c]); setName(""); setPhone(""); setRel(""); if (back) router.push(back); });
  const remove = (id: string) => run(async () => { await api().removeTrustedContact(id); setList(list.filter((c) => c.id !== id)); });
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href={back ?? "/privacy"} /><h1>Trusted contacts</h1></div>
      <p className="sub">When you share a date, they get the details from your WhatsApp. If you don&apos;t check in, we text them.</p>
      {list.length > 0 && <div className="listcard">{list.map((c) => <div key={c.id}><span className="stack" style={{ gap: 1 }}><strong>{c.name}{c.relation ? ` (${c.relation})` : ""}</strong><span className="small">{c.phone}</span></span>
        <button type="button" className="linkbtn" onClick={() => remove(c.id)}>Remove</button></div>)}</div>}
      <div className="card stack" style={{ gap: 10, borderRadius: 18 }}>
        <strong>Add someone you trust</strong>
        <div className="grid2">
          <div className="field"><label htmlFor="t-name" className="label">Name</label><input id="t-name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label htmlFor="t-rel" className="label">Who are they?</label><input id="t-rel" className="input" maxLength={20} placeholder="sister, friend" value={rel} onChange={(e) => setRel(e.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="t-phone" className="label">Mobile number</label><input id="t-phone" className="input" inputMode="tel" placeholder="+91 98xxx xxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <ErrorNote error={error} />
        <Primary onClick={add} busy={busy} disabled={!name.trim() || phone.replace(/\D/g, "").length < 10}>Add contact</Primary>
        <span className="small">Tell them first, so an alert from Likha doesn&apos;t surprise them.</span>
      </div>
    </div>
  );
}
export default function TrustedPage() { return <Suspense><Trusted /></Suspense>; }
