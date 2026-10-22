"use client";
// Web push through OneSignal. The app id comes from Admin > Keys (public_settings), or NEXT_PUBLIC_ONESIGNAL_APP_ID.
// OneSignal's worker lives in /push/onesignal/ so it never replaces the app's own service worker (sw.js).
// This device's subscription id is saved to the signed-in member (claim_push_token) and released on sign-out.
import { api } from "./api";

type Result = "granted" | "denied" | "unsupported" | "ios-needs-install" | "not-set-up";
type OS = { init(o: unknown): Promise<void>; Notifications: { requestPermission(): Promise<void>; permission: boolean };
  User?: { PushSubscription?: { id?: string | null; addEventListener?(e: string, f: () => void): void } } };

declare global { interface Window { OneSignalDeferred?: ((os: OS) => void)[] } }
const SAVED = "likha-push-device";
let ready: Promise<OS> | null = null;

async function appId(): Promise<string | null> {
  const s = await api().settings().catch(() => null);
  return s?.public_keys?.onesignal_app_id || process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || null;
}

function oneSignal(id: string): Promise<OS> {
  return ready ??= new Promise<OS>((ok, fail) => {
    if (!document.getElementById("onesignal-sdk")) {
      const s = document.createElement("script");
      s.id = "onesignal-sdk"; s.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"; s.defer = true; s.onerror = () => fail(new Error("push script blocked"));
      document.head.appendChild(s);
    }
    (window.OneSignalDeferred = window.OneSignalDeferred || []).push(async (OS) => {
      await OS.init({ appId: id, serviceWorkerPath: "push/onesignal/OneSignalSDKWorker.js", serviceWorkerParam: { scope: "/push/onesignal/" }, allowLocalhostAsSecureOrigin: true });
      ok(OS);
    });
  });
}

async function save(OS: OS) {
  const id = OS.User?.PushSubscription?.id;
  if (!id) return;
  try { if (localStorage.getItem(SAVED) === id) return; } catch { /* private mode */ }
  await api().savePushToken(id);
  try { localStorage.setItem(SAVED, id); } catch { /* private mode */ }
}

/** "Turn on notifications" button. */
export async function enablePush(): Promise<Result> {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  if (ios && !standalone) return "ios-needs-install";
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  const id = await appId();
  if (!id) return "not-set-up";
  const OS = await oneSignal(id);
  await OS.Notifications.requestPermission();
  await save(OS);
  OS.User?.PushSubscription?.addEventListener?.("change", () => { save(OS).catch(() => {}); });
  return OS.Notifications.permission ? "granted" : "denied";
}

/** On each visit: if the member already allowed notifications, keep this device linked to them. Never asks. */
export async function syncPush() {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
  const id = await appId(); if (!id) return;
  try { const OS = await oneSignal(id); await save(OS); } catch { /* blocked or offline */ }
}

/** Signing out: this device stops getting this member's notifications. */
export async function releasePush() {
  let id: string | null = null;
  try { id = localStorage.getItem(SAVED); localStorage.removeItem(SAVED); } catch { /* private mode */ }
  if (id) await api().releasePushToken(id).catch(() => {});
}
