"use client";
import { useEffect } from "react";
import { listenForInstall } from "@/lib/install";
export function RegisterSW() {
  useEffect(() => {
    listenForInstall();
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
