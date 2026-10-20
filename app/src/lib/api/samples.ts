// Sample profiles for demo mode only (design reviews and automated tests). Every card built from these is marked
// is_sample and shown with a "Sample profile" label. They never exist in the real database.
import type { Card, ProfileFull } from "./types";

type Sample = Omit<Card, "is_sample"> & { gender: "woman" | "man"; likesYou: number | false; extra: Partial<ProfileFull> };

const base = (id: string, gender: "woman" | "man", first_name: string, age: number, profession: string, jodi: number, gunas: number,
  moon: string, nak: string, summary: string, likesYou: number | false, extra: Partial<ProfileFull> = {}): Sample => ({
  id, gender, first_name, age, profession, goal: age > 26 ? "matchmaking" : "dating", tier: jodi > 90 ? "graha" : "none", city: "Jaipur",
  verified: true, diet: "vegetarian", gunas, jodi_score: jodi, summary, moon_sign: moon, nakshatra: nak, manglik: false, photos: [],
  prompt: { label: "The planets got me right about…", answer: "Needing a window seat, always. On trains, at work, in life." },
  interests: ["Travel", "Chai", "Architecture"], liked_me: !!likesYou, likesYou, extra,
});

export const SAMPLES: Sample[] = [
  base("s-riya", "woman", "Riya", 26, "Architect", 92, 27, "Pisces", "Revati", "Her calm Moon balances your fiery Mars. Long talks, few fights.", false),
  base("s-ishita", "woman", "Ishita", 27, "CA", 94, 29, "Taurus", "Rohini", "Two steady Moons. Plans get made and kept.", 2),
  base("s-sanya", "woman", "Sanya", 24, "Teacher", 91, 27, "Cancer", "Pushya", "Warm and protective together. Family-first energy.", 5),
  base("s-meera", "woman", "Meera", 25, "Doctor", 88, 25, "Libra", "Swati", "Easy charm on both sides. Talk things out early.", 0.5),
  base("s-nidhi", "woman", "Nidhi", 26, "Founder", 86, 24, "Aries", "Ashwini", "Both of you move fast. Good for adventures.", false),
  base("s-tanvi", "woman", "Tanvi", 28, "Designer", 83, 22, "Gemini", "Ardra", "Lots to talk about. Give each other space.", false),
  base("s-aarav", "man", "Aarav", 27, "Product manager", 92, 27, "Scorpio", "Anuradha", "His steady Saturn grounds your quick Mercury.", false),
  base("s-kabir", "man", "Kabir", 28, "Doctor", 90, 28, "Taurus", "Rohini", "Two steady Moons. Plans get made and kept.", 1),
  base("s-dev", "man", "Dev", 26, "Engineer", 87, 25, "Leo", "Magha", "Big warmth, big laughs. Keep egos light.", 4),
  base("s-rohan", "man", "Rohan", 29, "CA", 85, 24, "Virgo", "Hasta", "Careful and kind. Good with money talks.", 0.5),
  base("s-arjun", "man", "Arjun", 27, "Architect", 82, 22, "Sagittarius", "Mula", "Travel buddies first. Then the rest.", false),
];

const MAX = { varna: 1, vashya: 2, tara: 3, yoni: 4, graha_maitri: 5, gana: 6, bhakoot: 7, nadi: 8 };
/** Koota points that add up to the sample's Guna total (taken off Bhakoot first, then Yoni, Tara, Vashya). */
function kootasFor(gunas: number) {
  const k: Record<string, number> = { ...MAX };
  let left = 36 - gunas;
  for (const name of ["bhakoot", "yoni", "tara", "vashya"]) { const cut = Math.min(k[name], left); k[name] -= cut; left -= cut; }
  return k;
}

export function sampleProfile(id: string): ProfileFull | null {
  const s = SAMPLES.find((x) => x.id === id);
  if (!s) return null;
  const { gender: _g, likesYou: _l, extra, ...c } = s;
  return {
    ...c, is_sample: true, height_cm: 165, education: "Post-graduate", company: null, languages: ["Hindi", "English"], drinking: "socially",
    smoking: "never", kids: "want", religion: null, voice_url: null, lagna: "Virgo", pada: 2, borderline: false,
    prompts: c.prompt ? [c.prompt, { label: "A perfect Sunday", answer: "Kachori at Rawat, then a long walk at Jal Mahal." }] : [],
    kootas: kootasFor(c.gunas ?? 18),
    doshas: { bhakoot: { present: true, cancelled: true, reason: "Moon sign lords are friends" }, manglik_match: true },
    i_liked: false, match_id: null, ...extra,
  };
}
