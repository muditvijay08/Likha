"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type OnboardingState } from "./api";
import { useFlow } from "./flow";

/** Signed-in members only. needsProfile: also send people without a profile to the consent step. */
export function useGuard(needsProfile = true): OnboardingState | null {
  const router = useRouter();
  const { reload } = useFlow();
  const [s, setS] = useState<OnboardingState | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      if (!(await api().signedIn())) { router.replace("/start"); return; }
      const st = await reload();
      if (needsProfile && !st.has_profile) { router.replace("/consent"); return; }
      if (live) setS(st);
    })().catch(() => router.replace("/start"));
    return () => { live = false; };
  }, [router, reload, needsProfile]);
  return s;
}
