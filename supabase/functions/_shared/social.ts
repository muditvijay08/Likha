// Weekly social plan: what to post each day, the facts behind it (computed, never written by the model), the card it
// shows, and the Hinglish words for each platform. The writer model only words what is here; every number it uses
// must come from the facts, and the same house rules as readings apply. If the model is off or a post fails the
// checks, that post gets the template words instead, so the week is always complete for the team to review.
import { dayPlan, goldenHours, clockRange, fmt, range, BEST_FOR_LABEL } from "./panchang.ts";
import { HOUSE_RULES, parseJson, styleCheck } from "./core.ts";

export type Kind = "panchang" | "pair" | "koota" | "feature" | "myth" | "golden" | "brand";
export type Platform = "instagram" | "facebook" | "linkedin" | "x" | "youtube";
export const PLATFORMS: Platform[] = ["instagram", "facebook", "linkedin", "x", "youtube"];

/** Monday to Sunday. */
export const KIND_BY_DAY: Kind[] = ["panchang", "pair", "koota", "feature", "myth", "golden", "brand"];

export interface Bank {
  site: string;
  features: { title: string; line: string }[];
  principles: string[];
  kootas: { name: string; max: number; about: string; from: string }[];
  pairs: { slug: string; a: string; a_en: string; b: string; b_en: string; points: number; out_of: number; maitri: number; bhakoot: string;
    bhakoot_meaning: string; dosha: boolean; cancelled_because: string | null; band: string; url: string }[];
}
export interface City { name: string; lat: number; lng: number; timezone: string }
export interface Settings {
  post_time_ist?: string; platforms?: Platform[] | Partial<Record<Platform, boolean>>; video_kinds?: string[]; hashtags?: string[]; max_hashtags?: number;
}
export interface Card { kicker?: string; headline: string; sub?: string; big?: string; facts?: [string, string][]; footer?: string; note?: string }
export interface Captions { instagram: string; facebook: string; linkedin: string; x: string; youtube_title: string; youtube_description: string }
export interface Planned {
  post_date: string; scheduled_at: string; kind: Kind; facts: Record<string, unknown>; card: Card; captions: Captions;
  platforms: Platform[]; video: boolean; writer: string; problems: string[];
}

// Myths we answer, in the app's own words (FAQ and About). Never a promise, never fear.
export const MYTHS: { myth: string; fact: string }[] = [
  { myth: "Manglik ho toh rishta mushkil", fact: "Manglik hona ek detail hai, faisla nahi. Likha Manglik status dikhata hai, par kisi ko iski wajah se chhupata nahi." },
  { myth: "Kundli matching matlab sirf 36 gunas", fact: "Guna Milan shuruaat hai. Likha ka Jodi Score gunas ke saath chart ke aur factors bhi dekhta hai." },
  { myth: "Birth time thoda idhar-udhar, kya farak padta hai", fact: "Moon lagbhag ek din mein nakshatra badalta hai, aur lagna har do ghante. Time sahi ho toh chart sahi." },
  { myth: "Dating apps pe sab fake hote hain", fact: "Likha pe har koi apne mobile number aur selfie check se aata hai. Fake profiles hum kabhi nahi banate." },
  { myth: "Online kisi se milna safe nahi hota", fact: "Likha pe pehle messages mein numbers aur links nahi jaate, date share kar sakte ho, aur SOS ek tap pe hai." },
  { myth: "36 mein 30 aaye, matlab rishta pakka", fact: "Achha match ek achhi shuruaat hai, wada nahi. Baaki baat-cheet aur samajh se banta hai." },
];

// Sunday "Likha diaries": why we built it this way. Feature index into the bank, plus the angle.
export const BRAND_TOPICS: { feature: number; angle: string }[] = [
  { feature: 0, angle: "why we put the kundli first, before the photos" },
  { feature: 1, angle: "how a chart is worked out: real planetary data, not guesswork" },
  { feature: 3, angle: "why women set the pace on Likha" },
  { feature: 5, angle: "safety we built in from day one" },
  { feature: 2, angle: "why dating on Likha is free" },
  { feature: 4, angle: "real, verified people only" },
];

const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600e3);
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dayLabel = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };

