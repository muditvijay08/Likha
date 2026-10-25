import type { Metadata } from "next";
import Link from "next/link";
import { Crumbs, Cta, Icon } from "@/components/site/chrome";

export const metadata: Metadata = {
  title: "Safety on Likha · Real people, women-first controls, safe dates",
  description: "Phone sign-up and a selfie step for every member, women-first privacy controls, date sharing with check-ins, SOS, and a safety team behind every report.",
  alternates: { canonical: "/safety" },
};

const ITEMS: [string, string, React.ReactNode][] = [
  ["Real people only", "Everyone signs up with their own mobile number and takes a selfie at sign-up. Likha never creates fake profiles. Saathi, our practice companion, is always clearly shown as a virtual companion, not a person.", Icon.users],
  ["Women-first controls", "Women can choose to message first, so matches can't open the chat. Anyone can go incognito (only people you've liked can see you) and hide their company.", Icon.shield],
  ["Share your date", "Before a date, pick someone you trust and share where and when. After the date Likha checks in; if you don't answer, they get a text asking them to call you.", Icon.heart],
  ["SOS", "Call 112 first with one tap, then send people you trust a live-location link that works for two hours. The match is flagged for urgent review.", Icon.sun],
  ["Report and block", "Report or block anyone from their profile or chat. Our safety team reviews every report, and serious ones are acted on fast.", Icon.chat],
  ["Your data stays yours", "Your birth date, time and place are never shown to anyone. Delete your account any time from Settings. A Grievance Officer handles complaints under India's IT Rules.", Icon.stars],
];

export default function Safety() {
  return (
    <>
      <section><div className="wrap narrow">
        <Crumbs items={[["Likha", "/"], ["Safety"]]} />
        <span className="eyebrow">Safety</span>
        <h1 style={{ marginTop: 10 }}>Feel safe from the first hello to the first date.</h1>
        <p className="lead" style={{ marginTop: 14 }}>Safety is built into Likha, not added later. Here&apos;s what protects you.</p>
      </div></section>
      <section className="tight"><div className="wrap"><div className="grid3">
        {ITEMS.map(([t, d, icon]) => <div key={t} className="feature"><span className="icon v">{icon}</span><h3>{t}</h3><p>{d}</p></div>)}
      </div></div></section>
      <section><div className="wrap narrow prose">
        <h2>First-date tips</h2>
        <ul>
          <li>Meet in a busy public place, and get there and back on your own.</li>
          <li>Share your date in the app, so someone you trust knows where you are.</li>
          <li>Keep the chat on Likha until you trust the person. Never send money to someone you haven&apos;t met.</li>
          <li>If something feels wrong, leave. In an emergency call 112.</li>
        </ul>
        <p>Need help or want to complain? <Link href="/help">Contact us or our Grievance Officer</Link>.</p>
      </div></section>
      <Cta />
    </>
  );
}
