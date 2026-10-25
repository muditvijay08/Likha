// Moon signs (rashis) for the public website's guide pages.
// Graha Maitri and Bhakoot here are the same rules as the kundli engine (kundli/likha_kundli/rules.py, "ak-2.0");
// tests/unit/rashi.test.ts checks them against the engine's published tables. Only the two Moon-sign kootas
// (12 of 36 points) can be worked out from signs alone; the rest needs nakshatras, so pages say so.

export type Element = "fire" | "earth" | "air" | "water";
export type Planet = "Sun" | "Moon" | "Mars" | "Mercury" | "Jupiter" | "Venus" | "Saturn";

export interface Rashi {
  i: number; slug: string; en: string; hi: string; deva: string; symbol: string;
  element: Element; quality: "movable" | "fixed" | "dual"; lord: Planet; love: string; needs: string;
}

const NAK = ["Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni",
  "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana",
  "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati"];

const R: Omit<Rashi, "i" | "element" | "quality">[] = [
  { slug: "aries", en: "Aries", hi: "Mesh", deva: "मेष", symbol: "Ram", lord: "Mars",
    love: "Falls fast and says so. A Mesh Moon likes honesty, energy and a partner who doesn't play games.", needs: "Space to lead, and someone who argues fair and forgives quickly." },
  { slug: "taurus", en: "Taurus", hi: "Vrishabh", deva: "वृषभ", symbol: "Bull", lord: "Venus",
    love: "Slow to trust, then deeply loyal. Shows love through food, comfort and turning up every time.", needs: "Steadiness, patience and a home that feels calm." },
  { slug: "gemini", en: "Gemini", hi: "Mithun", deva: "मिथुन", symbol: "Twins", lord: "Mercury",
    love: "Falls for a mind first. Long chats, jokes and voice notes at midnight are how a Mithun Moon bonds.", needs: "Conversation, variety and a partner who isn't threatened by curiosity." },
  { slug: "cancer", en: "Cancer", hi: "Kark", deva: "कर्क", symbol: "Crab", lord: "Moon",
    love: "Caring and protective, with feelings that run deep. Family matters a great deal to a Kark Moon.", needs: "Emotional safety, gentleness and being remembered on small days, not just big ones." },
  { slug: "leo", en: "Leo", hi: "Simha", deva: "सिंह", symbol: "Lion", lord: "Sun",
    love: "Warm, generous and proud. A Simha Moon loves openly and wants to be loved the same way.", needs: "Appreciation out loud, loyalty and a partner who is proud of them." },
  { slug: "virgo", en: "Virgo", hi: "Kanya", deva: "कन्या", symbol: "Maiden", lord: "Mercury",
    love: "Shows love by helping. A Kanya Moon notices details, plans ahead and quietly fixes things.", needs: "Reliability, kindness about their worries and space to do things properly." },
  { slug: "libra", en: "Libra", hi: "Tula", deva: "तुला", symbol: "Scales", lord: "Venus",
    love: "Romantic and fair-minded. A Tula Moon wants a real partnership, with beauty and balance in it.", needs: "Harmony, good manners and decisions made together." },
  { slug: "scorpio", en: "Scorpio", hi: "Vrishchik", deva: "वृश्चिक", symbol: "Scorpion", lord: "Mars",
    love: "Intense and all-in. A Vrishchik Moon takes time to open up, then bonds for life.", needs: "Trust, privacy and a partner who never plays with their feelings." },
  { slug: "sagittarius", en: "Sagittarius", hi: "Dhanu", deva: "धनु", symbol: "Archer", lord: "Jupiter",
    love: "Optimistic and adventurous. A Dhanu Moon falls for someone they can travel, learn and laugh with.", needs: "Freedom, honesty and a shared sense of where life is going." },
  { slug: "capricorn", en: "Capricorn", hi: "Makar", deva: "मकर", symbol: "Sea-goat", lord: "Saturn",
    love: "Serious about commitment. A Makar Moon shows love by building a future, one step at a time.", needs: "Respect, patience and a partner with goals of their own." },
  { slug: "aquarius", en: "Aquarius", hi: "Kumbh", deva: "कुम्भ", symbol: "Water-bearer", lord: "Saturn",
    love: "Friends first. A Kumbh Moon wants a partner who is also their favourite person to think with.", needs: "Independence, ideas and acceptance of their unusual side." },
  { slug: "pisces", en: "Pisces", hi: "Meen", deva: "मीन", symbol: "Fish", lord: "Jupiter",
    love: "Tender, dreamy and intuitive. A Meen Moon feels a partner's mood before a word is said.", needs: "Gentleness, imagination and someone who keeps them grounded without hardening them." },
];
const ELEMENTS: Element[] = ["fire", "earth", "air", "water"];
const QUALITIES = ["movable", "fixed", "dual"] as const;

