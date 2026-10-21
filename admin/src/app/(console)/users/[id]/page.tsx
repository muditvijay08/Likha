"use client";
// I4 user detail: everything needed to help one person, and the actions. No chat or Saathi text here.
import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useState } from "react";
import { useAction, useAdmin } from "@/components/shell";
import { NoteAction, Page, Photo, Status, day, label, rupees, useLoad } from "@/components/ui";
import { api } from "@/lib/api";

export default function UserPage() {
  const { id } = useParams<{ id: string }>();
  const { me, toast } = useAdmin();
  const { data: u, err, reload } = useLoad(() => api().user(id), [id]);
  const [delta, setDelta] = useState(""); const [why, setWhy] = useState("");
  const [tier, setTier] = useState("graha"); const [tdays, setTdays] = useState(30); const [treason, setTreason] = useState("");
  const [birth, setBirth] = useState<Record<string, unknown> | null>(null);
  const credits = useAction(); const tierA = useAction();
  const can = (p: string) => me.perms.includes(p);
  if (err) return <div className="note warn">{err}</div>;
  if (!u) return <div className="skel" style={{ height: 400 }} />;
  const done = (m: string) => () => { toast(m); reload(); };
  return (
    <Page title={`${u.first_name}${u.age ? `, ${u.age}` : ""}`} sub={`${u.short_id} · ${label(u.gender)} · ${u.city ?? "no city"}${u.travel_city ? ` (travelling: ${u.travel_city})` : ""} · joined ${day(u.joined)}`}
      actions={<Link className="btn ghost" href="/users">All users</Link>}>
      <div className="split">
        <div className="stack" style={{ gap: 16 }}>
          <section className="card" style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 16 }}>
            <Photo path={u.photo} name={u.first_name} />
            <dl className="kv">
              <dt>Status</dt><dd><Status s={u.status} />{u.paused && <span className="pill off">paused</span>}</dd>
              <dt>Phone</dt><dd className="mono">{u.phone ?? "–"} <span className="small">verified by OTP</span></dd>
              <dt>Selfie</dt><dd><Status s={u.selfie} /></dd><dt>Profile</dt><dd>{u.complete_pct}% · {u.profession ?? "–"} · {label(u.goal ?? "")}</dd>
              <dt>Tier</dt><dd>{u.tier === "none" ? "No tier" : label(u.tier)}{u.tier_override && <span className="small"> · set by team until {day(u.tier_override.until)}</span>}</dd>
              <dt>Credits</dt><dd><strong>{u.credits}</strong></dd><dt>Activity</dt><dd>{u.matches} matches · {u.likes_sent_7d} likes this week</dd>
              <dt>Saathi</dt><dd>{u.saathi.messages_7d} messages this week{u.saathi.crisis ? <span className="pill bad"> {u.saathi.crisis} crisis</span> : null}</dd>
              <dt>Guru Ji</dt><dd>{u.guru_questions} questions</dd><dt>Plans</dt><dd>{u.plans.length ? u.plans.map((p) => `${label(p.plan)} to ${day(p.until)}`).join(", ") : "–"}</dd>
              <dt>Came from</dt><dd>{u.referred_by ?? "–"}</dd>
            </dl>
          </section>
          <section className="card flush" aria-label="Payments"><div style={{ padding: "14px 16px 0" }}><h2>Payments</h2></div>
            {u.payments.length ? <table className="t"><tbody>{u.payments.map((p) => <tr key={p.id}><td>{day(p.at)}</td><td>{p.item}</td><td>{rupees(p.amount_paise)}</td>
              <td><Status s={p.status} /> {p.status === "captured" && !p.credited && <span className="pill bad">not credited</span>}</td><td className="mono small">{p.ref ?? ""}</td></tr>)}</tbody></table>
              : <p className="sub" style={{ padding: 16 }}>No payments.</p>}</section>
          <section className="card flush" aria-label="Credits history"><div style={{ padding: "14px 16px 0" }}><h2>Credits history</h2></div>
            {u.ledger.length ? <table className="t"><tbody>{u.ledger.map((l, i) => <tr key={i}><td>{day(l.at)}</td><td>{l.reason}</td><td style={{ color: l.delta < 0 ? "var(--red)" : "var(--green)", fontWeight: 700 }}>{l.delta > 0 ? "+" : ""}{l.delta}</td><td className="small">balance {l.balance}</td></tr>)}</tbody></table>
              : <p className="sub" style={{ padding: 16 }}>No credit activity.</p>}</section>
          <section className="card flush" aria-label="Readings"><div style={{ padding: "14px 16px 0" }} className="row"><h2 className="grow">Readings</h2><Link className="small" href={`/readings?user=${u.id}`}>Open in Readings</Link></div>
            {u.readings.length ? <table className="t"><tbody>{u.readings.map((r) => <tr key={r.id}><td>{day(r.at)}</td><td>{label(r.kind)}</td><td><Status s={r.status} /></td><td>{r.credits} cr</td></tr>)}</tbody></table>
              : <p className="sub" style={{ padding: 16 }}>No readings.</p>}</section>
          {(u.crush_checks.length > 0 || u.gifts_sent.length > 0) && <section className="card stack" aria-label="Links sent"><h2>Links sent</h2>
            {u.crush_checks.map((c) => <div key={c.token} className="row"><span>Check With Anyone for <strong>{c.name}</strong></span><span className="mono small">{c.token}</span><Status s={c.joined ? "active" : "open"} text={c.joined ? "joined" : `expires ${day(c.expires)}`} /></div>)}
            {u.gifts_sent.map((g) => <div key={g.token} className="row"><span>Gift for <strong>{g.name}</strong> ({label(g.kind)})</span><span className="mono small">{g.token}</span><Status s={g.opened ? "active" : "open"} text={g.opened ? "opened" : `opens ${day(g.deliver_on)}`} /></div>)}
          </section>}
        </div>
        <div className="stack" style={{ gap: 16 }}>
          {can("users.moderate") && <section className="card stack" aria-label="Account actions"><h2>Account</h2>
            <div className="row">
              {u.status !== "suspended" && u.status !== "banned" && <NoteAction label="Suspend" days={7} onRun={(n, d) => api().moderate(u.id, "suspend", n, d)} done={done("Suspended")} />}
              {u.status !== "banned" && <NoteAction label="Ban" tone="danger" onRun={(n) => api().moderate(u.id, "ban", n, null)} done={done("Banned")} />}
              {["suspended", "banned", "under_review"].includes(u.status) && <NoteAction label="Restore" onRun={(n) => api().moderate(u.id, "restore", n, null)} done={done("Restored")} />}
              <NoteAction label="Warn" onRun={(n) => api().moderate(u.id, "warn", n, null)} done={done("Warning sent")} />
            </div>
            {u.actions.length > 0 && <div className="stack" style={{ gap: 6 }}>{u.actions.map((a) => <div key={a.id} className="small"><strong>{label(a.action)}</strong> {day(a.at)}{a.until ? ` until ${day(a.until)}` : ""}: {a.reason}
              {a.appeal && <> · appeal <Status s={a.appeal.status} /></>}</div>)}</div>}
            {u.reports_against.length > 0 && <span className="small">Reported {u.reports_against.length} times · <Link href="/moderation">Moderation</Link></span>}
          </section>}
          {can("credits.adjust") && <section className="card stack" aria-label="Credits"><h2>Credits</h2>
            <form className="stack" onSubmit={(e) => { e.preventDefault(); credits.run(async () => { const b = await api().adjustCredits(u.id, Number(delta), why); setDelta(""); setWhy(""); toast(`Balance now ${b}`); reload(); }); }}>
              <div className="row"><label className="f">Add (+) or take (−)<input className="input" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} style={{ width: 120 }} placeholder="50" /></label>
                <label className="f grow">Reason<input className="input" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Charged twice on 17 Oct" /></label></div>
              {credits.error && <p className="err" role="alert">{credits.error}</p>}
              <button className="btn sm" style={{ alignSelf: "flex-start" }} disabled={credits.busy || !Number(delta) || !why.trim()}>Change credits</button>
              <span className="small">Up to 500 at a time. For money back to a bank, use Payments.</span>
            </form></section>}
          {can("credits.adjust") && <section className="card stack" aria-label="Tier override"><h2>Tier override</h2>
            <form className="stack" onSubmit={(e) => { e.preventDefault(); tierA.run(async () => { await api().setTier(u.id, tier, tdays, treason); setTreason(""); toast("Tier set"); reload(); }); }}>
              <div className="row"><select className="input" aria-label="Tier" value={tier} onChange={(e) => setTier(e.target.value)}><option value="tara">Tara</option><option value="graha">Graha</option><option value="surya">Surya</option></select>
                <label className="row small">for<input className="input" type="number" min={1} max={365} value={tdays} onChange={(e) => setTdays(Number(e.target.value))} style={{ width: 80 }} aria-label="Days" />days</label></div>
              <input className="input" aria-label="Tier reason" placeholder="Reason (partner, apology, test)" value={treason} onChange={(e) => setTreason(e.target.value)} />
              {tierA.error && <p className="err" role="alert">{tierA.error}</p>}
              <div className="row"><button className="btn sm" disabled={tierA.busy || !treason.trim()}>Set tier</button>
                {u.tier_override && <button type="button" className="btn ghost sm" disabled={tierA.busy || !treason.trim()} onClick={() => tierA.run(async () => { await api().setTier(u.id, "none", 0, treason); toast("Override removed"); reload(); })}>Remove override</button>}</div>
            </form></section>}
          {can("birth.reveal") && <section className="card stack" aria-label="Birth details"><h2>Birth details</h2>
            {birth ? <dl className="kv">{Object.entries(birth).filter(([k]) => ["birth_date", "birth_time", "birth_place", "tz_name", "corrections_used"].includes(k)).map(([k, v]) => <Fragment key={k}><dt>{label(k)}</dt><dd>{String(v)}</dd></Fragment>)}</dl>
              : <NoteAction label="Reveal (owner only, logged)" placeholder="Why do you need to see them?" onRun={async (n) => setBirth(await api().revealBirth(u.id, n))} />}
          </section>}
        </div>
      </div>
    </Page>
  );
}
