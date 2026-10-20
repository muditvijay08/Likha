"use client";
// Web push. With NEXT_PUBLIC_ONESIGNAL_APP_ID set, OneSignal handles subscriptions and we store its id as the push token.
import { api } from "./api";

type Result = "granted" | "denied" | "unsupported" | "ios-needs-install";

declare global { interface Window { OneSignalDeferred?: unknown[] } }

export async function enablePush(): Promise<Result> {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  if (ios && !standalone) return "ios-needs-install";
  if (!("Notification" in window)) return "unsupported";

  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  if (appId) {
    await new Promise<void>((ok) => {
      if (document.getElementById("onesignal-sdk")) return ok();
      const s = document.createElement("script");
      s.id = "onesignal-sdk"; s.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"; s.defer = true; s.onload = () => ok();
      document.head.appendChild(s);
    });
    return await new Promise<Result>((ok) => {
      (window.OneSignalDeferred = window.OneSignalDeferred || []).push(async (OneSignal: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        await OneSignal.init({ appId, serviceWorkerPath: "/OneSignalSDKWorker.js" });
        await OneSignal.Notifications.requestPermission();
        const id = OneSignal.User?.PushSubscription?.id as string | undefined;
        if (id) await api().savePushToken(id);
        ok(OneSignal.Notifications.permission ? "granted" : "denied");
      });
    });
  }
  const p = await Notification.requestPermission();
  return p === "granted" ? "granted" : "denied";
}
