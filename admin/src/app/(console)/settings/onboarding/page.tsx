"use client";
// I18 Onboarding. The credit slider on each step must add up to the welcome bonus, so both are published together.
import { useEffect, useState } from "react";
import { useAction, useAdmin } from "@/components/shell";
import { SettingsForm } from "@/components/settings-form";
import { Page, useLoad } from "@/components/ui";
import { api } from "@/lib/api";

const STEPS = ["Basics", "Lifestyle", "Birth details", "Photos", "Selfie", "About you", "Goal", "Preferences"];
type Steps = Record<"woman" | "man", number[]>;
type Bonus = Record<"woman" | "man", number> & Record<string, number>;

function StepCredits({ can }: { can: boolean }) {
  const { toast } = useAdmin();
  const { data, reload } = useLoad(() => api().settings(["onboarding_step_credits", "welcome_bonus"]));
  const [steps, setSteps] = useState<Steps | null>(null); const [bonus, setBonus] = useState<Bonus | null>(null);
  const [note, setNote] = useState(""); const act = useAction();
  useEffect(() => { if (data) { setSteps(structuredClone(data.onboarding_step_credits.value as Steps)); setBonus(structuredClone(data.welcome_bonus.value as Bonus)); } }, [data]);
  if (!data || !steps || !bonus) return <div className="skel" style={{ height: 260 }} />;
  const sum = (g: "woman" | "man") => steps[g].reduce((a, b) => a + b, 0);
  const ok = sum("woman") === bonus.woman && sum("man") === bonus.man;
  const dirty = JSON.stringify(steps) !== JSON.stringify(data.onboarding_step_credits.value) || JSON.stringify(bonus) !== JSON.stringify(data.welcome_bonus.value);
  return (
    <section className="card stack" aria-label="Step credits">
      <h2>Credits shown on each step</h2>
      <p className="sub">Members see “+19 credits” on each step. Nothing is paid until the profile is complete and the selfie passes; then the full welcome bonus is paid once.</p>
      <table className="t"><thead><tr><th>Step</th><th>Women</th><th>Men</th></tr></thead><tbody>
        {STEPS.map((s, i) => <tr key={s}><td>{i + 1}. {s}</td>{(["woman", "man"] as const).map((g) => <td key={g}>
          <input className="input" type="number" min={0} aria-label={`${s} credits ${g}`} value={steps[g][i]} disabled={!can} style={{ width: 80 }}
            onChange={(e) => setSteps({ ...steps, [g]: steps[g].map((x, j) => (j === i ? Number(e.target.value) : x)) })} /></td>)}</tr>)}
        <tr><td><strong>Adds up to</strong></td>{(["woman", "man"] as const).map((g) => <td key={g}><strong style={{ color: sum(g) === bonus[g] ? "inherit" : "var(--red)" }}>{sum(g)}</strong></td>)}</tr>
        <tr><td><strong>Welcome bonus</strong></td>{(["woman", "man"] as const).map((g) => <td key={g}>
          <input className="input" type="number" min={0} aria-label={`Welcome bonus ${g}`} value={bonus[g]} disabled={!can} style={{ width: 80 }}
            onChange={(e) => setBonus({ ...bonus, [g]: Number(e.target.value) })} /></td>)}</tr>
      </tbody></table>
      {!ok && <p className="err" role="alert">The steps must add up to the welcome bonus for both women and men.</p>}
      {can && dirty && <div className="row"><input className="input grow" aria-label="Step credits note" placeholder="Why?" value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className="btn sm" disabled={!ok || act.busy || note.trim().length < 3}
          onClick={() => act.run(async () => { await api().saveSettings({ onboarding_step_credits: steps, welcome_bonus: bonus }, note); setNote(""); toast("Step credits published"); reload(); })}>Publish</button></div>}
      {act.error && <p className="err" role="alert">{act.error}</p>}
    </section>
  );
}

export default function OnboardingPage() {
  const { me } = useAdmin();
  const can = me.perms.includes("settings.write");
  return (
    <Page title="Onboarding" sub="The sign-up steps. Consent boxes always start unticked.">
      <div className="split">
        <StepCredits can={can} />
        <div className="stack" style={{ gap: 16 }}>
          <SettingsForm title="Who can join" canEdit={can} fields={[
            { key: "min_age", label: "Minimum age", unit: "number", locked: true, hint: "Fixed at 18 by law." },
            { key: "max_age_filter", label: "Oldest age in filters", unit: "number" },
            { key: "gender_options", label: "Options on the first screen", unit: "list" }]} />
          <SettingsForm title="Profile rules" canEdit={can} fields={[
            { key: "photos", path: "min", label: "Photos needed", unit: "number" }, { key: "photos", path: "max", label: "Most photos", unit: "number" },
            { key: "prompts", path: "required", label: "Prompts to answer", unit: "number" }, { key: "prompts", path: "max_length", label: "Longest answer", unit: "number", hint: "letters" },
            { key: "prompts", path: "interests_min", label: "Interests to pick (fewest)", unit: "number" }, { key: "prompts", path: "interests_max", label: "Interests to pick (most)", unit: "number" },
            { key: "selfie", path: "pass_score", label: "Selfie match score to pass", unit: "number" }, { key: "selfie", path: "max_tries", label: "Selfie tries", unit: "number" },
            { key: "birth_corrections_free", label: "Free birth-detail corrections", unit: "number" }]} />
        </div>
      </div>
    </Page>
  );
}