export const RASHIS: Rashi[] = R.map((r, i) => ({ ...r, i, element: ELEMENTS[i % 4], quality: QUALITIES[i % 3] }));
export const rashiBySlug = (s: string) => RASHIS.find((r) => r.slug === s);

/** The nakshatras (birth stars) that fall in a Moon sign: 2¼ each, so some are shared with the next sign. */
export function nakshatrasOf(i: number): string[] {
  const start = i * 2.25, end = start + 2.25;
  const out: string[] = [];
  for (let n = Math.floor(start); n < Math.ceil(end); n++) out.push(NAK[n]);
  return out;
}

// ---- Graha Maitri (max 5): Parashara's natural friendships. REL[a][b] = how a sees b.
type Rel = "F" | "N" | "E";
const REL: Record<Planet, Partial<Record<Planet, Rel>>> = {
  Sun: { Moon: "F", Mars: "F", Jupiter: "F", Mercury: "N", Venus: "E", Saturn: "E" },
  Moon: { Sun: "F", Mercury: "F", Mars: "N", Jupiter: "N", Venus: "N", Saturn: "N" },
  Mars: { Sun: "F", Moon: "F", Jupiter: "F", Venus: "N", Saturn: "N", Mercury: "E" },
  Mercury: { Sun: "F", Venus: "F", Mars: "N", Jupiter: "N", Saturn: "N", Moon: "E" },
  Jupiter: { Sun: "F", Moon: "F", Mars: "F", Saturn: "N", Mercury: "E", Venus: "E" },
  Venus: { Mercury: "F", Saturn: "F", Mars: "N", Jupiter: "N", Sun: "E", Moon: "E" },
  Saturn: { Mercury: "F", Venus: "F", Jupiter: "N", Sun: "E", Moon: "E", Mars: "E" },
};
const MAITRI: Record<string, number> = { FF: 5, FN: 4, NF: 4, NN: 3, FE: 1, EF: 1, NE: 0.5, EN: 0.5, EE: 0 };
export const relation = (a: Planet, b: Planet): Rel | "same" => (a === b ? "same" : REL[a][b]!);
export function grahaMaitri(a: Planet, b: Planet): number {
  return a === b ? 5 : MAITRI[`${REL[a][b]}${REL[b][a]}`];
}
const mutualFriends = (a: Planet, b: Planet) => a === b || (REL[a][b] === "F" && REL[b][a] === "F");

// ---- Bhakoot (max 7): count from one Moon sign to the other, inclusive.
export function bhakoot(a: number, b: number) {
  const d1 = ((b - a + 12) % 12) + 1, d2 = ((a - b + 12) % 12) + 1;
  const pair = `${Math.min(d1, d2)}/${Math.max(d1, d2)}`;
  const bad = ["2/12", "5/9", "6/8"].includes(pair);
  const la = RASHIS[a].lord, lb = RASHIS[b].lord;
  const cancel = bad ? (la === lb ? `both signs are ruled by ${la}` : mutualFriends(la, lb) ? `their lords, ${la} and ${lb}, are friends` : null) : null;
  return { pair, points: bad ? 0 : 7, dosha: bad, cancelled: cancel };
}

export interface PairReading {
  a: Rashi; b: Rashi; slug: string; maitri: number; bhakoot: ReturnType<typeof bhakoot>;
  /** points out of 12 the way Likha counts them (a cancelled Bhakoot dosha gets its 7 back) */
  points: number; band: "strong" | "good" | "mixed" | "work";
}

