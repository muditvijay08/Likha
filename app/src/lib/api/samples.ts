// Sample profiles for demo mode only (design reviews and automated tests). Every card built from these is marked
// is_sample and shown with a "Sample profile" label. They never exist in the real database.
import type { Card, MaritalStatus, MarriageTimeline, ProfileFull } from "./types";
import type { Life } from "../match-intel";

import GEN from "./samples.generated.json";

type Sample = Omit<Card, "is_sample"> & { gender: "woman" | "man"; likesYou: number | false; extra: Partial<ProfileFull> };
type Gen = (typeof GEN.samples)[number];

// Everything astrological (Moon, nakshatra, Gunas, kootas, doshas, Jodi Score) comes from the real engine, worked out
// against the demo member's sample chart by kundli/tools/gen_demo_samples.py. Only the human details are written here.
const PEOPLE: Record<string, { marital: MaritalStatus; hometown: string | null; relocate: string; timeline: MarriageTimeline | null; profession: string; diet: string; likesYou: number | false; interests: string[]; prompt: [string, string] }> = {
  "s-ishita": { marital: "never_married", hometown: "Udaipur", relocate: "maybe", timeline: "1_2y", profession: "Brand strategist", diet: "vegetarian", likesYou: 2, interests: ["Travel", "Chai", "Kathak"], prompt: ["The planets got me right about…", "Needing a window seat, always. On trains, at work, in life."] },
  "s-riya": { marital: "never_married", hometown: null, relocate: "no", timeline: null, profession: "Architect", diet: "eggetarian", likesYou: false, interests: ["Architecture", "Sketching", "Old havelis"], prompt: ["My Sunday looks like…", "Sketching a haveli in the old city, then lassi at Lassiwala."] },
  "s-sanya": { marital: "never_married", hometown: "Ajmer", relocate: "yes", timeline: null, profession: "Teacher", diet: "non_veg", likesYou: 5, interests: ["Books", "Baking", "Cricket"], prompt: ["What are you fond of?", "Kids who ask 'but why?' five times in a row."] },
  "s-meera": { marital: "never_married", hometown: "Jodhpur", relocate: "maybe", timeline: null, profession: "Doctor", diet: "vegetarian", likesYou: 0.5, interests: ["Running", "Podcasts", "Chai"], prompt: ["The planets got me right about…", "I plan everything. Except holidays. Those just happen."] },
  "s-nidhi": { marital: "never_married", hometown: null, relocate: "no", timeline: "within_1y", profession: "Founder, handloom label", diet: "jain", likesYou: false, interests: ["Textiles", "Yoga", "Travel"], prompt: ["About you", "Building a small label with weavers in Sanganer. Ask me about block prints."] },
  "s-tanvi": { marital: "separated", hometown: "Pune", relocate: "yes", timeline: "not_sure", profession: "UX designer", diet: "vegan", likesYou: false, interests: ["Indie music", "Pottery", "Trekking"], prompt: ["My Sunday looks like…", "A trek near Nahargarh at sunrise, then a long nap."] },
  "s-aarav": { marital: "never_married", hometown: "Kota", relocate: "yes", timeline: "1_2y", profession: "Product manager", diet: "non_veg", likesYou: false, interests: ["Cricket", "Travel", "Chai"], prompt: ["The planets got me right about…", "Steady at work, terrible at choosing a restaurant."] },
  "s-kabir": { marital: "never_married", hometown: null, relocate: "no", timeline: "within_1y", profession: "Hotel owner", diet: "vegetarian", likesYou: 1, interests: ["Food", "Polo", "Old music"], prompt: ["About you", "Run a heritage guesthouse near Amer. I make a mean dal baati."] },
  "s-dev": { marital: "never_married", hometown: "Bikaner", relocate: "yes", timeline: "not_sure", profession: "Engineer", diet: "eggetarian", likesYou: 4, interests: ["Cycling", "Gaming", "Stand-up"], prompt: ["What are you fond of?", "Night rides on JLN Marg and bad puns."] },
  "s-rohan": { marital: "divorced", hometown: null, relocate: "maybe", timeline: "1_2y", profession: "Music teacher", diet: "vegetarian", likesYou: 0.5, interests: ["Sitar", "Books", "Chai"], prompt: ["About you", "Teach sitar, learning patience. Divorced, two years on, ready to meet someone kind."] },
  "s-arjun": { marital: "never_married", hometown: "Jaipur", relocate: "yes", timeline: "within_1y", profession: "Architect", diet: "non_veg", likesYou: false, interests: ["Travel", "Photography", "Football"], prompt: ["My Sunday looks like…", "Photographing stepwells. Panna Meena ka Kund at 7 AM, no crowds."] },
};

