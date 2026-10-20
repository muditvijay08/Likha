import type { ChartPlanet } from "@/lib/api";

const ABBR: Record<string, string> = { Sun: "Su", Moon: "Mo", Mars: "Ma", Mercury: "Me", Jupiter: "Ju", Venus: "Ve", Saturn: "Sa", Rahu: "Ra", Ketu: "Ke" };
const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

// North Indian chart: houses are fixed diamonds, sign numbers rotate with the Lagna. [x, y] of the sign number and of the planets.
const HOUSE_POS: [number, number, number, number][] = [
  [110, 42, 110, 62], [55, 16, 55, 32], [16, 58, 22, 72], [55, 98, 55, 118], [16, 168, 22, 150], [55, 210, 55, 196],
  [110, 152, 110, 170], [165, 210, 165, 194], [204, 168, 198, 152], [165, 98, 165, 118], [204, 58, 198, 72], [165, 16, 165, 30],
];

/** lagnaSign: 0 = Aries. Planets in the Moon's house are highlighted. */
export function KundliChart({ lagnaSign, planets, size = 230 }: { lagnaSign: number; planets: ChartPlanet[]; size?: number }) {
  const byHouse = new Map<number, string[]>();
  for (const p of planets) {
    const list = byHouse.get(p.house) ?? [];
    list.push(ABBR[p.planet] ?? p.planet.slice(0, 2));
    byHouse.set(p.house, list);
  }
  const moonHouse = planets.find((p) => p.planet === "Moon")?.house;
  return (
    <svg width={size} height={size} viewBox="-5 -5 230 230" role="img" aria-label={`North Indian birth chart, ${SIGNS[lagnaSign]} ascendant`}>
      <rect x="0" y="0" width="220" height="220" fill="#FFF9EC" stroke="#E07B00" strokeWidth="1.5" />
      <path d="M0 0L220 220M220 0L0 220M110 0L220 110L110 220L0 110Z" fill="none" stroke="#E07B00" strokeWidth="1.2" />
      {HOUSE_POS.map(([nx, ny, px, py], i) => {
        const house = i + 1;
        const sign = ((lagnaSign + i) % 12) + 1;
        const names = (house === 1 ? ["Asc"] : []).concat(byHouse.get(house) ?? []);
        return (
          <g key={house}>
            <text x={nx} y={ny} textAnchor="middle" fontSize="10" fill="#8A4300">{sign}</text>
            {names.length > 0 && (
              <text x={px} y={py} textAnchor="middle" fontSize="12" fontWeight="700" fill={house === moonHouse ? "#C02660" : "#1E1838"}>
                {names.join(" ")}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export const SIGN_HI: Record<string, string> = { Aries: "Mesh", Taurus: "Vrishabh", Gemini: "Mithun", Cancer: "Kark", Leo: "Simha", Virgo: "Kanya",
  Libra: "Tula", Scorpio: "Vrishchik", Sagittarius: "Dhanu", Capricorn: "Makar", Aquarius: "Kumbh", Pisces: "Meena" };
export const signIndex = (name: string) => SIGNS.indexOf(name);
