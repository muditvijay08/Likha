"use client";
// O5 Lifestyle (step 2)
import { useRouter } from "next/navigation";
import { Chips, ErrorNote, Primary, Screen, StepHeader, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useGuard } from "@/lib/guard";
import { usePersisted } from "@/lib/persist";

const RELIGIONS = ["Hindu", "Jain", "Muslim", "Sikh", "Christian", "Buddhist", "Parsi", "Spiritual", "Not religious", "Other"];

export default function Lifestyle() {
  useGuard();
  const router = useRouter();
  const [f, setF] = usePersisted("lifestyle", {
    diet: null as string | null, drinking: null as string | null, smoking: null as string | null, workout: null as string | null,
    kids: null as string | null, relocate: null as string | null, religionOn: false, religion: "",
  });
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof f, v: string | boolean | null) => setF((o) => ({ ...o, [k]: v }));

  const submit = () => run(async () => {
    if (!f.diet || !f.drinking || !f.smoking) throw new Error("Diet, drinking and smoking are needed for matching.");
    await api().saveLifestyle({ diet: f.diet, drinking: f.drinking, smoking: f.smoking, workout: f.workout, kids: f.kids, relocate: f.relocate,
      religion: f.religionOn && f.religion ? f.religion : null, show_religion: f.religionOn && !!f.religion });
    await api().setStep(3);
    await api().refresh();
    router.push("/birth");
  });

  return (
    <Screen style={{ gap: 16 }}>
      <StepHeader step={2} back="/basics" />
      <h1 className="h1">How you live</h1>
      <Chips small label="Diet" value={f.diet} onChange={(v) => set("diet", v)} options={[{ v: "vegetarian", label: "Vegetarian" }, { v: "jain", label: "Jain" },
        { v: "eggetarian", label: "Eggetarian" }, { v: "non_veg", label: "Non-veg" }, { v: "vegan", label: "Vegan" }]} />
      <Chips small label="Drinking" value={f.drinking} onChange={(v) => set("drinking", v)} options={[{ v: "never", label: "Never" }, { v: "socially", label: "Socially" }, { v: "regularly", label: "Regularly" }]} />
      <Chips small label="Smoking" value={f.smoking} onChange={(v) => set("smoking", v)} options={[{ v: "never", label: "Never" }, { v: "socially", label: "Socially" }, { v: "regularly", label: "Regularly" }]} />
      <Chips small label="Workout" value={f.workout} onChange={(v) => set("workout", v)} options={[{ v: "daily", label: "Daily" }, { v: "often", label: "Often" }, { v: "sometimes", label: "Sometimes" }, { v: "never", label: "Never" }]} />
      <Chips small label="Kids" value={f.kids} onChange={(v) => set("kids", v)} options={[{ v: "want", label: "Want" }, { v: "dont_want", label: "Don't want" }, { v: "have", label: "Have" }, { v: "not_sure", label: "Not sure" }]} />
      <Chips small label="Open to relocating" value={f.relocate} onChange={(v) => set("relocate", v)} options={[{ v: "yes", label: "Yes" }, { v: "maybe", label: "Maybe" }, { v: "no", label: "No" }]} />

      <label htmlFor="religion-on" className="check" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="stack" style={{ gap: 2 }}><strong>Religion (optional)</strong><span className="small">Hidden unless you choose to show it</span></span>
        <input id="religion-on" type="checkbox" checked={f.religionOn} onChange={(e) => set("religionOn", e.target.checked)} />
      </label>
      {f.religionOn && (
        <div className="field">
          <label htmlFor="religion" className="label">Religion</label>
          <select id="religion" className="input" value={f.religion} onChange={(e) => set("religion", e.target.value)}>
            <option value="">Select</option>{RELIGIONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
      )}

      <div className="grow" />
      <div className="small" style={{ textAlign: "center" }}>We never ask about caste.</div>
      <ErrorNote error={error} />
      <Primary onClick={submit} busy={busy}>Continue</Primary>
    </Screen>
  );
}
