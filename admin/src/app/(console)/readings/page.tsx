"use client";
// Readings support can fix: stuck, failed, or marked "not helpful". Rewrite sends it back to the writer; refund returns the credits.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAdmin } from "@/components/shell";
import { NoteAction, Page, Status, ago, label, useLoad } from "@/components/ui";
import { api } from "@/lib/api";

function Readings() {
  const sp = useSearchParams(); const user = sp.get("user") ?? undefined;
  const { toast } = useAdmin();
  const [filter, setFilter] = useState<"problems" | "all">(user ? "all" : "problems");
  const [sel, setSel] = useState<string | null>(null);
  const list = useLoad(() => api().readings(filter, user), [filter, user]);
  const one = useLoad(() => sel ? api().readingContent(sel) : Promise.resolve(null), [sel]);
  return (
    <Page title="Readings" sub={user ? "One member's readings." : "Stuck over 15 minutes, failed, or marked not helpful. Opening one is logged."}>
      <div className="chips"><button type="button" className="chip" aria-pressed={filter === "problems"} onClick={() => setFilter("problems")}>Needs a look</button>
        <button type="button" className="chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All recent</button></div>
      <div className="split">
        <div className="card flush">{list.data?.length === 0 ? <p className="sub" style={{ padding: 16 }}>Nothing needs a look.</p> : (
          <table className="t"><thead><tr><th>Member</th><th>Reading</th><th>Status</th><th>Credits</th><th>Age</th></tr></thead>
            <tbody>{(list.data ?? []).map((r) => <tr key={r.id} className="click" aria-selected={sel === r.id} onClick={() => setSel(r.id)}>
              <td><Link href={`/users/${r.user_id}`} onClick={(e) => e.stopPropagation()}>{r.user}</Link></td><td>{label(r.kind)}{r.helpful === false && <div className="small">marked not helpful</div>}</td>
              <td><Status s={r.status} />{r.attempts > 1 && <div className="small">{r.attempts} tries</div>}{r.last_error && <div className="small" style={{ color: "var(--red)" }}>{r.last_error}</div>}</td>
              <td>{r.credits}</td><td className="small">{ago(r.at)}</td></tr>)}</tbody></table>)}</div>
        {sel && one.data ? (
          <section className="card stack" aria-label="Reading">
            <div className="row"><h2 className="grow">{label(one.data.kind)}</h2><Status s={one.data.status} /></div>
            {one.data.content?.title ? <><strong className="serif" style={{ fontFamily: "var(--serif)", fontSize: 18 }}>{one.data.content.title}</strong>
              {one.data.content.sections?.map((x, i) => <div key={i}><strong>{x.heading}</strong><p style={{ margin: "2px 0 0" }}>{x.body}</p></div>)}</> : <span className="sub">Nothing written yet.</span>}
            <div className="row">
              {one.data.status !== "refunded" && one.data.kind !== "imagine_us" && <NoteAction label="Rewrite" placeholder="What was wrong (repeated, wrong name, off-tone…)"
                onRun={(n) => api().rewriteReading(one.data!.id, n)} done={() => { toast("Sent back to the writer. Ready within a minute or two."); list.reload(); one.reload(); }} />}
              {one.data.status !== "refunded" && <NoteAction label={`Refund ${one.data.credits} credits`} tone="danger" placeholder="Reason (the member is told credits are back)"
                onRun={(n) => api().refundReading(one.data!.id, n)} done={() => { toast("Refunded"); list.reload(); one.reload(); }} />}
            </div>
          </section>) : <div className="note">Pick a reading to read it and fix it.</div>}
      </div>
    </Page>
  );
}
export default function ReadingsPage() { return <Suspense><Readings /></Suspense>; }
