"use client";
// Shell for every screen with the bottom navigation. Only active members get here; everyone else goes back to onboarding.
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppProvider, BottomNav, FeatureGate, useApp } from "@/components/app";
import { api } from "@/lib/api";
import { ConsentGate } from "@/components/gates";
import { resumePath } from "@/lib/flow";
import { useGuard } from "@/lib/guard";
import { takeClaim } from "@/lib/referral";

/** A Check With Anyone or gift link opened before signing up: claim it now and open the reading. */
function PendingClaim() {
  const router = useRouter();
  const { toast } = useApp();
  useEffect(() => {
    const c = takeClaim(); if (!c) return;
    (c.type === "crush" ? api().claimCrush(c.token) : api().openGift(c.token))
      .then((id) => router.push(`/readings/${id}`)).catch((e: Error) => toast(e.message));
  }, [router, toast]);
  return null;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const s = useGuard();
  const router = useRouter();
  const path = usePathname();
  const ready = s?.status === "active";
  useEffect(() => {
    if (!s || ready) return;
    if (s.status && ["suspended", "banned", "under_review"].includes(s.status)) router.replace("/account-status");
    else if (s.status === "deleted") api().signOut().then(() => router.replace("/start"));
    else router.replace(resumePath(s) === "/home" ? "/bonus" : resumePath(s));
  }, [s, ready, router]);
  if (!ready) return <main className="app" aria-busy="true"><div className="app-body"><div className="skel" style={{ height: 120 }} /></div></main>;
  return (
    <AppProvider>
      <PendingClaim />
      <div className="app">
        {api().demo && <div className="demo-bar" role="note">Demo mode · sample profiles, not real people</div>}
        <ConsentGate><FeatureGate path={path}>{children}</FeatureGate></ConsentGate>
      </div>
      <BottomNav />
    </AppProvider>
  );
}
