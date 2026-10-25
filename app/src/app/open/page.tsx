"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { resumePath } from "@/lib/flow";

// The installed app opens here (manifest start_url): signed-in members resume where they left off, others start sign-up.
export default function Entry() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      if (!(await api().signedIn())) return router.replace("/start");
      router.replace(resumePath(await api().state()));
    })().catch(() => router.replace("/start"));
  }, [router]);
  return <main className="screen" style={{ alignItems: "center", justifyContent: "center" }}><span className="spinner" aria-label="Loading" /></main>;
}
