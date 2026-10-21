"use client";
// Keys & live mode: every provider key in one place. Write-only: a saved key is never shown again, only its last 4.
import { useCallback, useEffect, useState } from "react";
import { useAction, useAdmin, when } from "@/components/shell";
import { api, type KeySlot, type Keys } from "@/lib/api";

const GROUPS: [string, string][] = [["AI", "Writers and picture makers. Text features and Imagine Us use whichever model you pick in AI models."],
  ["Payments", "Razorpay. Only one pair is in use at a time: the payments switch above picks test or live."],
  ["Payouts", "RazorpayX, for Be a Cupid withdrawals. Follows the same payments switch."],
  ["SMS", "Safety alerts to trusted contacts."], ["Kundli", "The Likha kundli service (NASA JPL ephemeris)."],
  ["Maps", "City search in the app. Browser key: restrict it to likha.in in Google Cloud."],
  ["Verification", "Only needed when a check is set to \"Call an API\" on Settings > Verification."], ["Alerts", "Where the team hears about AI spend and safety alerts."]];

function Row({ s, reload }: { s: KeySlot; reload(): void }) {
  const { toast } = useAdmin();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(""); const [show, setShow] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const { busy, error, run } = useAction();
  const id = `k-${s.key}-${s.mode}`;
  return (
    <tr data-key={`${s.key}:${s.mode}`}>
      <td style={{ width: "38%" }}>
        <div className="row" style={{ gap: 6 }}><strong>{s.label}</strong>
          {s.mode !== "any" && <span className={`pill ${s.mode}`}>{s.mode}</span>}
          {s.mode !== "any" && s.in_use && <span className="pill info">in use</span>}
          {s.is_public && <span className="pill off" title="Safe to show in the app">browser-safe</span>}</div>
        <div className="small mono">{s.key}</div>
        {s.hint && <div className="small">{s.hint}</div>}
      </td>
      <td>
        {editing ? (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); run(async () => { await api().setKey(s.key, s.mode, value); setEditing(false); setValue(""); toast(`${s.label} saved`); reload(); }); }}>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input id={id} aria-label={`New value for ${s.label}`} className="input mono grow" type={s.is_secret && !show ? "password" : "text"} autoComplete="off" spellCheck={false}
                value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
              {s.is_secret && <button type="button" className="btn ghost sm" onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button>}
            </div>
            <div className="row"><button className="btn sm" disabled={busy || value.trim().length < 4}>Save</button>
              <button type="button" className="btn ghost sm" onClick={() => { setEditing(false); setValue(""); }}>Cancel</button>
              <span className="small">{s.set ? "Replaces the current one straight away." : ""}</span></div>
          </form>
        ) : s.set ? (
          <div className="stack" style={{ gap: 4 }}>
            <span className="mono">{s.shown}</span>
            <span className="small">Set {when(s.set_at)}{s.set_by ? ` by ${s.set_by}` : ""}</span>
            {s.tested_at && <span className={`pill ${s.test_ok ? "ok" : "bad"}`} style={{ alignSelf: "flex-start" }}>{s.test_ok ? "✓" : "✗"} {s.test_note}</span>}
          </div>
        ) : <span className="pill off">Not set</span>}
        {error && <p className="err" role="alert">{error}</p>}
      </td>
      <td style={{ width: 220 }}>
        {!editing && (confirmClear ? (
          <div className="stack" style={{ gap: 6 }}><span className="small">Remove this key? Anything using it stops.</span>
            <div className="row"><button type="button" className="btn danger sm" disabled={busy} onClick={() => run(async () => { await api().clearKey(s.key, s.mode); setConfirmClear(false); toast(`${s.label} removed`); reload(); })}>Remove</button>
              <button type="button" className="btn ghost sm" onClick={() => setConfirmClear(false)}>Keep</button></div></div>
        ) : (
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn ghost sm" onClick={() => setEditing(true)}>{s.set ? "Replace" : "Set"}</button>
            {s.set && s.testable && <button type="button" className="btn ghost sm" disabled={busy}
              onClick={() => run(async () => { const r = await api().testKey(s.key, s.mode); toast(r.ok ? `Works: ${r.note}` : `Failed: ${r.note}`); reload(); })}>{busy ? "Testing…" : "Test"}</button>}
            {s.set && <button type="button" className="btn ghost sm" onClick={() => setConfirmClear(true)} aria-label={`Remove ${s.label}`}>Remove</button>}
          </div>
        ))}
      </td>
    </tr>
  );
}

