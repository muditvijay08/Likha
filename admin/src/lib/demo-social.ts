// Demo data for Admin > Social (sample only): next week's seven posts, as the planner would write them.
import type { Social, SocialPlatform, SocialPost } from "./types";

const KEY = "likha-admin-demo-social";
const ALL: SocialPlatform[] = ["instagram", "facebook", "linkedin", "x", "youtube"];
const nextMonday = () => { const d = new Date(Date.now() + 5.5 * 3600e3); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7)); return d.toISOString().slice(0, 10); };
const at = (date: string, hhmm = "19:30") => new Date(new Date(`${date}T${hhmm}:00+05:30`).getTime()).toISOString();
const plus = (date: string, n: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const tags = "\n\n#Likha #KundliMatching #Jaipur #DesiDating #Kundli";

function week(w: string): SocialPost[] {
  const P = (i: number, kind: string, card: SocialPost["card"], ig: string, x: string, li: string, yt: string, video = false): SocialPost => ({
    id: `demo-${w}-${i}`, post_date: plus(w, i), scheduled_at: at(plus(w, i)), kind, card,
    captions: { instagram: ig + "\n\nlikha.in" + tags, facebook: ig + "\n\nlikha.in", linkedin: li + "\n\nlikha.in\n\n#Likha #KundliMatching #Jaipur", x: `${x} likha.in #Likha #KundliMatching`,
      youtube_title: `${yt} #Shorts`, youtube_description: ig + "\n\nlikha.in\n\n#Likha #KundliMatching #Jaipur" },
    platforms: ALL.filter((p) => p !== "youtube" || video), video, status: "draft", assets: {}, results: {}, writer: "gemini-3.5-flash-lite (sample)",
    problems: [], note: null, decided_by: null, decided_at: null });
  return [
    P(0, "panchang", { kicker: "Jaipur · Mon", headline: "Aaj ka panchang", facts: [["Sunrise", "6:52 AM"], ["Sunset", "5:34 PM"], ["Rahu Kaal", "8:12–9:32 AM"], ["Venus hora (pyaar ki baat)", "7:41–8:41 PM"]] },
      "Monday ka plan ready? Jaipur mein Rahu Kaal 8:12–9:32 AM hai, toh bada kaam thoda aage-peeche. Aur shaam 7:41–8:41 PM Venus hora: pehla message bhejne ka perfect time ✨",
      "Jaipur, aaj Rahu Kaal 8:12–9:32 AM. Pehla message? Venus hora 7:41–8:41 PM 💌", "Today's panchang for Jaipur: sunrise 6:52 AM, Rahu Kaal 8:12–9:32 AM. Every time on Likha is computed from real planetary data.", "Aaj ka panchang, Jaipur", true),
    P(1, "pair", { kicker: "Moon sign jodi", headline: "Mesh + Meen", sub: "Very supportive Moon signs", big: "12/12", facts: [["Graha Maitri", "5/5"], ["Bhakoot", "2/12, dosha cancelled"]], note: "Moon signs only: the full match needs both kundlis." },
      "Mesh ki energy, Meen ka dil. Moon signs ke hisaab se 12/12, aur Bhakoot dosha cancel kyunki dono ke lords dost hain. Poora 36-guna match dono kundli se banta hai.",
      "Mesh + Meen = 12/12 (Moon signs). Poora match:", "Aries and Pisces Moon signs score 12 of 12 on the Moon-sign kootas. The full match needs both charts.", "Mesh + Meen: kitna match?", true),
    P(2, "koota", { kicker: "8 kootas, 36 gunas", headline: "Nadi", sub: "Traditionally the most weighted koota.", big: "8 gunas" },
      "Kundli 101: Nadi akela 8 gunas ka hai, 36 mein se sabse bada hissa. Yeh nakshatra se dekha jaata hai. Apna poora Guna Milan dekho, free mein.",
      "Kundli 101: Nadi = 8 of 36 gunas.", "Kundli 101: Nadi carries 8 of the 36 gunas, the most of any koota.", "Nadi: 8 gunas ka raaz"),
    P(3, "feature", { kicker: "Likha pe", headline: "Women set the pace", sub: "Women can choose to message first. Anyone can go incognito." },
      "Pehla message kaun bhejega? Likha pe ladkiyaan decide karti hain. Aur incognito mode mein sirf wahi tumhe dekhte hain jinhe tumne like kiya.",
      "Likha pe pehla message? Ladkiyaan decide karti hain.", "On Likha, women can choose to message first, and anyone can go incognito.", "Women set the pace"),
    P(4, "myth", { kicker: "Myth", headline: "“Manglik ho toh rishta mushkil”", sub: "Fact: Manglik hona ek detail hai, faisla nahi." },
      "Myth: Manglik ho toh rishta mushkil. Fact: Manglik hona ek detail hai, faisla nahi. Likha Manglik status dikhata hai, par kisi ko iski wajah se chhupata nahi.",
      "Myth: Manglik = mushkil. Fact: ek detail hai, faisla nahi.", "A common belief about Manglik dosha, and what we do on Likha: show it, never hide anyone for it.", "Myth vs fact: Manglik"),
    P(5, "golden", { kicker: "Is weekend, Jaipur", headline: "Golden Hours", sub: "Planet hours good for love, minus Rahu Kaal", facts: [["Sat · first date", "11:10 AM–12:10 PM"], ["Sat · long chat", "7:40–8:40 PM"], ["Sun · first message", "6:30–7:30 PM"]] },
      "Weekend plan? Jaipur ke Golden Hours: Saturday 11:10 AM–12:10 PM pehli date ke liye, aur Sunday 6:30–7:30 PM pehla message ✨",
      "Weekend Golden Hours, Jaipur: Sat 11:10 AM–12:10 PM first date.", "This weekend's Golden Hours in Jaipur, worked out from the day's planetary hours.", "Weekend Golden Hours, Jaipur", true),
    P(6, "brand", { kicker: "Likha diaries", headline: "Real charts, not guesses", sub: "NASA JPL planetary data with the Lahiri ayanamsa." },
      "Likha diaries: har kundli NASA JPL ke planetary data aur Lahiri ayanamsa se banti hai. Andaaza nahi, hisaab. Built in Jaipur.",
      "Likha diaries: real charts, not guesses.", "Building Likha in Jaipur: every chart is worked out from NASA JPL's planetary data with the Lahiri ayanamsa, the Indian standard.", "Likha diaries: real charts"),
  ];
}

type Store = { weeks: Record<string, SocialPost[]> };
const load = (): Store => { try { return JSON.parse(localStorage.getItem(KEY) ?? "") as Store; } catch { return { weeks: {} }; } };
const save = (s: Store) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } };

