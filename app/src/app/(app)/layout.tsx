"use client";
// Shell for every screen with the bottom navigation. Only active members get here; everyone else goes back to onboarding.
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppProvider, BottomNav } from "@/components/app";
import { api } from "@/lib/api";
import { resumePath } from "@/lib/flow";
import { useGuard } from "@/lib/guard";

export default function AppLayout({ children }: { children: ReactNode }) {
  const s = useGuard();
  const router = useRouter();
  const ready = s?.status === "active";
  useEffect(() => { if (s && !ready) router.replace(resumePath(s) === "/home" ? "/bonus" : resumePath(s)); }, [s, ready, router]);
  if (!ready) return <main className="app" aria-busy="true"><div className="app-body"><div className="skel" style={{ height: 120 }} /></div></main>;
  return (
    <AppProvider>
      <div className="app">
        {api().demo && <div className="demo-bar" role="note">Demo mode · sample profiles, not real people</div>}
        {children}
      </div>
      <BottomNav />
    </AppProvider>
  );
}
