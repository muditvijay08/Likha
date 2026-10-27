import type { Metadata } from "next";
import Link from "next/link";
import { Crumbs, Faq } from "@/components/site/chrome";
import { InstallButton } from "@/components/site/client";

export const metadata: Metadata = {
  title: "Get the Likha app · Add it to your home screen, no app store needed",
  description: "Likha installs straight from your browser on Android and iPhone: a home-screen icon, full screen, with notifications. No app store download, and it takes a few seconds.",
  alternates: { canonical: "/get-the-app" },
};

export default function GetTheApp() {
  return (
    <>
      <section className="hero"><div className="wrap grid">
        <div className="copy">
          <Crumbs items={[["Likha", "/"], ["Get the app"]]} />
          <h1>Likha on your home screen</h1>
          <p className="lead">No app store needed. Add Likha from your browser in a few seconds: it gets its own icon, opens full screen and sends you notifications.</p>
          <InstallButton />
        </div>
        <img src="/icons/icon-512.png" alt="The Likha app icon" width={260} height={260} style={{ borderRadius: 58, justifySelf: "center", boxShadow: "0 30px 70px rgba(10,6,30,.45)" }} />
      </div></section>
      <section><div className="wrap">
        <div className="grid2s" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 40 }}>
          <div className="prose"><h2 style={{ marginTop: 0 }}>On Android</h2>
            <ol><li>Open <strong>likha.in</strong> in Chrome.</li><li>Tap <strong>Install</strong> when Chrome offers it, or open the <strong>⋮</strong> menu and choose <strong>Install app</strong>.</li><li>Open Likha from your home screen or app drawer.</li></ol></div>
          <div className="prose"><h2 style={{ marginTop: 0 }}>On iPhone</h2>
            <ol><li>Open <strong>likha.in</strong> in Safari.</li><li>Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</li><li>Open Likha from your home screen. Notifications on iPhone work only from there.</li></ol></div>
        </div>
      </div></section>
      <section style={{ paddingTop: 0 }}><div className="wrap narrow">
        <Faq items={[
          ["Is Likha on the Play Store or App Store?", "Not yet. Likha is a web app you add from your browser. It works like a downloaded app: its own icon, full screen and notifications, and it updates by itself."],
          ["Does it take space on my phone?", "Very little: far less than a store app, because it loads what it needs as you use it."],
          ["I already have an account. Do I need to sign in again?", "Usually not: open Likha from the new icon and you'll carry on where you left off. If it asks, sign in with your phone number."],
        ]} />
        <p style={{ marginTop: 20 }}><Link href="/start">Open Likha in your browser</Link></p>
      </div></section>
    </>
  );
}
