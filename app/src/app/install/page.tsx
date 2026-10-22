"use client";
// O14 Install and notifications
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BackButton, Primary, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useFlow } from "@/lib/flow";
import { useGuard } from "@/lib/guard";
import { enablePush } from "@/lib/push";

type BIPEvent = Event & { prompt(): Promise<void> };

export default function Install() {
  useGuard();
  const router = useRouter();
  const { state } = useFlow();
  const [ios, setIos] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [bip, setBip] = useState<BIPEvent | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
    const h = (e: Event) => { e.preventDefault(); setBip(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  async function finish() { await api().setStep(11); router.push("/bonus"); }

  async function notifications() {
    setBusy(true);
    try {
      if (bip) { await bip.prompt(); setBip(null); }
      const r = await enablePush().catch(() => "unsupported" as const);
      if (r === "denied") setMsg("Notifications are blocked. You can turn them on later in your browser settings.");
      if (r === "ios-needs-install") { setMsg("On iPhone, add Likha to your Home Screen first, then open it from there."); return; }
      await finish();
    } finally { setBusy(false); }
  }

  const steps = ios
    ? [<>Tap <strong>Share</strong> at the bottom of Safari</>, <>Choose <strong>Add to Home Screen</strong></>, <>Open Likha from your home screen</>]
    : [<>Tap <strong>Install</strong> when your browser asks, or the <strong>⋮</strong> menu</>, <>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong></>, <>Open Likha from your home screen</>];
  const initial = state?.first_name?.[0] ?? "A";

  return (
    <Screen style={{ gap: 18 }}>
      <BackButton href="/kundli" />
      <div className="stack">
        <h1 className="h1 big">Keep your stars close</h1>
        <p className="sub">Add Likha to your home screen.{ios ? " On iPhone, notifications only work after this." : ""}</p>
      </div>
      {!standalone && (
        <ol className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 10 }}>
          {steps.map((t, i) => (
            <li key={i} className="check" style={{ alignItems: "center", cursor: "default" }}>
              <span style={{ width: 28, height: 28, flex: "none", borderRadius: 999, background: "var(--saffron-soft)", color: "var(--saffron-ink)", fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
              <span style={{ fontSize: 14 }}>{t}</span>
            </li>
          ))}
        </ol>
      )}
      <section aria-label="Notification preview" className="stack" style={{ gap: 10, padding: 14, borderRadius: 20, background: "#EDE6FF" }}>
        <span className="label">What you&apos;ll get</span>
        {[["Likha · 7:00 AM", "Good morning. Your stars have tea to spill. Today's Kick is ready."], ["Likha · now", "Someone with 94% compatibility just liked you"]].map(([h, b]) => (
          <div key={h} className="card row" style={{ gap: 12, alignItems: "flex-start" }}>
            <span style={{ width: 36, height: 36, flex: "none", borderRadius: 10, background: "var(--g-soft)", color: "var(--g-ink)", fontFamily: "var(--serif)",
              fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>{initial}</span>
            <span className="stack" style={{ gap: 2 }}><strong style={{ fontSize: 13 }}>{h}</strong><span style={{ fontSize: 14 }}>{b}</span></span>
          </div>
        ))}
        <span className="small">Samples. You choose which ones you get in Settings.</span>
      </section>
      <div className="grow" />
      {msg && <div className="note" role="status">{msg}</div>}
      <Primary onClick={notifications} busy={busy}>Turn on notifications</Primary>
      <button type="button" className="btn text" style={{ textDecoration: "underline" }} onClick={finish}>Maybe later</button>
    </Screen>
  );
}
