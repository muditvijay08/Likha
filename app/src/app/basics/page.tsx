"use client";
// O4 Basic profile (step 1). Creates the profile and saves consents on first submit.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PlaceInput } from "@/components/PlaceInput";
import { Chips, ErrorNote, Primary, Screen, StepHeader, useAction } from "@/components/ui";
import { api, type Gender, type Place } from "@/lib/api";
import { useFlow } from "@/lib/flow";
import { useGuard } from "@/lib/guard";
import { usePersisted } from "@/lib/persist";
import { placeFromGps, timezoneFor } from "@/lib/places";

const HEIGHTS = Array.from({ length: 31 }, (_, i) => 54 + i).map((inch) => ({ cm: Math.round(inch * 2.54), label: `${Math.floor(inch / 12)}′ ${inch % 12}″` }));
const TONGUES = ["Hindi", "Marwari", "Rajasthani", "Gujarati", "Punjabi", "Sindhi", "Marathi", "Bengali", "Odia", "Assamese", "Tamil", "Telugu",
  "Kannada", "Malayalam", "Urdu", "Konkani", "English"];
const EDU = ["High school", "Diploma", "Graduate", "Post-graduate", "Doctorate", "CA / CS / CFA", "Medicine", "Law"];
type ShowMe = "men" | "women" | "everyone";

export default function Basics() {
  const s = useGuard(false);
  const router = useRouter();
  const { draft, gender } = useFlow();
  const [f, setF] = usePersisted("basics", {
    first_name: "", show: (gender === "man" ? "women" : "men") as ShowMe, height_cm: "" as number | "", mother_tongue: "", education: "",
    profession: "", languages: "", college: "", company: "", hometown: "", city: null as Place | null, more: false,
  });
  const [gps, setGps] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  useEffect(() => { if (s?.first_name && !f.first_name) setF((o) => ({ ...o, first_name: s.first_name! })); }, [s, f.first_name, setF]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((o) => ({ ...o, [k]: v }));

  async function useLocation() {
    setGps("Finding you…");
    try {
      const p = await placeFromGps();
      if (p) { set("city", p); setGps(null); } else setGps("We couldn't match your location to a city. Type it instead.");
    } catch { setGps("Location is off. Type your city instead."); }
  }

  const submit = () => run(async () => {
    const name = f.first_name.trim();
    if (!name) throw new Error("Please add your first name.");
    if (!f.height_cm) throw new Error("Please pick your height.");
    if (!f.profession.trim()) throw new Error("Please add your profession.");
    if (!f.city) throw new Error("Pick your current city from the list.");
    const g: Gender = s?.gender ?? draft.gender ?? "woman";
    if (!s?.has_profile) {
      const consents = draft.consents ?? [];
      if (!consents.includes("terms_privacy")) { router.replace("/consent"); return; }
      await api().createProfile(name, g, consents);
    }
    const showMe: Gender[] = f.show === "everyone" ? ["woman", "man"] : f.show === "men" ? ["man"] : ["woman"];
    await api().saveBasics({ first_name: name, show_me: showMe, height_cm: Number(f.height_cm), mother_tongue: f.mother_tongue,
      education: f.education, profession: f.profession.trim(), college: f.college, company: f.company, hometown: f.hometown,
      languages: f.languages.split(",").map((x) => x.trim()).filter(Boolean) });
    await api().setCity(f.city, timezoneFor(f.city.lat, f.city.lng));
    await api().setStep(2);
    await api().refresh();
    router.push("/lifestyle");
  });

  return (
    <Screen style={{ gap: 16 }}>
      <StepHeader step={1} back="/consent" />
      <h1 className="h1">Tell us about you</h1>

      <div className="field">
        <label htmlFor="fname" className="label">First name</label>
        <input id="fname" className="input" autoComplete="given-name" maxLength={40} value={f.first_name} onChange={(e) => set("first_name", e.target.value)} />
      </div>

      <Chips label="Show me" fill value={f.show} onChange={(v) => set("show", v)}
        options={[{ v: "men", label: "Men" }, { v: "women", label: "Women" }, { v: "everyone", label: "Everyone" }]} />

      <div className="grid2">
        <div className="field">
          <label htmlFor="height" className="label">Height</label>
          <select id="height" className="input" value={f.height_cm} onChange={(e) => set("height_cm", e.target.value ? Number(e.target.value) : "")}>
            <option value="">Select</option>
            {HEIGHTS.map((h) => <option key={h.cm} value={h.cm}>{h.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tongue" className="label">Mother tongue</label>
          <input id="tongue" className="input" list="tongues" value={f.mother_tongue} onChange={(e) => set("mother_tongue", e.target.value)} />
          <datalist id="tongues">{TONGUES.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
        <div className="field">
          <label htmlFor="edu" className="label">Education</label>
          <select id="edu" className="input" value={f.education} onChange={(e) => set("education", e.target.value)}>
            <option value="">Select</option>{EDU.map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="job" className="label">Profession</label>
          <input id="job" className="input" maxLength={60} value={f.profession} onChange={(e) => set("profession", e.target.value)} />
        </div>
      </div>

      <div className="stack">
        <PlaceInput id="city" label="Current city" value={f.city} onPick={(p) => set("city", p)} placeholder="Start typing your city" />
        <button type="button" className="linkbtn" onClick={useLocation}>Use my current location</button>
        {gps && <span className="small" role="status">{gps}</span>}
      </div>

      {f.more ? (
        <div className="grid2">
          <div className="field"><label htmlFor="langs" className="label">Languages</label>
            <input id="langs" className="input" placeholder="Hindi, English" value={f.languages} onChange={(e) => set("languages", e.target.value)} /></div>
          <div className="field"><label htmlFor="college" className="label">College</label>
            <input id="college" className="input" value={f.college} onChange={(e) => set("college", e.target.value)} /></div>
          <div className="field"><label htmlFor="company" className="label">Company</label>
            <input id="company" className="input" value={f.company} onChange={(e) => set("company", e.target.value)} /></div>
          <div className="field"><label htmlFor="hometown" className="label">Hometown</label>
            <input id="hometown" className="input" value={f.hometown} onChange={(e) => set("hometown", e.target.value)} /></div>
        </div>
      ) : (
        <button type="button" className="linkbtn" onClick={() => set("more", true)}>+ Languages, college, company, hometown (optional)</button>
      )}

      <div className="grow" />
      <ErrorNote error={error} />
      <Primary onClick={submit} busy={busy}>Continue</Primary>
    </Screen>
  );
}
