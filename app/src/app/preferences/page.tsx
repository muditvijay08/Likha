"use client";
// O11 Preferences (step 8). Then: live city -> kundli reveal, otherwise -> waitlist.
import { useRouter } from "next/navigation";
import { ErrorNote, Primary, Screen, StepHeader, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useGuard } from "@/lib/guard";
import { usePersisted } from "@/lib/persist";

const DIETS = [{ v: "vegetarian", label: "Vegetarian" }, { v: "jain", label: "Jain" }, { v: "eggetarian", label: "Eggetarian" }, { v: "non_veg", label: "Non-veg" }];

export default function Preferences() {
  const s = useGuard();
  const router = useRouter();
  const [f, setF] = usePersisted("prefs", { min: 24, max: 31, distance: "same_city" as "same_city" | "any_city", diets: [] as string[] });
  const { busy, error, run } = useAction();
  const city = s?.city?.name ?? "your city";
  const live = s?.city?.status === "live";

  const lo = 18, hi = 60;
  const left = ((f.min - lo) / (hi - lo)) * 100, right = ((f.max - lo) / (hi - lo)) * 100;

  const submit = () => run(async () => {
    await api().savePrefs({ age_min: f.min, age_max: f.max, distance: f.distance, diets: f.diets });
    await api().setStep(9);
    await api().refresh();
    router.push(live ? "/kundli" : "/waitlist");
  });

  return (
    <Screen style={{ gap: 18 }}>
      <StepHeader step={8} back="/goal" last />
      <h1 className="h1">Who should we show you?</h1>

      <div className="stack">
        <div className="row" style={{ justifyContent: "space-between" }}><span className="label">Age range</span><strong style={{ fontSize: 14 }}>{f.min} to {f.max}</strong></div>
        <div className="range">
          <div className="rail" /><div className="sel" style={{ left: `${left}%`, width: `${right - left}%` }} />
          <input type="range" aria-label="Youngest age" min={lo} max={hi} value={f.min} onChange={(e) => setF({ ...f, min: Math.min(Number(e.target.value), f.max - 1) })} />
          <input type="range" aria-label="Oldest age" min={lo} max={hi} value={f.max} onChange={(e) => setF({ ...f, max: Math.max(Number(e.target.value), f.min + 1) })} />
        </div>
      </div>

      <div className="stack">
        <span className="label">Distance</span>
        <div role="radiogroup" aria-label="Distance" className="seg">
          {([["same_city", "Same city"], ["any_city", "Any city"]] as const).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={f.distance === v} onClick={() => setF({ ...f, distance: v })}>{l}</button>
          ))}
        </div>
        <span className="small">{f.distance === "same_city" ? `Same city shows people in ${city} only.` : "Any city shows people across live cities, nearest first."}</span>
      </div>

      <div className="stack">
        <span className="label">Diet</span>
        <div className="chips">
          <button type="button" className="chip sm" aria-pressed={f.diets.length === 0} onClick={() => setF({ ...f, diets: [] })}>Any</button>
          {DIETS.map((d) => (
            <button key={d.v} type="button" className="chip sm" aria-pressed={f.diets.includes(d.v)}
              onClick={() => setF({ ...f, diets: f.diets.includes(d.v) ? f.diets.filter((x) => x !== d.v) : [...f.diets, d.v] })}>{d.label}</button>
          ))}
        </div>
      </div>

      <div className="small">Manglik status shows on profiles. It&apos;s never used as a filter.</div>
      <div className="grow" />
      <ErrorNote error={error} />
      <Primary onClick={submit} busy={busy}>{live ? "Build my kundli" : "Continue"}</Primary>
      {s && !live && <span className="small" style={{ textAlign: "center" }}>{city} isn&apos;t live yet. You&apos;ll join its waitlist.</span>}
    </Screen>
  );
}
