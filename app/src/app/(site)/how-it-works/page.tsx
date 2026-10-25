import type { Metadata } from "next";
import Link from "next/link";
import { Crumbs, Cta, Icon } from "@/components/site/chrome";

export const metadata: Metadata = {
  title: "How Likha works · Kundli-matched dating in 4 steps",
  description: "Make your kundli free, see your Guna Milan and Jodi Score on every profile, match and chat, then plan a safe first date. Dating on Likha is free.",
  alternates: { canonical: "/how-it-works" },
};

const STEPS: [string, string, React.ReactNode][] = [
  ["Make your kundli", "Add your birth date, time and place. Likha works out your birth chart from astronomical data: your Lagna, Moon sign, nakshatra and Manglik status. It takes a minute and it's free. Your birth details stay private.", Icon.stars],
  ["See how you match", "Every profile shows your Guna Milan (out of 36) and Jodi Score, worked out from both real charts. Tap any profile to see what works, where you may rub, and why.", Icon.heart],
  ["Like, match and chat", "Like someone; if they like you back, it's a match and the chat opens. For each match, Golden Hours show the best windows for the two of you to talk or meet, from both charts.", Icon.chat],
  ["Plan a safe first date", "Pick a place, share the plan with someone you trust, and Likha checks in afterwards. If you don't answer, your trusted contact gets a text.", Icon.shield],
];

export default function HowItWorks() {
  return (
    <>
      <section><div className="wrap narrow">
        <Crumbs items={[["Likha", "/"], ["How it works"]]} />
        <span className="eyebrow">How it works</span>
        <h1 style={{ marginTop: 10 }}>Kundli milao, dil milao.</h1>
        <p className="lead" style={{ marginTop: 14 }}>Likha is a dating app that starts with your birth chart. Here is everything that happens, from sign-up to first date.</p>
      </div></section>
      <section className="tight"><div className="wrap narrow stack" style={{ gap: 16 }}>
        {STEPS.map(([t, d, icon], i) => (
          <div key={t} className="feature" style={{ flexDirection: "row", gap: 18, alignItems: "flex-start" }}>
            <span className="icon">{icon}</span>
            <div className="stack" style={{ gap: 6 }}><h2 style={{ fontSize: 22 }}>{i + 1}. {t}</h2><p>{d}</p></div>
          </div>))}
      </div></section>
      <section><div className="wrap narrow prose">
        <h2>What&apos;s free, what&apos;s paid</h2>
        <p>Making your kundli, liking, matching and chatting are free. You get a welcome bonus of credits when your profile is complete.
          Extras like detailed readings, Check With Anyone, Boost and Travel Mode use credits, and plans add more likes and features. You always see the price before you pay, and payments go through Razorpay.</p>
        <h2>What makes it different</h2>
        <ul>
          <li><strong>Guna Milan on every profile.</strong> The traditional 36-point match, the same one families and pandits use. <Link href="/kundli-matching">How it works</Link>.</li>
          <li><strong>Jodi Score.</strong> Guna Milan plus other chart factors, so two people with the same Guna total aren&apos;t treated as identical.</li>
          <li><strong>Manglik shown, never a filter.</strong> Some families check it, so we show it. We never hide people because of it. <Link href="/manglik-dosha">Why</Link>.</li>
          <li><strong>No caste filters.</strong> Likha doesn&apos;t ask for or filter by caste.</li>
          <li><strong>Honest about the stars.</strong> A good match is a good start, not a promise. We never predict illness or sell remedies.</li>
        </ul>
      </div></section>
      <Cta />
    </>
  );
}