// Sample answers to the life-and-values questions, varied on purpose (some left blank) so Match Intelligence shows every case.
const LIFE: Record<string, Partial<Life>> = {
  "s-ishita": { drinking: "never", smoking: "never", kids: "want", family_setup: "open", career_plan: "both_work", comm_style: "caller", conflict_style: "talk_now", weekend_style: "outdoors", money_style: "balanced", life_values: ["family", "ambition", "humour"], languages: ["Hindi", "English", "Mewari"], workout: "often" },
  "s-riya": { drinking: "socially", smoking: "never", kids: "not_sure", family_setup: "nuclear", career_plan: "both_work", comm_style: "texter", weekend_style: "mix", life_values: ["independence", "growth"], languages: ["Hindi", "English"] },
  "s-sanya": { drinking: "socially", smoking: "never", kids: "want", family_setup: "joint", career_plan: "open", comm_style: "in_person", conflict_style: "cool_off", weekend_style: "social", money_style: "saver", life_values: ["family", "kindness"], languages: ["Hindi", "English"], workout: "sometimes" },
  "s-meera": { drinking: "never", smoking: "never", kids: "want", family_setup: "joint", career_plan: "both_work", conflict_style: "talk_now", money_style: "saver", life_values: ["stability", "family", "growth"], languages: ["Hindi", "English", "Marwari"], workout: "daily" },
  "s-nidhi": { drinking: "never", smoking: "never", kids: "dont_want", family_setup: "nuclear", career_plan: "both_work", comm_style: "caller", weekend_style: "homebody", life_values: ["ambition", "tradition"], languages: ["Hindi", "English"] },
  "s-tanvi": { drinking: "socially", smoking: "socially", kids: "not_sure", career_plan: "both_work", comm_style: "texter", weekend_style: "outdoors", money_style: "spender", life_values: ["adventure", "independence"], languages: ["English", "Marathi", "Hindi"] },
  "s-aarav": { drinking: "socially", smoking: "never", kids: "want", family_setup: "joint", career_plan: "both_work", comm_style: "caller", conflict_style: "talk_now", weekend_style: "mix", money_style: "saver", life_values: ["family", "ambition"], languages: ["Hindi", "English"], workout: "often" },
  "s-kabir": { drinking: "socially", smoking: "never", kids: "want", family_setup: "joint", career_plan: "open", comm_style: "in_person", weekend_style: "social", life_values: ["tradition", "family", "kindness"], languages: ["Hindi", "English", "Rajasthani"] },
  "s-dev": { drinking: "regularly", smoking: "socially", kids: "not_sure", family_setup: "nuclear", comm_style: "texter", conflict_style: "cool_off", weekend_style: "outdoors", money_style: "spender", life_values: ["adventure", "humour"], languages: ["Hindi", "English"] },
  "s-rohan": { drinking: "never", smoking: "never", kids: "have", family_setup: "open", career_plan: "both_work", comm_style: "caller", conflict_style: "talk_now", weekend_style: "homebody", money_style: "balanced", life_values: ["kindness", "growth"], languages: ["Hindi", "English"] },
  "s-arjun": { drinking: "socially", smoking: "never", kids: "want", family_setup: "nuclear", career_plan: "both_work", comm_style: "caller", weekend_style: "outdoors", life_values: ["adventure", "ambition"], languages: ["Hindi", "English"], workout: "often" },
};

const fromGen = (g: Gen): Sample => {
  const p = PEOPLE[g.id];
  return {
    id: g.id, gender: g.gender as "woman" | "man", first_name: g.first_name, age: g.age, profession: p.profession,
    goal: g.age > 26 ? "matchmaking" : "dating", tier: g.jodi_score > 88 ? "graha" : "none", city: "Jaipur", verified: true, diet: p.diet,
    gunas: g.gunas, jodi_score: g.jodi_score, summary: g.summary, moon_sign: g.moon_sign, nakshatra: g.nakshatra, manglik: g.manglik, photos: [],
    prompt: { label: p.prompt[0], answer: p.prompt[1] }, interests: p.interests, liked_me: !!p.likesYou, likesYou: p.likesYou,
    life: { ...LIFE[g.id], hometown: p.hometown, relocate: p.relocate, marriage_timeline: g.age > 26 ? p.timeline : null },
    extra: { lagna: g.lagna, pada: g.pada, kootas: g.kootas, doshas: g.doshas as ProfileFull["doshas"], hometown: p.hometown,
             relocate: p.relocate, marital_status: p.marital, marriage_timeline: g.age > 26 ? p.timeline : null },
  };
};

export const SAMPLES: Sample[] = GEN.samples.map(fromGen);
/** The demo member's chart: one example birth, worked out by the real engine. Shown as a sample chart. */
export const SAMPLE_CHART = GEN.member;

export function sampleProfile(id: string): ProfileFull | null {
  const s = SAMPLES.find((x) => x.id === id);
  if (!s) return null;
  const { gender: _g, likesYou: _l, extra, ...c } = s;
  return {
    ...c, is_sample: true, height_cm: 165, education: "Post-graduate", company: null, languages: c.life?.languages ?? ["Hindi", "English"], drinking: c.life?.drinking ?? null,
    smoking: c.life?.smoking ?? null, kids: c.life?.kids ?? null, religion: null, voice_url: null, lagna: null, pada: null, borderline: false,
    prompts: c.prompt ? [c.prompt, { label: "A perfect Sunday", answer: "Kachori at Rawat, then a long walk at Jal Mahal." }] : [],
    kootas: null, doshas: null,
    i_liked: false, match_id: null, ...extra,
  };
}