function PaymentsSwitch({ k, reload }: { k: Keys; reload(): void }) {
  const { toast } = useAdmin();
  const [open, setOpen] = useState(false); const [typed, setTyped] = useState("");
  const { busy, error, run } = useAction();
  const live = k.payments_mode === "live";
  const liveRows = k.slots.filter((s) => s.grp === "Payments" && s.mode === "live");
  const secret = liveRows.find((s) => s.key === "RAZORPAY_KEY_SECRET");
  const ready = liveRows.every((s) => s.set) && !!secret?.test_ok;
  return (
    <section className="card stack" style={{ gap: 12, borderColor: live ? "#9FD3BF" : "#F5D58A", background: live ? "#F3FBF7" : "#FFFBF0" }} aria-label="Payments mode">
      <div className="row">
        <span className={`pill ${live ? "live" : "test"}`} style={{ fontSize: 13, padding: "4px 12px" }}>{live ? "LIVE" : "TEST"}</span>
        <h2 className="grow">{live ? "Payments are live: members pay real money" : "Payments are in test mode: no real money moves"}</h2>
        {!open && <button type="button" className={`btn ${live ? "ghost" : "dark"}`} onClick={() => setOpen(true)}>{live ? "Switch to test" : "Go live"}</button>}
      </div>
      {open && (live ? (
        <div className="stack">
          <p className="sub">New payments will use the test keys: members can&apos;t buy anything for real until you go live again. Orders already open on the live keys may fail to confirm.</p>
          <div className="row"><button type="button" className="btn dark" disabled={busy} onClick={() => run(async () => { await api().setPaymentsMode("test", ""); setOpen(false); toast("Payments switched to test"); reload(); })}>Switch to test</button>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button></div>
        </div>
      ) : (
        <div className="stack">
          <span className="small">Before going live:</span>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }} className="stack">
            {liveRows.map((s) => <li key={s.key}>{s.set ? "✓" : "✗"} {s.label}{s.set ? "" : " (not set)"}</li>)}
            <li>{secret?.test_ok ? "✓" : "✗"} Live Razorpay secret tested{secret?.test_ok ? "" : " (press Test on it below)"}</li>
            <li>• Webhook in the Razorpay live dashboard points to …/functions/v1/razorpay-webhook</li>
          </ul>
          <label className="f" style={{ maxWidth: 260 }}>Type LIVE to confirm<input className="input mono" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></label>
          <div className="row"><button type="button" className="btn dark" disabled={busy || !ready || typed !== "LIVE"}
              onClick={() => run(async () => { await api().setPaymentsMode("live", typed); setOpen(false); setTyped(""); toast("Payments are live"); reload(); })}>Go live now</button>
            <button type="button" className="btn ghost" onClick={() => { setOpen(false); setTyped(""); }}>Cancel</button></div>
        </div>
      ))}
      {error && <p className="err" role="alert">{error}</p>}
    </section>
  );
}

export default function KeysPage() {
  const [k, setK] = useState<Keys | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { api().keys().then(setK).catch((e: Error) => setErr(e.message)); }, []);
  useEffect(() => { load(); }, [load]);
  if (err) return <div className="note warn">{err}</div>;
  if (!k) return <div className="skel" style={{ height: 400 }} />;
  const missing = k.slots.filter((s) => s.in_use && !s.set && s.grp !== "Alerts" && s.grp !== "Verification").length;
  return (
    <>
      <div className="stack" style={{ gap: 4 }}><h1>Keys &amp; live mode</h1>
        <p className="sub">Saved keys are encrypted and never shown again; you see the last 4 characters. Changes apply within a minute and are logged with your name.</p></div>
      <PaymentsSwitch k={k} reload={load} />
      {missing > 0 && <div className="note warn">{missing} key{missing === 1 ? "" : "s"} in use {missing === 1 ? "is" : "are"} not set yet. Until set here, the server uses its own setting of the same name, if any.</div>}
      {GROUPS.map(([g, blurb]) => {
        const rows = k.slots.filter((s) => s.grp === g);
        return (
          <section key={g} className="stack" aria-label={g}>
            <div><h2>{g}</h2><span className="small">{blurb}</span></div>
            <div className="card flush"><table className="t"><tbody>{rows.map((s) => <Row key={`${s.key}:${s.mode}`} s={s} reload={load} />)}</tbody></table></div>
          </section>
        );
      })}
      <div className="note">Four settings stay in Supabase (Edge Functions → Secrets) because the server needs them to reach this page at all: the database service key,
        LIKHA_INTERNAL_SECRET (for scheduled jobs), LIKHA_HASH_SALT (changing it breaks saved phone matches) and the site addresses. Login OTP SMS is set in Supabase → Auth → SMS.</div>
    </>
  );
}