export const pairSlug = (a: number, b: number) => `${RASHIS[Math.min(a, b)].slug}-and-${RASHIS[Math.max(a, b)].slug}`;
export function pairFromSlug(s: string): PairReading | null {
  const m = /^([a-z]+)-and-([a-z]+)$/.exec(s);
  if (!m) return null;
  const a = rashiBySlug(m[1]), b = rashiBySlug(m[2]);
  if (!a || !b || a.i > b.i) return null;          // one page per pair, in zodiac order
  return pair(a.i, b.i);
}
export function pair(ai: number, bi: number): PairReading {
  const [x, y] = ai <= bi ? [ai, bi] : [bi, ai];
  const a = RASHIS[x], b = RASHIS[y];
  const maitri = grahaMaitri(a.lord, b.lord), bk = bhakoot(x, y);
  const points = maitri + (bk.dosha && bk.cancelled ? 7 : bk.points);
  const band = points >= 11 ? "strong" : points >= 9 ? "good" : points >= 6 ? "mixed" : "work";
  return { a, b, slug: pairSlug(x, y), maitri, bhakoot: bk, points, band };
}
export const ALL_PAIRS: PairReading[] = RASHIS.flatMap((a) => RASHIS.filter((b) => b.i >= a.i).map((b) => pair(a.i, b.i)));

// ---- words
export const ELEMENT_WORD: Record<Element, string> = { fire: "Fire", earth: "Earth", air: "Air", water: "Water" };
const ELEMENT_PAIR: Record<string, string> = {
  "fire-fire": "Two fire Moons: lots of energy and honesty, and two people who both like to lead. Take turns choosing.",
  "earth-earth": "Two earth Moons: practical, loyal and steady. Make room for surprises so it doesn't become routine.",
  "air-air": "Two air Moons: endless conversation and shared ideas. Turn the plans into things you actually do together.",
  "water-water": "Two water Moons: you feel each other's moods without words. Say the hard things gently, and say them.",
  "fire-air": "Fire and air: air feeds fire. Spark, plans and fun; slow down for the small, quiet talks too.",
  "earth-water": "Earth and water: water nourishes earth. Caring and steady; say the soft things out loud.",
  "fire-earth": "Fire and earth: one rushes, one plans. Patience from both sides makes this a strong team.",
  "fire-water": "Fire and water: strong feelings both ways. Gentle words matter more than winning an argument.",
  "air-earth": "Air and earth: ideas meet practicality. Agree on the plan, then enjoy the dream.",
  "air-water": "Air and water: head and heart. Listen for what's under the words.",
};
export function elementLine(a: Element, b: Element): string {
  const k = [a, b].sort((x, y) => ELEMENTS.indexOf(x) - ELEMENTS.indexOf(y)).join("-");
  return ELEMENT_PAIR[k] ?? ELEMENT_PAIR[`${b}-${a}`];
}
export const BHAKOOT_MEANING: Record<string, string> = {
  "1/1": "The same Moon sign. You see the world in a similar way, which makes everyday life easy; just make sure you grow in different directions too.",
  "2/12": "One of the three pairings traditional matching cautions about. It's linked to different priorities around money and family; talk about both early.",
  "3/11": "A favourable pairing: friendly, supportive and good for shared plans.",
  "4/10": "A favourable pairing: one brings comfort and home, the other brings drive. Good for building a life.",
  "5/9": "Traditional North Indian matching cautions about this pairing (some regions consider it lucky). It's linked to different ideals; agree on the big values.",
  "6/8": "The pairing traditional matching cautions about most. It's linked to different rhythms and easy friction; it needs patience and clear words.",
  "7/7": "Opposite signs: you complete what the other lacks. Strong attraction, with the work of meeting in the middle.",
};
export const BAND_WORD: Record<PairReading["band"], string> = {
  strong: "Very supportive Moon signs", good: "Supportive Moon signs", mixed: "Mixed, with things to work on", work: "Needs understanding",
};
export const KOOTAS: [string, number, string, "moon" | "nak"][] = [
  ["Varna", 1, "Work style and ego.", "moon"], ["Vashya", 2, "Who leads, who follows.", "moon"], ["Tara", 3, "Luck and wellbeing together.", "nak"],
  ["Yoni", 4, "Physical and emotional comfort.", "nak"], ["Graha Maitri", 5, "Friendship between your Moon signs' lords.", "moon"],
  ["Gana", 6, "Temperament.", "nak"], ["Bhakoot", 7, "Family life and growth.", "moon"], ["Nadi", 8, "Traditionally the most weighted koota.", "nak"],
];
