"use client";
// A3 Memory Centre: everything the companion remembers, in the member's control. See, edit, delete, add, turn off, clear chat.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app";
import { BackButton, ErrorNote, useAction } from "@/components/ui";
import { api, type SaathiMemory, type SaathiState } from "@/lib/api";
import { COMPANION_NAME } from "@/lib/companion";

export default function MemoryCentre() {
  const { toast } = useApp();
  const { busy, error, run } = useAction();
  const [s, setS] = useState<SaathiState | null>(null);
  const [list, setList] = useState<SaathiMemory[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [add, setAdd] = useState("");
  const [confirm, setConfirm] = useState<"memories" | "chat" | null>(null);
  const load = async () => { const x = await api().saathi(); setS(x); setList(await api().saathiMemories()); };
  useEffect(() => { load().catch(() => {}); }, []);
  if (!s) return <div className="app-body pad"><div className="skel" style={{ height: 360 }} /></div>;
  const name = COMPANION_NAME[s.character];

  return (
    <div className="app-body pad" style={{ gap: 18 }}>
      <div className="titlebar"><BackButton href="/saathi" /><h1>Memory Centre</h1></div>
      <p className="sub" style={{ margin: 0 }}>What {name} remembers about you. Only things you approved or added. {name} is virtual and never shares these with anyone.</p>

      {!s.memory_on ? (
        <div className="companion-hero" style={{ padding: 16 }}>
          <strong>Memory is off</strong>
          <p className="small" style={{ margin: "6px 0 12px" }}>{name} forgets everything between chats except the recent conversation. Turn memory on in settings if you&apos;d like {name} to keep things you approve.</p>
          <Link href="/saathi/settings" className="btn sm">Memory settings</Link>
        </div>
      ) : (
        <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); run(async () => { await api().saathiMemorySave(add, null, "added"); setAdd(""); await load(); toast("Added"); }); }}>
          <label htmlFor="mem-add" className="sr">Add a memory</label>
          <input id="mem-add" className="input" value={add} onChange={(e) => setAdd(e.target.value)} maxLength={160} placeholder={`Something ${name} should remember`} />
          <button type="submit" className="btn sm" disabled={busy || add.trim().length < 3}>Add</button>
        </form>
      )}

      <section aria-label="Memories" className="stack" style={{ gap: 0 }}>
        <div className="sec-title"><strong>{list.length} {list.length === 1 ? "memory" : "memories"}</strong></div>
        {list.length === 0 && <p className="small" style={{ margin: "8px 0" }}>Nothing yet.</p>}
        {list.map((m) => (
          <div key={m.id} className="mem-row">
            {editing === m.id ? (
              <form className="row" style={{ gap: 8, flex: 1 }} onSubmit={(e) => { e.preventDefault(); run(async () => { await api().saathiMemorySave(draft, m.id); setEditing(null); await load(); }); }}>
                <label htmlFor={`mem-${m.id}`} className="sr">Edit memory</label>
                <input id={`mem-${m.id}`} className="input" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={160} autoFocus />
                <button type="submit" className="btn sm" disabled={busy}>Save</button>
              </form>
            ) : <>
              <span className="t"><span>{m.body}</span><small>{m.source === "added" ? "You added this" : "You approved this"}</small></span>
              <button type="button" className="btn sm outline" onClick={() => { setEditing(m.id); setDraft(m.body); }} aria-label={`Edit: ${m.body}`}>Edit</button>
              <button type="button" className="btn sm outline" onClick={() => run(async () => { await api().saathiMemoryDelete(m.id); await load(); })} aria-label={`Delete: ${m.body}`}>Delete</button>
            </>}
          </div>
        ))}
      </section>

      <section aria-label="Your data" className="stack" style={{ gap: 10 }}>
        <div className="sec-title"><strong>Your data</strong></div>
        {confirm ? (
          <div className="consent-box" role="alertdialog" aria-label="Confirm">
            <span style={{ flex: 1 }}>{confirm === "memories" ? `Delete all ${list.length} memories? This can't be undone.` : `Clear your whole chat with ${name}? The words are deleted for good.`}</span>
            <span className="row" style={{ gap: 8 }}>
              <button type="button" className="btn sm" disabled={busy} onClick={() => run(async () => {
                if (confirm === "memories") await api().saathiMemoryDelete(null); else await api().saathiClearChat();
                setConfirm(null); await load(); toast(confirm === "memories" ? "Memories deleted" : "Chat cleared");
              })}>Yes, delete</button>
              <button type="button" className="btn sm outline" onClick={() => setConfirm(null)}>Cancel</button>
            </span>
          </div>
        ) : <>
          <button type="button" className="rowlink" style={{ font: "inherit", textAlign: "left" }} disabled={!list.length} onClick={() => setConfirm("memories")}>Delete all memories</button>
          <button type="button" className="rowlink" style={{ font: "inherit", textAlign: "left" }} onClick={() => setConfirm("chat")}>Clear chat with {name}</button>
          {s.memory_on && <button type="button" className="rowlink" style={{ font: "inherit", textAlign: "left" }} onClick={() => run(async () => { await api().saathiPrefs({ memory_on: false }); await load(); toast("Memory off"); })}>Turn memory off</button>}
        </>}
        <span className="small">Clearing chat keeps today&apos;s free-message count. Your full data export (Help) includes these memories.</span>
      </section>
      <ErrorNote error={error} />
    </div>
  );
}