/** The seven dates of the week starting on Monday `weekOf`, each at the posting time (IST) as UTC. */
export function weekSlots(weekOf: string, postTimeIst = "19:30"): { date: string; at: string }[] {
  const [h, m] = postTimeIst.split(":").map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(`${weekOf}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + i);
    const date = isoDate(day);
    const at = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m) - 5.5 * 3600e3);
    return { date, at: at.toISOString() };
  });
}

/** Week number since 2026-01-05, so rotations move on every week and never repeat back-to-back. */
export const weekIndex = (weekOf: string) => Math.max(0, Math.round((Date.parse(weekOf) - Date.parse("2026-01-05")) / (7 * 864e5)));

// Pairs in a spread order (every 7th of the 78), so consecutive weeks show different signs.
const pickPair = (bank: Bank, w: number) => bank.pairs[(w * 7) % bank.pairs.length];

export function factsFor(kind: Kind, date: string, w: number, bank: Bank, city: City): { facts: Record<string, unknown>; card: Card } {
  const noonIst = new Date(`${date}T06:30:00Z`);                      // 12:00 IST that day
  switch (kind) {
    case "panchang": {
      const p = dayPlan(city.lat, city.lng, city.timezone, noonIst);
      const facts: [string, string][] = [["Sunrise", fmt(p.sun.sunrise)], ["Sunset", fmt(p.sun.sunset)],
        ["Rahu Kaal", range(p.rahu[0], p.rahu[1])]];
      if (p.love) facts.push([`${p.love.planet} hora (pyaar ki baat)`, range(p.love.start, p.love.end)]);
      return { facts: { city: city.name, date: dayLabel(date), times: Object.fromEntries(facts) },
        card: { kicker: `${city.name} · ${dayLabel(date)}`, headline: "Aaj ka panchang", facts, footer: "Times for " + city.name } };
    }
    case "pair": {
      const x = pickPair(bank, w);
      const bk = x.dosha ? (x.cancelled_because ? `${x.bhakoot}, dosha cancelled` : `${x.bhakoot}, dosha`) : `${x.bhakoot}, no dosha`;
      return { facts: { a: x.a, a_en: x.a_en, b: x.b, b_en: x.b_en, moon_sign_points: `${x.points}/${x.out_of}`, graha_maitri: `${x.maitri}/5`,
          bhakoot: bk, bhakoot_meaning: x.bhakoot_meaning, cancelled_because: x.cancelled_because, band: x.band, url: x.url },
        card: { kicker: "Moon sign jodi", headline: `${x.a} + ${x.b}`, sub: x.band, big: `${x.points}/${x.out_of}`,
          facts: [["Graha Maitri", `${x.maitri}/5`], ["Bhakoot", bk]], footer: "Full 36-guna match on likha.in", note: "Moon signs only: the full match needs both kundlis." } };
    }
    case "koota": {
      const k = bank.kootas[w % bank.kootas.length];
      return { facts: { koota: k.name, max_gunas: k.max, about: k.about, from: k.from === "moon" ? "Moon sign" : "Moon nakshatra", total_gunas: 36, kootas: 8 },
        card: { kicker: "8 kootas, 36 gunas", headline: k.name, sub: k.about, big: `${k.max} ${k.max === 1 ? "guna" : "gunas"}`, footer: "Kundli 101 on likha.in" } };
    }
    case "feature": {
      const f = bank.features[(w + 2) % bank.features.length];
      return { facts: { feature: f.title, what: f.line }, card: { kicker: "Likha pe", headline: f.title, sub: f.line } };
    }
    case "myth": {
      const m = MYTHS[w % MYTHS.length];
      return { facts: { myth: m.myth, fact: m.fact }, card: { kicker: "Myth", headline: `“${m.myth}”`, sub: `Fact: ${m.fact}` } };
    }
    case "golden": {
      const from = new Date(`${date}T00:00:00+05:30`);
      const gh = goldenHours(city.lat, city.lng, city.timezone, from, 2).slice(0, 4);
      const facts: [string, string][] = gh.map((g) => [`${dayLabel(isoDate(ist(g.start))).split(" ")[0]} · ${BEST_FOR_LABEL[g.best_for].replace("Best for a ", "")}`,
        clockRange(g.start, g.end, city.timezone)]);
      return { facts: { city: city.name, weekend: `${dayLabel(date)} and Sunday`, windows: Object.fromEntries(facts) },
        card: { kicker: `Is weekend, ${city.name}`, headline: "Golden Hours", sub: "Planet hours good for love, minus Rahu Kaal", facts } };
    }
    case "brand": {
      const t = BRAND_TOPICS[w % BRAND_TOPICS.length], f = bank.features[t.feature % bank.features.length];
      return { facts: { angle: t.angle, feature: f.title, what: f.line, company: "Young Attitude Ventures Private Limited, Jaipur" },
        card: { kicker: "Likha diaries", headline: f.title, sub: f.line } };
    }
  }
}

// ---------------------------------------------------------------- words
const tags = (s: Settings, n: number) => (s.hashtags ?? ["#Likha", "#KundliMatching"]).slice(0, Math.min(n, s.max_hashtags ?? 5)).join(" ");

/** Template words: always correct, a bit plain. Used when the model is off or a post fails the checks. */
export function templateCaptions(kind: Kind, facts: any, card: Card, site: string): Captions {
  const link = site.replace(/^https?:\/\//, "");
  const lines = (card.facts ?? []).map(([k, v]) => `${k}: ${v}`);
  const body: Record<Kind, { ig: string; x: string; li: string; yt: string }> = {
    panchang: { ig: `Aaj ka panchang, ${facts.city} (${facts.date})\n${lines.join("\n")}\n\nPyaar ki baat ka sahi time bhi dekh lo. Apni kundli free banao on ${link}`,
      x: `Aaj ka panchang, ${facts.city}: ${lines.slice(0, 3).join(" · ")}`, li: `Today's panchang for ${facts.city} (${facts.date}): ${lines.join("; ")}. Every time on Likha is computed, not guessed.`,
      yt: `Aaj ka panchang, ${facts.city}` },
    pair: { ig: `${facts.a} + ${facts.b}: Moon signs ke hisaab se ${facts.moon_sign_points}. Graha Maitri ${facts.graha_maitri}, Bhakoot ${facts.bhakoot}.\n${facts.bhakoot_meaning}\n\nPoora 36-guna match dono kundli se banta hai: ${facts.url}`,
      x: `${facts.a} + ${facts.b} = ${facts.moon_sign_points} (Moon signs). Poora match: ${facts.url}`, li: `${facts.a_en} and ${facts.b_en} Moon signs: ${facts.moon_sign_points} on the Moon-sign kootas. ${facts.bhakoot_meaning}`,
      yt: `${facts.a} + ${facts.b}: kitna match?` },
    koota: { ig: `Kundli 101: ${facts.koota} (${facts.max_gunas} of 36 gunas)\n${facts.about} Yeh ${facts.from} se dekha jaata hai.\n\nAapka poora Guna Milan: ${link}`,
      x: `Kundli 101: ${facts.koota} = ${facts.max_gunas} of 36 gunas. ${facts.about}`, li: `Kundli 101: ${facts.koota} carries ${facts.max_gunas} of the 36 gunas. ${facts.about}`,
      yt: `${facts.koota}: ${facts.max_gunas} gunas ka raaz` },
    feature: { ig: `${facts.feature}\n${facts.what}\n\nLikha: kundli milao, dil milao. ${link}`, x: `${facts.feature}: ${facts.what}`,
      li: `${facts.feature}. ${facts.what}`, yt: `${facts.feature} on Likha` },
    myth: { ig: `Myth: "${facts.myth}"\nFact: ${facts.fact}\n\n${link}`, x: `Myth: "${facts.myth}" Fact: ${facts.fact}`,
      li: `A common belief: "${facts.myth}". What we do on Likha: ${facts.fact}`, yt: `Myth vs fact: ${facts.myth}` },
    golden: { ig: `Is weekend ke Golden Hours, ${facts.city}\n${lines.join("\n")}\n\nPehla message ya pehli date, sahi time pe. ${link}`,
      x: `Weekend Golden Hours, ${facts.city}: ${lines.slice(0, 2).join(" · ")}`, li: `This weekend's Golden Hours in ${facts.city}: ${lines.join("; ")}.`,
      yt: `Weekend Golden Hours, ${facts.city}` },
    brand: { ig: `Likha diaries: ${facts.feature}\n${facts.what}\n\nBuilt in Jaipur. ${link}`, x: `Likha diaries: ${facts.feature}. ${facts.what}`,
      li: `Building Likha in Jaipur: ${facts.angle}. ${facts.what}`, yt: `Likha diaries: ${facts.feature}` },
  };
  const b = body[kind];
  return { instagram: b.ig, facebook: b.ig, linkedin: b.li, x: b.x, youtube_title: b.yt, youtube_description: `${b.ig}`.slice(0, 900) };
}

