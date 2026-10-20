"use client";
// O13 Kundli reveal. The chart is built by the kundli service a few seconds after birth details are saved; we poll for it.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { KundliChart, SIGN_HI, signIndex } from "@/components/KundliChart";
import { BackButton, Primary, Screen } from "@/components/ui";
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

  return (
    <Screen style={{ gap: 16 }}>
      <BackButton href="/preferences" />
      {!chart ? (
        <div className="stack" style={{ alignItems: "center", textAlign: "center", gap: 14, paddingTop: 60 }}>
          <span className="spinner" aria-hidden="true" />
          <h1 className="h1">Reading the sky on the day you were born…</h1>
          <p className="sub">{slow ? "Taking longer than usual. You can carry on; we'll show your kundli on Home when it's ready." : "This takes a few seconds."}</p>
          {slow && <Primary onClick={next}>Carry on</Primary>}
        </div>
      ) : (
        <>
          <div className="stack">
            <span className="kicker">YOUR KUNDLI IS READY</span>
            <h1 className="h1">Meet your cosmic self, {s?.first_name}</h1>
          </div>
          <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, borderRadius: 22 }}>
            <KundliChart lagnaSign={signIndex(sm!.lagna)} planets={chart.planets} />
          </div>
          <div className="grid2" style={{ gap: 8 }}>
            {[["Lagna", `${SIGN_HI[sm!.lagna]} (${sm!.lagna})`], ["Moon sign", `${SIGN_HI[sm!.moon_sign]} (${sm!.moon_sign})`],
              ["Nakshatra", `${sm!.nakshatra}, pada ${sm!.pada}`], ["Mahadasha · Manglik", `${chart.dasha?.maha ?? "—"} · ${sm!.manglik ? "Yes" : "No"}`]]
              .map(([k, v]) => <div key={k} className="tile"><span>{k}</span><strong>{v}</strong></div>)}
          </div>
          <div>
            {sm!.borderline && <span className="small" style={{ textAlign: "center" }}>Born close to a boundary: a few minutes&apos; difference in birth time could change one detail.</span>}
          </div>
          <p className="sub" style={{ fontSize: 15, color: "var(--ink)" }}>{LAGNA_LINE[sm!.lagna]}</p>
          <div className="grow" />
          <div className="grid2" style={{ gap: 10 }}>
            <button type="button" className="btn ghost" onClick={share}>Share card</button>
            <Primary onClick={next}>Continue</Primary>
          </div>
        </>
      )}
    </Screen>
  );
}
