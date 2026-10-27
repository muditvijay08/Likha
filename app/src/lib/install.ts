// Adding Likha to the home screen.
// Chrome fires `beforeinstallprompt` once, early, often before the member reaches a screen that offers Install,
// so it's caught app-wide (RegisterSW calls listenForInstall) and kept here for whichever screen asks.
type BIPEvent = Event & { prompt(): Promise<void>; userChoice?: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: BIPEvent | null = null;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

export function listenForInstall() {
  if (typeof window === "undefined" || (window as unknown as { __likhaInstall?: boolean }).__likhaInstall) return;
  (window as unknown as { __likhaInstall?: boolean }).__likhaInstall = true;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BIPEvent; notify(); });
  window.addEventListener("appinstalled", () => { deferred = null; notify(); });
}

export function onInstallChange(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }

/** "installed" when opened from the home screen; "prompt" when the browser can install with one tap; else how to do it by hand. */
export function installState(): "installed" | "prompt" | "ios" | "manual" {
  if (typeof window === "undefined") return "manual";
  if (window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true) return "installed";
  if (deferred) return "prompt";
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : "manual";
}

/** Shows the browser's own install dialog. Returns true if the member accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null; notify();                         // a prompt can be used only once
  await e.prompt();
  const choice = await e.userChoice?.catch(() => null);
  return choice?.outcome === "accepted";
}
