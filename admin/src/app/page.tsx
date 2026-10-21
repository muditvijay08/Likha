"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  useEffect(() => { api().me().then((m) => router.replace(!m || !m.mfa ? "/login" : "/dashboard")).catch(() => router.replace("/login")); }, [router]);
  return <div className="center"><div className="skel" style={{ width: 320, height: 120 }} /></div>;
}
