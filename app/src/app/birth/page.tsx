"use client";
// O6 Birth details (step 3). Time is required: no time, no kundli. Saved once; corrections go through support.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlaceInput } from "@/components/PlaceInput";
import { ErrorNote, Lock, Primary, Screen, StepHeader, useAction } from "@/components/ui";
import { api, type Place } from "@/lib/api";
import { useGuard } from "@/lib/guard";
import { usePersisted } from "@/lib/persist";
import { offsetMinutes, timezoneFor } from "@/lib/places";

export default function Birth() {
  const s = useGuard();
  const router = useRouter();
  const [f, setF] = usePersisted("birth", { date: "", time: "", place: null as Place | null });
  const { busy, error, run } = useAction();
  const [confirm, setConfirm] = useState(false);
  const locked = !!s?.has_birth;

  const today = new Date();
  const maxDate = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate()).toISOString().slice(0, 10);

  const submit = () => run(async () => {
    if (!locked) {
      if (!f.date) throw new Error("Please add your date of birth.");
      if (!f.time) throw new Error("Birth time is a must. No time, no kundli.");
      if (!f.place) throw new Error("Pick your birthplace from the list.");
      if (f.date > maxDate) throw new Error("Likha is for people 18 and older.");
      if (!confirm) { setConfirm(true); return; }             // birth details lock once saved: ask once more
      const tz = timezoneFor(f.place.lat, f.place.lng);
      await api().saveBirth({ date: f.date, time: f.time, place: f.place, tz, offsetMinutes: offsetMinutes(tz, f.date, f.time) });
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
            <label htmlFor="tob" className="label">Time of birth <span style={{ color: "var(--g)" }}>*</span></label>
            <input id="tob" type="time" className="input" value={f.time} onChange={(e) => { setF({ ...f, time: e.target.value }); setConfirm(false); }} />
          </div>
          <PlaceInput id="pob" label="Birthplace" required value={f.place} onPick={(p) => { setF({ ...f, place: p }); setConfirm(false); }} placeholder="Town or city you were born in" />
          <div className="note">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B5590A" strokeWidth="2" aria-hidden="true" style={{ flex: "none" }}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            <span><strong>Birth time is a must.</strong> No time, no kundli. Check your birth certificate or ask Mummy, then come back.</span>
          </div>
        </form>
      )}

      {confirm && !locked && f.place && (
        <div className="card" role="alertdialog" aria-label="Check your birth details" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <strong style={{ fontSize: 15 }}>Quick check. These lock once saved.</strong>
          <span style={{ fontSize: 14 }}>{new Date(`${f.date}T00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            {" · "}{new Date(`2000-01-01T${f.time}`).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}{" · "}{f.place.label}</span>
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
