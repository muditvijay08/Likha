import type { Metadata } from "next";
import Link from "next/link";
import { Crumbs, Cta, Faq, RashiLinks } from "@/components/site/chrome";
import { MoonSignTool } from "@/components/site/client";

export const metadata: Metadata = {
  title: "Moon sign calculator · Find your rashi from your date of birth",
  description: "Free Moon sign (rashi) finder: enter your date of birth, and your birth time if you know it, to find your Vedic Moon sign and nakshatra. Sidereal (Lahiri), Indian time.",
  alternates: { canonical: "/moon-sign-calculator" },
};

export default function MoonSign() {
  return (
    <>
      <section className="hero"><div className="wrap grid">
        <div className="copy">
          <Crumbs items={[["Likha", "/"], ["Guides"], ["Moon sign calculator"]]} />
          <span className="eyebrow">Free tool</span>
          <h1>Find your Moon sign</h1>
          <p className="lead">In Vedic astrology your rashi is the sign the Moon was in when you were born, not your Sun sign. It&apos;s the sign used for kundli matching.</p>
        </div>
        <MoonSignTool />
      </div></section>
      <section className="tight"><div className="wrap narrow prose">
        <h2>Why it can differ from your "star sign"</h2>
        <p>Magazine horoscopes use your Sun sign, in the tropical zodiac. Vedic astrology uses the sidereal zodiac (here with the Lahiri ayanamsa) and puts the Moon first, because it moves fast and reflects your mind and feelings.
          So someone who reads Leo in a magazine may well be a Kanya (Virgo) or Meen (Pisces) Moon.</p>
        <p>This tool is approximate. Your full kundli on Likha uses your exact birth time and place. <Link href="/kundli-matching">How matching uses your Moon sign</Link>.</p>
      </div></section>
      <section><div className="wrap narrow">
        <Faq items={[
          ["Can I find my Moon sign without a birth time?", "Usually, yes. The Moon spends about two and a half days in each sign, so most dates give one clear sign. On the day it changes sign, you'll need your birth time."],
          ["What's the difference between rashi and nakshatra?", "Your rashi is one of 12 signs. Your nakshatra is one of 27 birth stars, finer divisions of the same circle. Kundli matching uses both."],
        ]} />
      </div></section>
      <RashiLinks />
      <Cta />
    </>
  );
}