/** Hashtags and the link go on after the words are checked (the model never writes hashtags). */
export function finishCaptions(c: Captions, s: Settings, site: string, url?: string): Captions {
  const link = url ?? site;
  const withLink = (t: string) => (t.includes(site.replace(/^https?:\/\//, "")) || (url && t.includes(url)) ? t : `${t}\n\n${link}`);
  let x = c.x.includes("likha.in") ? c.x : `${c.x} ${link}`;
  const xTags = tags(s, 2);
  if (x.length + 1 + xTags.length <= 280) x = `${x} ${xTags}`;
  if (x.length > 280) x = c.x.slice(0, 280);
  return {
    instagram: `${withLink(c.instagram)}\n\n${tags(s, 5)}`.slice(0, 2200),
    facebook: withLink(c.facebook),
    linkedin: `${withLink(c.linkedin)}\n\n${tags(s, 3)}`,
    x,
    youtube_title: `${c.youtube_title.slice(0, 90)} #Shorts`.slice(0, 100),
    youtube_description: `${withLink(c.youtube_description)}\n\n${tags(s, 3)}`.slice(0, 4900),
  };
}

// ---------------------------------------------------------------- the writer prompt and its checks
export function writerPrompt(briefs: { i: number; kind: Kind; facts: unknown; card: Card }[]) {
  const system = `${HOUSE_RULES}
You are writing Likha's social media posts for one week, in Hinglish: Hindi in Roman script mixed naturally with English, the way young people in Jaipur text. Playful, warm, short, sentence case.
Social rules:
- Words only. The card image already shows the numbers; you may repeat them, copied exactly from the facts.
- Never invent members, quotes, reviews, stories of couples, user counts, downloads or any number not in the facts.
- Never use the words AI, algorithm, bot or model. Never promise a match or a marriage. Never mention caste.
- No hashtags (we add them). At most two emoji per post. Do not put links (we add them).
- headline: at most 7 words, for the card. sub: at most 16 words, or "".
- instagram: 40 to 110 words. facebook: 30 to 80 words. linkedin: 50 to 140 words, more English, thoughtful, from the team building Likha.
- x: at most 200 characters. youtube_title: at most 70 characters. youtube_description: 25 to 70 words.
Reply with JSON only: {"posts":[{"i":0,"headline":"","sub":"","instagram":"","facebook":"","linkedin":"","x":"","youtube_title":"","youtube_description":""}]}`;
  const user = `<facts>${JSON.stringify(briefs.map((b) => ({ i: b.i, kind: b.kind, facts: b.facts, card_shows: b.card })))}</facts>`;
  return { system, user };
}

const digitsIn = (s: string) => new Set((s.match(/\d+/g) ?? []).map((d) => String(Number(d))));

/** Every number in the words must come from the facts (or the card); style and length rules as above. */
export function checkWritten(w: any, facts: unknown, card: Card): string[] {
  const problems: string[] = [];
  const fields = ["headline", "instagram", "facebook", "linkedin", "x", "youtube_title", "youtube_description"];
  for (const f of fields) if (typeof w?.[f] !== "string" || !w[f].trim()) problems.push(`missing ${f}`);
  if (problems.length) return problems;
  const allowed = new Set([...digitsIn(JSON.stringify(facts)), ...digitsIn(JSON.stringify(card)), "36", "8", "12", "1", "2"]);
  const all = fields.map((f) => w[f]).concat(w.sub ?? "").join("\n");
  const stray = [...digitsIn(all)].filter((d) => !allowed.has(d));
  if (stray.length) problems.push(`numbers not in the facts: ${stray.slice(0, 4).join(", ")}`);
  problems.push(...styleCheck(all).problems);
  if (/#\w/.test(all)) problems.push("wrote hashtags");
  if (/\b(algorithm|bot)\b/i.test(all)) problems.push("says algorithm or bot");
  if (/\bcaste\b/i.test(all)) problems.push("mentions caste");
  if (/\b(lakh|crore|thousands of)\b/i.test(all)) problems.push("claims a big number");
  if (w.x.length > 220) problems.push("X post too long");
  if (w.youtube_title.length > 75) problems.push("YouTube title too long");
  if (w.headline.split(/\s+/).length > 8) problems.push("headline too long");
  return problems;
}

export function parsePosts(text: string): any[] {
  const j = parseJson<{ posts?: any[] }>(text);
  return Array.isArray(j?.posts) ? j!.posts : [];
}

/** Platforms for a post: on in settings, and YouTube only when there is a video. */
export function platformsFor(kind: Kind, s: Settings): { platforms: Platform[]; video: boolean } {
  const video = (s.video_kinds ?? ["panchang", "pair", "golden"]).includes(kind);
  const isOn = (p: Platform) => Array.isArray(s.platforms) ? s.platforms.includes(p) : (s.platforms?.[p] ?? true);
  const on = PLATFORMS.filter((p) => isOn(p) && (p !== "youtube" || video));
  return { platforms: on.length ? on : ["instagram"], video };
}
