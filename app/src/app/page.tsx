"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { resumePath } from "@/lib/flow";

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
