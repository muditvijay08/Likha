"use client";
// O13 Kundli reveal. The chart is built by the kundli service a few seconds after birth details are saved; we poll for it.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { KundliChart, SIGN_HI, signIndex } from "@/components/KundliChart";
import { BackButton, Primary, Screen } from "@/components/ui";
import { Button, NightSky, Rise } from "@/components/kit";
import { api, type MyChart } from "@/lib/api";
import { useGuard } from "@/lib/guard";

// One warm line per Lagna. Written by us, reviewed by the astrologer; never generated on the fly.
const LAGNA_LINE: Record<string, string> = {
  Aries: "Brave starter, quick heart. You do best with someone who keeps up and calms you down.",
  Taurus: "Steady, loyal, a little stubborn. You do best with someone who shows love in small daily ways.",
  Gemini: "Curious talker, endless ideas. You do best with someone who loves a good conversation.",
  Cancer: "Caring and protective. You do best with someone who makes home feel safe.",
  Leo: "Warm leader, soft heart. You love big plans and quiet evenings. You do best with someone patient who laughs easily.",
  Virgo: "Thoughtful and dependable. You do best with someone who notices the effort you put in.",
  Libra: "Charming and fair. You do best with someone who values balance and kindness.",
  Scorpio: "Deep, intense, fiercely loyal. You do best with someone honest who isn't scared of feelings.",
  Sagittarius: "Free spirit, big laugh. You do best with someone who loves adventure as much as you do.",
  Capricorn: "Grounded and ambitious. You do best with someone who respects your goals and makes you rest.",
  Aquarius: "Original thinker, friend to all. You do best with someone who gives you space and shares your causes.",
  Pisces: "Dreamy and kind. You do best with someone gentle who keeps your feet on the ground.",
};

export default function Kundli() {
  const s = useGuard();
  const router = useRouter();
  const [chart, setChart] = useState<MyChart | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let live = true; let tries = 0;
    const tick = async () => {
      const c = await api().myChart().catch(() => null);
      if (!live) return;
      if (c) { setChart(c); return; }
      tries++; if (tries > 15) setSlow(true);
      setTimeout(tick, tries < 10 ? 1500 : 4000);
    };
    tick();
    return () => { live = false; };
  }, []);

  async function next() { await api().setStep(10); router.push("/install"); }

  async function share() {
    if (!chart) return;
    const text = `My Likha kundli: ${chart.summary.lagna} Lagna, ${chart.summary.moon_sign} Moon, ${chart.summary.nakshatra} nakshatra. Find yours on likha.in`;
    try { if (navigator.share) await navigator.share({ text }); else await navigator.clipboard.writeText(text); } catch { /* cancelled */ }
  }

  const sm = chart?.summary;
  const [card, setCard] = useState(false);

  if (!chart) return (
    <Screen style={{ gap: 16 }}>
      <BackButton href="/preferences" />
      <div className="stack" style={{ alignItems: "center", textAlign: "center", gap: 14, paddingTop: 60 }}>
        <span className="spinner" aria-hidden="true" />
        <h1 className="h1">Reading the sky on the day you were born…</h1>
        <p className="sub">{slow ? "Taking longer than usual. You can carry on; we'll show your kundli on Home when it's ready." : "This takes a few seconds."}</p>
        {slow && <Primary onClick={next}>Carry on</Primary>}
      </div>
    </Screen>
  );

  const facts: [string, string, string][] = [
    ["Lagna", SIGN_HI[sm!.lagna], sm!.lagna], ["Moon sign", SIGN_HI[sm!.moon_sign], sm!.moon_sign],
    ["Nakshatra", sm!.nakshatra, `pada ${sm!.pada}`], ["Mahadasha now", chart.dasha?.maha ?? "–", sm!.manglik ? "Manglik" : "Not Manglik"],
  ];
  return (
    <NightSky className="min-h-dvh" seed={signIndex(sm!.lagna) + 3}>
      <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-5 px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-5">
        <BackButton href="/preferences" />
        <Rise className="flex flex-col gap-2">
          <span className="font-sans text-xs font-bold tracking-[.14em] text-[var(--star)]">YOUR KUNDLI IS READY</span>
          <h1 className="m-0 font-serif text-[32px] font-[560] leading-[1.1] tracking-[-0.01em] text-white [text-wrap:balance]">Meet your cosmic self, {s?.first_name}</h1>
        </Rise>
        {chart.time_approx && <p className="sample-note" role="note">Worked out from an approximate time of day. Your matches see &ldquo;Approx. time&rdquo;. Add the exact time once in My Kundli when you find it.</p>}
        {chart.sample_birth && <p className="sample-note" role="note">Sample chart (demo mode): worked out by the real engine for {chart.sample_birth.date}, {chart.sample_birth.time}, {chart.sample_birth.place}, not from the details you typed.</p>}
        <div className="flex justify-center py-1">
          <KundliChart lagnaSign={signIndex(sm!.lagna)} planets={chart.planets} tone="night" draw size={260} />
        </div>
        <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-white/15 py-4">
          {facts.map(([k, big, small]) => (
            <div key={k} className="flex min-w-0 flex-col gap-0.5">
              <dt className="font-sans text-[11px] font-bold tracking-[.1em] text-[#CFC6F2]">{k.toUpperCase()}</dt>
              <dd className="m-0 font-serif text-xl font-[560] text-white">{big}</dd>
              <dd className="m-0 font-sans text-[13px] text-[#CFC6F2]">{small}</dd>
            </div>
          ))}
        </dl>
        {sm!.borderline && <span className="font-sans text-[13px] text-[#CFC6F2]">Born close to a boundary: a few minutes&apos; difference in birth time could change one detail.</span>}
        <p className="m-0 font-sans text-base leading-relaxed text-white/90">{LAGNA_LINE[sm!.lagna]}</p>
        <div className="grow" />
        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="night" onClick={() => setCard(true)}>Story card</Button>
          <Button onClick={next}>Continue</Button>
        </div>
      </main>
      {card && (
        <div role="dialog" aria-modal="true" aria-label="Your kundli story card" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/70 p-6"
          onClick={() => setCard(false)}>
          <NightSky seed={signIndex(sm!.moon_sign) + 11} className="aspect-[9/16] w-full max-w-[300px] rounded-[28px] border border-white/15 shadow-2xl">
            <div className="flex h-full flex-col items-center justify-between gap-3 p-6 text-center">
              <span className="font-serif text-2xl font-[560]">Likha<span className="text-action">.</span></span>
              <KundliChart lagnaSign={signIndex(sm!.lagna)} planets={chart.planets} tone="night" size={210} />
              <div className="flex flex-col gap-1">
                <span className="font-serif text-[26px] font-[560]">{SIGN_HI[sm!.moon_sign]} Moon</span>
                <span className="font-sans text-sm text-[#CFC6F2]">{sm!.nakshatra} nakshatra · {SIGN_HI[sm!.lagna]} Lagna</span>
              </div>
              <span className="font-sans text-xs font-bold tracking-[.12em] text-[var(--star)]">FIND YOURS ON LIKHA.IN</span>
            </div>
          </NightSky>
          <span className="font-sans text-sm text-white/85">Screenshot it for your story, or share the text.</span>
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <Button variant="night" size="md" onClick={share}>Share text</Button>
            <Button variant="night" size="md" onClick={() => setCard(false)}>Close</Button>
          </div>
        </div>
      )}
    </NightSky>
  );
}
