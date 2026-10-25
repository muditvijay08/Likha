import type { Metadata } from "next";
import Link from "next/link";
import { Crumbs, Faq } from "@/components/site/chrome";
import { PairPicker } from "@/components/site/client";

export const metadata: Metadata = {
  title: "Check your crush · Kundli match with anyone · Likha",
  description: "Your crush, your partner, your boss or a friend: see how your Moon signs get along for free, then invite them to unlock the full kundli match together.",
  alternates: { canonical: "/check-your-crush" },
};

export default function Crush() {
  return (
    <>
      <section className="hero"><div className="wrap grid">
        <div className="copy">
          <Crumbs items={[["Likha", "/"], ["Check your crush"]]} />
          <span className="eyebrow">Check With Anyone</span>
          <h1>Is it written in the stars?</h1>
          <p className="lead">Your crush, your ex, your partner, your boss or your co-founder: see how your stars get along.</p>
          <ol className="prose" style={{ paddingLeft: 20, margin: 0 }}>
            <li>Try two Moon signs here, free.</li>
            <li>In the app, add their name, phone and date of birth for a free Moon-sign preview.</li>
            <li>Send them the invite from your own WhatsApp. The full reading unlocks for both of you once they join and agree.</li>
          </ol>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}><Link className="pill-btn lg" href="/start">Check in the app</Link><Link className="pill-btn lg ghost" href="/compatibility">All Moon-sign pairs</Link></div>
        </div>
        <PairPicker />
      </div></section>
      <section><div className="wrap narrow">
        <div className="sec-head"><h2>Questions</h2></div>
        <Faq items={[
          ["Will they know I checked?", "Only if you send them the invite. Likha never messages them on its own. The invite says someone checked their kundli match with them; you choose whether to tell them it was you."],
          ["Do I need their birth time?", "No. Their date of birth is enough for the free Moon-sign preview. The full reading uses their own birth details once they join."],
          ["What do they share with me?", "Only the reading you both agree to see. They never see your birth details, and you never see theirs."],
        ]} />
      </div></section>
    </>
  );
}