export const demoSocial = {
  get(w?: string): Social {
    const s = load(); const wk = w ?? nextMonday();
    if (!s.weeks[wk] && wk === nextMonday()) { s.weeks[wk] = week(wk); save(s); }
    return { week_of: wk, can_settings: true, connections: { instagram: false, facebook: false, linkedin: false, x: false, youtube: false },
      weeks: Object.keys(s.weeks).sort().reverse(), settings: {}, posts: s.weeks[wk] ?? [] };
  },
  edit(id: string, fn: (p: SocialPost) => void) {
    const s = load();
    for (const posts of Object.values(s.weeks)) for (const p of posts) if (p.id === id) {
      if (!["draft", "approved", "dropped"].includes(p.status)) throw new Error("this post is already going out");
      fn(p);
    }
    save(s);
  },
  approveWeek(w: string) { const s = load(); let n = 0; for (const p of s.weeks[w] ?? []) if (p.status === "draft" && !p.problems.length) { p.status = "approved"; p.decided_by = "Demo Owner"; p.decided_at = new Date().toISOString(); n++; } save(s); return n; },
  replan(w: string) { const s = load(); const keep = (s.weeks[w] ?? []).filter((p) => p.status !== "draft"); s.weeks[w] = [...keep, ...week(w).filter((p) => !keep.some((k) => k.kind === p.kind))]
    .sort((a, b) => a.post_date.localeCompare(b.post_date)); save(s); return { saved: s.weeks[w].length - keep.length, writer: "sample" }; },
};
