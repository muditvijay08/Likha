"use client";
// O6 Birth details (step 3). Exact time, or an approximate part of the day (labelled everywhere, fixable once by the member).
// Saved once; other corrections go through support.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlaceInput } from "@/components/PlaceInput";
import { ErrorNote, Lock, Primary, Screen, StepHeader, useAction } from "@/components/ui";
import { api, type Place } from "@/lib/api";
import { useGuard } from "@/lib/guard";
import { usePersisted } from "@/lib/persist";
import { offsetMinutes, timezoneFor } from "@/lib/places";

// Middle of each part of the day; the label tells everyone the time is approximate.
const PARTS = { early: ["Before sunrise", "05:00"], morning: ["Morning", "09:00"], afternoon: ["Afternoon", "14:00"], evening: ["Evening", "18:30"], night: ["Night", "22:30"] } as const;

export default function Birth() {
  const s = useGuard();
  const router = useRouter();
  const [f, setF] = usePersisted("birth", { date: "", time: "", place: null as Place | null, approx: "" as "" | keyof typeof PARTS });
  const { busy, error, run } = useAction();
  const [confirm, setConfirm] = useState(false);
  const locked = !!s?.has_birth;

  const today = new Date();
  const maxDate = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate()).toISOString().slice(0, 10);

  const submit = () => run(async () => {
    if (!locked) {
      if (!f.date) throw new Error("Please add your date of birth.");
      if (!f.time && !f.approx) throw new Error("Add your birth time, or pick roughly when in the day.");
      if (!f.place) throw new Error("Pick your birthplace from the list.");
      if (f.date > maxDate) throw new Error("Likha is for people 18 and older.");
      if (!confirm) { setConfirm(true); return; }             // birth details lock once saved: ask once more
      const tz = timezoneFor(f.place.lat, f.place.lng);
      const time = f.time || PARTS[f.approx as keyof typeof PARTS][1];
      await api().saveBirth({ date: f.date, time, place: f.place, tz, offsetMinutes: offsetMinutes(tz, f.date, time), approx: !f.time });
    }
    await api().setStep(4);
    await api().refresh();
    router.push("/photos");
  });

  return (
    <Screen style={{ gap: 16 }}>
      <StepHeader step={3} back="/lifestyle" />
      <div className="stack">
        <h1 className="h1">When did the universe drop you on Earth?</h1>
        <p className="sub">Your exact birth details build your kundli. We never show them on your profile.</p>
      </div>

      {locked ? (
        <div className="note">Your birth details are saved and locked. Need a correction? Write to Help and we&apos;ll fix it once.</div>
      ) : (
        <form className="stack" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="field">
            <label htmlFor="dob" className="label">Date of birth <span style={{ color: "var(--g)" }}>*</span></label>
            <input id="dob" type="date" className="input" max={maxDate} min="1900-01-01" value={f.date} onChange={(e) => { setF({ ...f, date: e.target.value }); setConfirm(false); }} />
          </div>
          <div className="field">
            <label htmlFor="tob" className="label">Time of birth</label>
            <input id="tob" type="time" className="input" value={f.time} onChange={(e) => { setF({ ...f, time: e.target.value, approx: "" }); setConfirm(false); }} />
          </div>
          <PlaceInput id="pob" label="Birthplace" required value={f.place} onPick={(p) => { setF({ ...f, place: p }); setConfirm(false); }} placeholder="Town or city you were born in" />
          <details className="note" style={{ display: "block" }} open={!!f.approx}>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>Don&apos;t know the exact time?</summary>
            <div className="stack" style={{ gap: 8, marginTop: 10 }}>
              <span style={{ fontSize: 13 }}>Pick roughly when. We&apos;ll mark your kundli &ldquo;Approx. time&rdquo; so matches know, and you can add the exact time yourself once you find it.</span>
              <div className="chips">{(Object.keys(PARTS) as (keyof typeof PARTS)[]).map((k) => (
                <button key={k} type="button" className="chip sm" aria-pressed={f.approx === k} onClick={() => { setF({ ...f, approx: k, time: "" }); setConfirm(false); }}>{PARTS[k][0]}</button>
              ))}</div>
            </div>
          </details>
        </form>
      )}

      {confirm && !locked && f.place && (
        <div className="card" role="alertdialog" aria-label="Check your birth details" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <strong style={{ fontSize: 15 }}>Quick check. These lock once saved.</strong>
          <span style={{ fontSize: 14 }}>{new Date(`${f.date}T00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            {" · "}{f.time ? new Date(`2000-01-01T${f.time}`).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : `${PARTS[f.approx as keyof typeof PARTS][0]} (approx.)`}{" · "}{f.place.label}</span>
          <button type="button" className="linkbtn" onClick={() => setConfirm(false)}>Edit</button>
        </div>
      )}

      <div className="grow" />
      <div className="stack" style={{ gap: 12 }}>
        <div className="trust"><Lock />Stored privately under India&apos;s DPDP rules</div>
        <ErrorNote error={error} />
        <Primary onClick={submit} busy={busy}>{locked ? "Continue" : confirm ? "Yes, build my kundli" : "Build my kundli"}</Primary>
      </div>
    </Screen>
  );
}
