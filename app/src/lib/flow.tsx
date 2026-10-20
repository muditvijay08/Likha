"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type Gender, type OnboardingState, type PublicSettings } from "./api";

// The 8 credit steps, in order. Screens outside this list (phone, consent, kundli, install...) have no credit bar.
export const STEPS = [
  { n: 1, path: "/basics" }, { n: 2, path: "/lifestyle" }, { n: 3, path: "/birth" }, { n: 4, path: "/photos" },
  { n: 5, path: "/selfie" }, { n: 6, path: "/vibe" }, { n: 7, path: "/goal" }, { n: 8, path: "/preferences" },
] as const;

/** Where a signed-in member should continue, from the server's view of their profile. */
export function resumePath(s: OnboardingState): string {
  if (!s.has_profile) return "/consent";
  if (!s.city || (s.step ?? 0) < 2) return "/basics";
  if ((s.step ?? 0) < 3) return "/lifestyle";
  if (!s.has_birth) return "/birth";
  if ((s.photos ?? 0) < 2) return "/photos";
  if (s.selfie_status !== "passed" && s.selfie_status !== "pending" && s.selfie_status !== "manual_review") return "/selfie";
  if ((s.prompts ?? 0) < 2) return "/vibe";
  if (!s.goal) return "/goal";
  if (!s.has_prefs) return "/preferences";
  if (s.city.status !== "live") return "/waitlist";
  if ((s.step ?? 0) < 10) return "/kundli";
  if ((s.step ?? 0) < 11) return "/install";
  return "/home";
}

interface Draft { gender?: Gender; phone?: string; consents?: string[]; marketing?: boolean; inviteCode?: string }

interface Flow {
  draft: Draft;
  setDraft(d: Partial<Draft>): void;
  gender: Gender;
  settings: PublicSettings | null;
  state: OnboardingState | null;
  reload(): Promise<OnboardingState>;
  credits(step: number): { earnedBefore: number; thisStep: number; total: number };
}

const Ctx = createContext<Flow | null>(null);
const DRAFT_KEY = "likha-draft";

export function FlowProvider({ children }: { children: ReactNode }) {
  const [draft, setDraftState] = useState<Draft>({});
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [state, setState] = useState<OnboardingState | null>(null);

  useEffect(() => {
    try { setDraftState(JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "{}")); } catch { /* ignore */ }
    api().settings().then(setSettings).catch(() => setSettings(null));
  }, []);

  const setDraft = useCallback((d: Partial<Draft>) => {
    setDraftState((old) => {
      const next = { ...old, ...d };
      try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const reload = useCallback(async () => {
    const s = await api().state();
    setState(s);
    return s;
  }, []);

  const gender: Gender = state?.gender ?? draft.gender ?? "woman";

  useEffect(() => { document.documentElement.dataset.gender = gender; }, [gender]);

  const value = useMemo<Flow>(() => ({
    draft, setDraft, gender, settings, state, reload,
    credits(step: number) {
      const list = settings?.onboarding_step_credits?.[gender] ?? (gender === "woman" ? [19, 19, 18, 19, 19, 18, 19, 19] : [9, 9, 8, 9, 9, 8, 9, 9]);
      return { earnedBefore: list.slice(0, step - 1).reduce((a, b) => a + b, 0), thisStep: list[step - 1] ?? 0,
               total: list.reduce((a, b) => a + b, 0) };
    },
  }), [draft, setDraft, gender, settings, state, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFlow(): Flow {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFlow outside FlowProvider");
  return v;
}
