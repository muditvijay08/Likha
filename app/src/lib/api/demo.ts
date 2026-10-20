// Demo backend: everything lives in this browser. Used for design reviews and automated tests.
// OTP code is always 123456. Selfie always passes. The kundli is a fixed sample chart.
import type {
  CrushCheck, GiftItem, MaasiState, PaymentStatus, ReadingFull, ReadingItem, UpiApp, Wallet,
  ChatData, GuruState, Msg, SaathiChar, SaathiReply, SaathiState,
  Api, Basics, Birth, Card, City, CityQueue, Filters, Gender, Goal, HomeData, Interest, Kick, LikeCard, LikeResult, Lifestyle,
  MatchRow, MyChart, OnboardingState, Photo, Place, Prefs, Prices, ProfileFull, PublicSettings, Pulse, Reading, Refresh, SelfieResult,
} from "./types";
import { SAMPLES, sampleProfile } from "./samples";
import { dayPlan, range } from "../panchang";

const KEY = "likha-demo-db";
const CITIES: City[] = [
  { id: "c-jaipur", slug: "jaipur", name: "Jaipur", status: "live" },
  { id: "c-pune", slug: "pune", name: "Pune", status: "waitlist" },
  { id: "c-ahmedabad", slug: "ahmedabad", name: "Ahmedabad", status: "waitlist" },
  { id: "c-dubai", slug: "dubai", name: "Dubai", status: "waitlist" },
  { id: "c-udaipur", slug: "udaipur", name: "Udaipur", status: "locked" },
];
const INTERESTS = ["Travel", "Chai", "Architecture", "Cricket", "Indie music", "Trekking", "Cooking", "Movies", "Books",
  "Fitness", "Photography", "Art", "Dance", "Startups", "Spirituality"];

interface Db {
  phone?: string; signedIn: boolean;
  profile?: Record<string, unknown> & { first_name: string; gender: Gender; onboarding_step: number; selfie_status: OnboardingState["selfie_status"]; created: number };
  consents: string[]; city?: City; birth?: Birth; photos: Photo[]; prompts: { key: string; answer: string }[];
  interests: number[]; prefs?: Prefs; bonus?: number; kundliAt?: number; pushTokens: string[];
  // member app
  spent?: number; likes?: string[]; passes?: string[]; matches?: { id: string; other: string; at: number }[];
  seenLikes?: boolean; kickOpen?: string; reports?: string[]; golden?: string[]; filters?: Filters;
  chats?: Record<string, Msg[]>; guru?: Record<string, { packs: number; msgs: GuruState["messages"] }>;
  saathi?: { character: SaathiChar; styles: string[] };
  purchased?: number; orders?: Record<string, { type: "pack" | "subscription"; key: string; amount: number; at: number; done?: boolean }>;
  subs?: Record<string, number>; readings?: (ReadingFull & { readyAt: number })[]; prepaid?: number; crush?: CrushCheck[]; gifts?: GiftItem[];
  suitsSort?: boolean; ledger?: { delta: number; kind: string; reason: string; at: string }[]; saathiMsgs?: SaathiState["history"]; saathiUsed?: { day: string; n: number; extra: number };
}
const CRISIS = /suicide|kill myself|end my life|self.?harm|marna chahta|marna chahti|jeena nahi/i;
const CRISIS_REPLY = "I'm really glad you told me. You deserve support from a real person right now. Please call Tele-MANAS on 14416 " +
  "(free, 24x7, many languages) or 1-800-891-4416. If you are in danger right now, call 112. I'm here to keep talking too.";
const PRICES: Prices = { cosmic_like: 9, full_report: 29, golden_hours: 19, daily_kick: 10, cupid_opener: 15, check_anyone: 29, check_anyone_5: 119, guru_20: 29, saathi_50: 25, who_suits_me: 49, why_not: 79, gift: 99, boost: 29, travel_mode: 29, top_matches_india: 49 };
const LABELS: Record<string, string> = { daily_kick: "Daily Kick", golden_hours: "Golden Hours", full_report: "Compatibility report", cosmic_like: "Cosmic Like",
  cupid_opener: "Cupid opener", check_anyone: "Check With Anyone", check_anyone_5: "Check With Anyone 5-pack", guru_20: "Guru Ji, 20 questions",
  saathi_50: "Saathi top-up", who_suits_me: "Who Suits Me", why_not: "Why It Didn't Work", gift: "Gift a Reading" };
const PACKS = [{ id: "starter", label: "Starter", price_paise: 9900, credits: 100, bonus_pct: 0 }, { id: "popular", label: "Popular", price_paise: 24900, credits: 275, bonus_pct: 10 },
  { id: "best", label: "Best value", price_paise: 49900, credits: 600, bonus_pct: 20 }, { id: "big", label: "Big", price_paise: 99900, credits: 1300, bonus_pct: 30 }];
const PLANS = [{ key: "couple_mode", label: "Couple Mode", price_paise: 14900, interval: "month" as const, trial_note: "One pays, both get it" },
  { key: "kick_pass", label: "Kick Pass", price_paise: 19900, interval: "month" as const, trial_note: null },
  { key: "rishta_maasi", label: "Rishta Maasi", price_paise: 29900, interval: "month" as const, trial_note: "First Sunday free" },
  { key: "next_12_months", label: "Our Next 12 Months", price_paise: 49900, interval: "year" as const, trial_note: null }];
const TIERS = [{ key: "tara" as const, label: "Tara", discount: 5, min_conversations: 0, min_streak_days: 0 },
  { key: "graha" as const, label: "Graha", discount: 10, min_conversations: 5, min_streak_days: 7 },
  { key: "surya" as const, label: "Surya", discount: 20, min_conversations: 15, min_streak_days: 21 }];
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

const fresh = (): Db => ({ signedIn: false, consents: [], photos: [], prompts: [], interests: [], pushTokens: [] });
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));

export class DemoApi implements Api {
  readonly demo = true;
  private load(): Db {
    try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return fresh(); }
  }
  private save(db: Db) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* private mode */ } }
  private edit(fn: (db: Db) => void) { const db = this.load(); fn(db); this.save(db); return db; }
  private me(db: Db) { if (!db.profile) throw new Error("Please start again."); return db.profile; }

  async sendOtp(phone: string) { await wait(); if (!/^\+\d{10,14}$/.test(phone)) throw new Error("Enter a valid mobile number."); this.edit((d) => { d.phone = phone; }); }
  async verifyOtp(_p: string, code: string) { await wait(); if (code !== "123456") throw new Error("That code didn't work. (Demo code: 123456)"); this.edit((d) => { d.signedIn = true; }); }
  async signedIn() { return this.load().signedIn; }
  async signOut() { localStorage.removeItem(KEY); }

  async settings(): Promise<PublicSettings> {
    return { onboarding_step_credits: { woman: [19, 19, 18, 19, 19, 18, 19, 19], man: [9, 9, 8, 9, 9, 8, 9, 9] },
             welcome_bonus: { woman: 150, man: 70, expiry_days: 90 } };
  }

  async state(): Promise<OnboardingState> {
    const db = this.load();
    if (!db.profile) return { has_profile: false };
    return {
      has_profile: true, first_name: db.profile.first_name, gender: db.profile.gender, step: db.profile.onboarding_step,
      pct: this.pct(db), selfie_status: db.profile.selfie_status, goal: (db.profile.goal as Goal) ?? null, city: db.city ?? null,
      has_birth: !!db.birth, photos: db.photos.length, prompts: db.prompts.length, has_prefs: !!db.prefs,
      kundli_ready: !!db.kundliAt && Date.now() > db.kundliAt, consents: db.consents,
      status: this.pct(db) >= 75 && db.profile.selfie_status === "passed" ? "active" : "onboarding",
    };
  }

  private pct(db: Db) {
    const p = db.profile; if (!p) return 0;
    const parts = [p.first_name && db.city && p.height_cm && p.profession, p.diet && p.drinking && p.smoking, db.birth,
      db.photos.length >= 2, p.selfie_status === "passed", db.prompts.length >= 2, p.goal, db.prefs];
    return Math.floor(parts.filter(Boolean).length * 100 / 8);
  }

  async createProfile(first_name: string, gender: Gender, consents: string[]) {
    await wait();
    this.edit((d) => {
      d.profile = d.profile ?? { first_name, gender, onboarding_step: 1, selfie_status: "not_started", created: Date.now() };
      d.profile.first_name = first_name;
      d.consents = [...new Set([...d.consents, ...consents])];
    });
  }
  async saveBasics(b: Basics) { await wait(); this.edit((d) => { Object.assign(this.me(d), b); }); }
  async setCity(p: Place): Promise<City> {
    await wait();
    const c = CITIES.find((x) => x.name.toLowerCase() === p.name.toLowerCase())
      ?? { id: `c-${p.name.toLowerCase()}`, slug: p.name.toLowerCase(), name: p.name, status: "locked" as const };
    this.edit((d) => { d.city = c; });
    return c;
  }
  async saveLifestyle(l: Lifestyle) { await wait(); this.edit((d) => { Object.assign(this.me(d), l); }); }
  async saveBirth(b: Birth) {
    await wait();
    const age = (Date.now() - new Date(b.date).getTime()) / (365.25 * 864e5);
    if (age < 18) throw new Error("Likha is for people 18 and older.");
    this.edit((d) => { if (!d.birth) { d.birth = b; d.kundliAt = Date.now() + 2500; } });
  }
  async photos() { return this.load().photos; }
  async uploadPhoto(file: Blob, position: number): Promise<Photo> {
    const url = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(file); });
    const ph: Photo = { id: crypto.randomUUID(), position, url, status: "approved" };
    this.edit((d) => { d.photos = [...d.photos.filter((x) => x.position !== position), ph].sort((a, b) => a.position - b.position); });
    return ph;
  }
  async removePhoto(id: string) { this.edit((d) => { d.photos = d.photos.filter((p) => p.id !== id); }); }
  async startSelfie(): Promise<SelfieResult> {
    await wait(1200);
    this.edit((d) => { this.me(d).selfie_status = "passed"; });
    return { status: "passed" };
  }
  async interests(): Promise<Interest[]> { return INTERESTS.map((label, i) => ({ id: i + 1, slug: label.toLowerCase(), label })); }
  async saveVibe(prompts: { key: string; answer: string }[], ids: number[]) {
    await wait(); this.edit((d) => { d.prompts = prompts.filter((p) => p.answer.trim()); d.interests = ids; });
  }
  async uploadVoice() { await wait(); this.edit((d) => { this.me(d).voice = true; }); }
  async saveGoal(goal: Goal) { await wait(); this.edit((d) => { this.me(d).goal = goal; }); }
  async savePrefs(p: Prefs) { await wait(); this.edit((d) => { d.prefs = p; }); }
  async setStep(step: number) { this.edit((d) => { const p = this.me(d); p.onboarding_step = Math.max(p.onboarding_step, step); }); }
  async refresh(): Promise<Refresh> {
    const db = this.load(); const pct = this.pct(db);
    let granted = false;
    if (pct === 100 && db.bonus === undefined && db.profile) {
      granted = true;
      this.edit((d) => { d.bonus = d.profile!.gender === "woman" ? 150 : 70; });
    }
    return { pct, bonus_granted: granted, balance: this.load().bonus ?? 0 };
  }
  async cityQueue(): Promise<CityQueue | null> {
    const db = this.load(); if (!db.city) return null;
    return { city: db.city.name, slug: db.city.slug, status: db.city.status, threshold: 1000, members: 612, position: 847,
             invite_code: "aarav7", live_cities: ["Jaipur"], next_cities: ["Pune", "Ahmedabad", "Dubai"] };
  }
  async myChart(): Promise<MyChart | null> {
    const db = this.load();
    if (!db.kundliAt || Date.now() < db.kundliAt) return null;
    const P = (planet: string, sign: number, house: number) => ({ planet, sign, sign_name: "", house, retro: false, nakshatra: "" });
    return {
      summary: { lagna: "Leo", moon_sign: "Pisces", nakshatra: "Revati", pada: 2, manglik: false, manglik_reason: null,
                 current_dasha: "Mercury–Venus", borderline: false },
      planets: [P("Mars", 6, 3), P("Ketu", 9, 6), P("Sun", 10, 7), P("Mercury", 10, 7), P("Moon", 11, 8), P("Venus", 11, 8),
                P("Saturn", 0, 9), P("Jupiter", 1, 10), P("Rahu", 3, 12)],
      dasha: { maha: "Mercury", antar: "Venus", antar_end: "2028-04-11" },
      mahadashas: [{ lord: "Saturn", start: "1995-06-02", end: "2014-06-02" }, { lord: "Mercury", start: "2014-06-02", end: "2031-06-02" },
                   { lord: "Ketu", start: "2031-06-02", end: "2038-06-02" }, { lord: "Venus", start: "2038-06-02", end: "2058-06-02" }],
    };
  }
  async savePushToken(t: string) { this.edit((d) => { d.pushTokens.push(t); }); }

  // ---------------------------------------------------------------- member app (sample profiles, clearly labelled)
  private pool(db: Db): Card[] {
    const want = db.profile?.gender === "man" ? "woman" : "man";
    return SAMPLES.filter((x) => x.gender === want).map(({ gender: _g, likesYou: _l, ...c }) => ({ ...c, is_sample: true }));
  }
  private likers(db: Db) { const want = db.profile?.gender === "man" ? "woman" : "man"; return SAMPLES.filter((x) => x.gender === want && x.likesYou); }
  private balance(db: Db) { return (db.bonus ?? 0) + (db.purchased ?? 0) - (db.spent ?? 0); }
  private spend(key: string) {
    const db = this.load();
    if (this.balance(db) < PRICES[key]) throw new Error("Not enough credits. Top up your wallet to continue.");
    this.edit((d) => { d.spent = (d.spent ?? 0) + PRICES[key];
      d.ledger = [{ delta: -PRICES[key], kind: "spend", reason: LABELS[key] ?? key, at: new Date().toISOString() }, ...(d.ledger ?? [])]; });
  }
  private kick(db: Db): Kick {
    const open = db.kickOpen === today();
    const pl = dayPlan(26.9124, 75.7873, "Asia/Kolkata");                         // same maths as the overnight writer
    const w = (h: { start: number; end: number } | null) => h ? range(h.start, h.end) : "–";
    return {
      date: today(), unlocked: open, streak: open ? 1 : 0,
      teaser: { vibe: 8, date_score: 7, love_weather: "Venus is flirting with your 7th house", line: "Bold first moves land well tonight.",
                lucky_window: pl.love ? w(pl.love) : null, rahu_kaal: range(pl.rahu[0], pl.rahu[1]) },
      content: open ? {
        fix: ["Wear something yellow today.", "Say \"Om Budhaya Namah\" 11 times before work.", "Call the friend you've been meaning to call."],
        time_windows: [{ label: "Office and meetings", time: w(pl.office) }, { label: "Travel", time: w(pl.travel) },
                       { label: "Date or chat", time: w(pl.love) }, { label: "Avoid big money moves (Rahu Kaal)", time: range(pl.rahu[0], pl.rahu[1]) }],
        first_date_answer: "Yes, after sunset. A calm, chatty evening.", tara: "Sampat", today_moon: "Rohini in Taurus",
      } : null,
    };
  }
  private visible(db: Db) {
    const gone = new Set([...(db.likes ?? []), ...(db.passes ?? [])]);
    const f = db.filters;
    return this.pool(db).filter((c) => !gone.has(c.id) && (!f || ((c.age ?? 0) >= f.age_min && (c.age ?? 0) <= f.age_max
      && (f.distance === "any_city" || c.city === (db.city?.name ?? "Jaipur")) && (!f.goals.length || !c.goal || f.goals.includes(c.goal))
      && (!f.diets.length || (c.diet && f.diets.includes(c.diet))))))
      .sort((a, b) => (b.jodi_score ?? 0) - (a.jodi_score ?? 0));
  }

  async home(): Promise<HomeData> {
    await wait(150);
    const db = this.load(); const p = this.me(db);
    const day = Math.floor((Date.now() - p.created) / 864e5) + 1;
    return {
      first_name: p.first_name, gender: p.gender, tier: "none", status: "active", pct: this.pct(db),
      city: { name: db.city?.name ?? "Jaipur", lat: 26.9124, lng: 75.7873, timezone: "Asia/Kolkata", status: db.city?.status ?? "live" },
      balance: this.balance(db), kick: this.kick(db), kick_pass: (db.subs?.kick_pass ?? 0) > Date.now(), kick_price: PRICES.daily_kick, streak: db.kickOpen === today() ? 1 : 0,
      likes_count: (await this.likesMe()).length, top: this.visible(db).slice(0, 4),
      feature: { key: "golden_hours", title: "Golden Hours", body: "The best time to text each match. Try it, +5 credits", link: "/matches", reward: 5, day: Math.max(day, 2) },
      unread: 0,
    };
  }
  async prices() { return PRICES; }
  async unlockKick() {
    const db = this.load();
    if (db.kickOpen !== today()) { if (!((db.subs?.kick_pass ?? 0) > Date.now())) this.spend("daily_kick"); this.edit((d) => { d.kickOpen = today(); }); }
    return this.kick(this.load());
  }
  async discover(offset = 0) { await wait(150); return this.visible(this.load()).slice(offset, offset + 10); }
  async discoverCount(anyCity = false) {
    const db = this.load();
    if (!anyCity) return this.visible(db).length;
    const keep = db.filters; this.edit((d) => { d.filters = { ...(keep ?? this.defaults()), distance: "any_city" }; });
    const n = this.visible(this.load()).length; this.edit((d) => { d.filters = keep; });
    return n;
  }
  async pulse(): Promise<Pulse | null> { return { city: this.load().city?.name ?? "Jaipur", matches_last_hour: 2, top_score: 94, minutes_ago: 2 }; }
  async profile(id: string): Promise<ProfileFull> {
    await wait(150);
    const db = this.load();
    const p = sampleProfile(id);
    if (!p) throw new Error("This profile isn't available any more.");
    const m = (db.matches ?? []).find((x) => x.other === id);
    return { ...p, is_sample: true, i_liked: (db.likes ?? []).includes(id), match_id: m?.id ?? null,
             liked_me: this.likers(db).some((x) => x.id === id) };
  }
  async like(id: string, kind: "like" | "cosmic_like" = "like"): Promise<LikeResult> {
    await wait(200);
    const db = this.load();
    if ((db.likes ?? []).includes(id)) return { matched: false, already_liked: true };
    if (kind === "cosmic_like") this.spend("cosmic_like");
    this.edit((d) => { d.likes = [...(d.likes ?? []), id]; });
    if (this.likers(db).some((x) => x.id === id)) {
      const mid = `m-${id}`;
      this.edit((d) => { d.matches = [...(d.matches ?? []), { id: mid, other: id, at: Date.now() }]; });
      return { matched: true, match_id: mid };
    }
    return { matched: false };
  }
  async pass(id: string) { this.edit((d) => { d.passes = [...(d.passes ?? []), id]; }); }
  async likesMe(): Promise<LikeCard[]> {
    const db = this.load(); const gone = new Set([...(db.likes ?? []), ...(db.passes ?? [])]);
    return this.likers(db).filter((x) => !gone.has(x.id)).map(({ gender: _g, likesYou, ...c }, i) => ({
      ...c, is_sample: true, liked_at: new Date(Date.now() - (likesYou as number) * 3600e3).toISOString(), kind: i === 0 ? "cosmic_like" : "like",
      note: i === 0 ? "Chai at Tapri, Sunday?" : null, new: !db.seenLikes }));
  }
  async markLikesSeen() { this.edit((d) => { d.seenLikes = true; }); }
  async matches(): Promise<MatchRow[]> {
    const db = this.load();
    return (db.matches ?? []).map((m) => {
      const o = sampleProfile(m.other)!;
      return { match_id: m.id, matched_at: new Date(m.at).toISOString(), other_id: o.id, first_name: o.first_name, age: o.age, photo: null,
               jodi_score: o.jodi_score, gunas: o.gunas, last_body: null, last_kind: null, last_from_me: null, last_at: null, unread: 0, couple: false };
    }).reverse();
  }
  private defaults(): Filters {
    return { age_min: 21, age_max: 35, distance: "same_city", diets: [], goals: ["dating", "matchmaking"], languages: [],
             height_min_cm: null, height_max_cm: null, active_this_week: true, has_voice_intro: false };
  }
  async filters() { const db = this.load(); return db.filters ?? { ...this.defaults(), ...(db.prefs ?? {}) } as Filters; }
  async saveFilters(f: Filters) { await wait(150); this.edit((d) => { d.filters = f; }); }
  async compatReport(otherId: string): Promise<Reading> {
    const db = this.load();
    if (!(db.reports ?? []).includes(otherId)) { this.spend("full_report"); this.edit((d) => { d.reports = [...(d.reports ?? []), otherId]; }); await wait(900); }
    return (await this.reading("compat_report", otherId))!;
  }
  async reading(kind: string, otherId?: string): Promise<Reading | null> {
    if (kind !== "compat_report" || !otherId || !(this.load().reports ?? []).includes(otherId)) return null;
    const o = sampleProfile(otherId)!;
    return { id: `r-${otherId}`, status: "ready", content: {
      title: `You and ${o.first_name}`, summary: `${o.gunas}/36 Gunas and a Jodi Score of ${o.jodi_score}. Sample reading for demo mode.`,
      sections: [{ heading: "Strengths", body: "Easy trust. Shared humour. Similar pace for big decisions." },
                 { heading: "Watch-outs", body: "One of you plans, the other improvises. Talk money early." }],
      try_this: "Plan one small trip together and see who packs first." } };
  }
  async goldenUnlocked(matchId: string) { return (this.load().golden ?? []).includes(matchId); }
  async unlockGolden(matchId: string) {
    if ((this.load().golden ?? []).includes(matchId)) return;
    this.spend("golden_hours"); this.edit((d) => { d.golden = [...(d.golden ?? []), matchId]; });
  }

  // ---------------------------------------------------------------- chat (demo: sample people send one sample reply)
  private other(matchId: string) { const id = (this.load().matches ?? []).find((m) => m.id === matchId)?.other; return id ? sampleProfile(id) : null; }
  async chat(matchId: string): Promise<ChatData> {
    await wait(120);
    const o = this.other(matchId);
    if (!o) throw new Error("This chat has ended.");
    return { match_id: matchId, open: true, jodi_score: o.jodi_score, gunas: o.gunas,
             other: { id: o.id, first_name: o.first_name, age: o.age, photo: null, is_sample: true }, messages: this.load().chats?.[matchId] ?? [] };
  }
  private push(matchId: string, m: Msg) { this.edit((d) => { d.chats = { ...(d.chats ?? {}), [matchId]: [...(d.chats?.[matchId] ?? []), m] }; }); }
  private listeners = new Map<string, (m: Msg) => void>();
  private replyLater(matchId: string) {
    const mine = (this.load().chats?.[matchId] ?? []).filter((m) => m.mine).length;
    if (mine !== 1) return;                                                  // one sample reply per chat, then it's quiet
    setTimeout(() => {
      const m: Msg = { id: crypto.randomUUID(), mine: false, kind: "text", body: "Ha, nice one! (sample reply in demo mode)", media_url: null, held: false, read_at: null, created_at: new Date().toISOString() };
      this.push(matchId, m); this.listeners.get(matchId)?.(m);
    }, 1200);
  }
  async sendMessage(matchId: string, body: string): Promise<Msg> {
    if (!body.trim()) throw new Error("Type a message first.");
    const held = /(https?:\/\/|www\.|\b[6-9]\d{9}\b)/i.test(body) && (this.load().chats?.[matchId] ?? []).filter((m) => m.mine).length < 10;
    const m: Msg = { id: crypto.randomUUID(), mine: true, kind: "text", body: body.trim(), media_url: null, held, read_at: null, created_at: new Date().toISOString() };
    this.push(matchId, m); if (!held) this.replyLater(matchId);
    return m;
  }
  async sendVoice(matchId: string, audio: Blob): Promise<Msg> {
    const url = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(audio); });
    const m: Msg = { id: crypto.randomUUID(), mine: true, kind: "voice", body: null, media_url: url, held: false, read_at: null, created_at: new Date().toISOString() };
    this.push(matchId, m); this.replyLater(matchId);
    return m;
  }
  async markRead() { /* nothing to do in demo */ }
  onMessages(matchId: string, cb: (m: Msg) => void) { this.listeners.set(matchId, cb); return () => { this.listeners.delete(matchId); }; }
  async openers(matchId: string) {
    this.spend("cupid_opener"); await wait(600);
    const o = this.other(matchId);
    return [`Okay ${o?.first_name ?? "you"}, window seat on a train or a plane? This is a compatibility question.`,
            "Your Sunday plan sounds perfect. Kachori first or the walk first?", "Two steady Moons, apparently. Want to test that over chai?"];
  }

  // ---------------------------------------------------------------- Guru Ji (demo: sample answers)
  private guruOf(db: Db, matchId: string) { return db.guru?.[matchId] ?? { packs: 0, msgs: [] }; }
  async guru(matchId: string): Promise<GuruState> {
    const g = this.guruOf(this.load(), matchId);
    const used = g.msgs.filter((m) => m.from !== "guru").length, allowed = 3 + g.packs * 20;
    return { allowed, used, left: Math.max(0, allowed - used), pack_questions: 20, other_name: this.other(matchId)?.first_name ?? "", waiting: false, messages: g.msgs };
  }
  async askGuru(matchId: string, question: string) {
    if (!question.trim()) throw new Error("Type a question first.");
    if ((await this.guru(matchId)).left <= 0) throw new Error("No questions left for you two. Get 20 more to keep asking.");
    const now = () => new Date().toISOString();
    this.edit((d) => {
      const g = this.guruOf(d, matchId);
      g.msgs = [...g.msgs, { id: Date.now(), from: "me", body: question.trim(), created_at: now() },
        { id: Date.now() + 1, from: "guru", body: "Your Moons get along well, so plans made together tend to stick. Pick a calm weekend and keep it simple. (Sample answer in demo mode.)", created_at: now() }];
      d.guru = { ...(d.guru ?? {}), [matchId]: g };
    });
    await wait(700);
    return this.guru(matchId);
  }
  async buyGuru(matchId: string) {
    this.spend("guru_20");
    this.edit((d) => { const g = this.guruOf(d, matchId); g.packs++; d.guru = { ...(d.guru ?? {}), [matchId]: g }; });
    return this.guru(matchId);
  }

  // ---------------------------------------------------------------- Saathi (demo: sample replies)
  private saathiLeft(db: Db) { const u = db.saathiUsed?.day === today() ? db.saathiUsed : { day: today(), n: 0, extra: 0 }; return 30 + u.extra - u.n; }
  async saathi(): Promise<SaathiState> {
    const db = this.load();
    const m = (db.matches ?? []).find((x) => (db.chats?.[x.id] ?? []).length >= 6);
    return { available: true, setup: !!db.saathi, character: db.saathi?.character ?? "chandni", styles: db.saathi?.styles ?? ["friendly", "hinglish"],
             left: this.saathiLeft(db), free_per_day: 30, topup_messages: 50, paused: !!m,
             pause_match: m ? { match_id: m.id, first_name: sampleProfile(m.other)?.first_name ?? "" } : null,
             top_today: this.visible(db).filter((c) => (c.jodi_score ?? 0) >= 90).length, history: db.saathiMsgs ?? [] };
  }
  async saathiSetup(character: SaathiChar, styles: string[]) { this.edit((d) => { d.saathi = { character, styles }; }); }
  async saathiSend(_c: SaathiChar, text: string): Promise<SaathiReply> {
    const db = this.load();
    if (this.saathiLeft(db) <= 0) return { reply: null, topup: true, message: "That's today's free chats. Top up for 50 more." };
    const crisis = CRISIS.test(text);
    const reply = crisis ? CRISIS_REPLY : "I hear you. Swiping can be tiring. Want to practise a reply to your newest match together? (Sample reply in demo mode.)";
    this.edit((d) => {
      const u = d.saathiUsed?.day === today() ? d.saathiUsed : { day: today(), n: 0, extra: 0 };
      d.saathiUsed = { ...u, n: u.n + 1 };
      d.saathiMsgs = [...(d.saathiMsgs ?? []), { role: "user", body: text }, { role: "assistant", body: reply }];
    });
    await wait(600);
    return { reply, crisis, left: this.saathiLeft(this.load()) };
  }
  async saathiTopup() {
    this.spend("saathi_50");
    this.edit((d) => { const u = d.saathiUsed?.day === today() ? d.saathiUsed : { day: today(), n: 0, extra: 0 }; d.saathiUsed = { ...u, extra: u.extra + 50 }; });
    return this.saathiLeft(this.load());
  }

  // ---------------------------------------------------------------- wallet and payments (demo: no money moves; a payment "lands" after 2 s)
  private settle() {
    this.edit((d) => {
      for (const [id, o] of Object.entries(d.orders ?? {})) {
        if (o.done || Date.now() - o.at < 2000) continue;
        o.done = true;
        if (o.type === "pack") {
          const p = PACKS.find((x) => x.id === o.key)!;
          d.purchased = (d.purchased ?? 0) + p.credits;
          d.ledger = [{ delta: p.credits, kind: "purchase", reason: `Pack ${p.label} (demo)`, at: new Date().toISOString() }, ...(d.ledger ?? [])];
        } else {
          d.subs = { ...(d.subs ?? {}), [o.key]: Math.max(d.subs?.[o.key] ?? 0, Date.now()) + 30 * 864e5 };
        }
        void id;
      }
    });
  }
  private tierInfo(db: Db) {
    const conv = (db.matches ?? []).filter((m) => { const c = db.chats?.[m.id] ?? []; return c.filter((x) => x.mine).length >= 5 && c.filter((x) => !x.mine).length >= 5; }).length;
    const streak = db.kickOpen === today() ? 1 : 0;
    return { tier: "none" as const, label: "No tier", discount: 0, paused_until: null, conversations: conv, streak, qualifies_for: "tara" as const, next: TIERS[0], tiers: TIERS };
  }
  async wallet(): Promise<Wallet> {
    this.settle(); await wait(120);
    const db = this.load();
    const bonusLeft = Math.max(0, Math.min(db.bonus ?? 0, this.balance(db)));
    return { balance: this.balance(db), expiring: null, packs: PACKS,
      plans: PLANS.map((p) => ({ ...p, active_until: (db.subs?.[p.key] ?? 0) > Date.now() ? new Date(db.subs![p.key]).toISOString() : null })),
      tier: this.tierInfo(db),
      activity: [...(db.ledger ?? []), ...(db.bonus ? [{ delta: db.bonus, kind: "bonus", reason: `Welcome bonus (${bonusLeft} left)`, at: new Date((db.profile?.created ?? Date.now())).toISOString() }] : [])] };
  }
  async pay(type: "pack" | "subscription", key: string, _upi: UpiApp) {
    await wait(500);
    const price = (type === "pack" ? PACKS.find((p) => p.id === key)?.price_paise : PLANS.find((p) => p.key === key)?.price_paise);
    if (!price) throw new Error("That item isn't on sale.");
    const id = `demo_${Math.random().toString(36).slice(2, 10)}`;
    this.edit((d) => { d.orders = { ...(d.orders ?? {}), [id]: { type, key, amount: price, at: Date.now() } }; });
    return { order_id: id, paid: true };
  }
  async paymentStatus(orderId: string): Promise<PaymentStatus | null> {
    this.settle();
    const db = this.load(); const o = db.orders?.[orderId];
    if (!o) return null;
    return { status: o.done ? "captured" : "created", credited: !!o.done, item_type: o.type, item_key: o.key, amount_paise: o.amount,
             payment_ref: o.done ? `pay_${orderId.slice(5)}` : null, invoice_no: o.done ? "LKH/DEMO" : null,
             credits: o.type === "pack" ? PACKS.find((p) => p.id === o.key)!.credits : null, balance: this.balance(db) };
  }

  // ---------------------------------------------------------------- store readings (demo: sample text, ready after 1.5 s)
  async startReading(kind: "who_suits_me" | "why_not", subject?: Record<string, unknown>) {
    if (kind === "why_not" && (!subject?.name || !subject?.birth_date)) throw new Error("Name and date of birth, please.");
    this.spend(kind);
    const id = `r-${kind}-${Date.now()}`;
    const name = kind === "why_not" ? String(subject?.name) : null;
    const content = kind === "who_suits_me" ? {
      title: "Your chart looks for someone steady, playful and patient", summary: "Sample reading in demo mode.",
      sections: [{ heading: "What your 7th house asks for", body: "Someone who calms your big plans without dimming them. A shared love of home, food and family." },
                 { heading: "How you love", body: "Slow to open up, then all in. Small, steady gestures matter more to you than big ones." }],
      try_this: "Notice who makes you laugh easily. That's usually the sign." }
      : { title: `You and ${name}`, summary: "Sample reading in demo mode.",
          sections: [{ heading: "What pulled you together", body: "Two Moons that liked the same quiet things." },
                     { heading: "Where your charts clashed", body: "One of you needed space when the other needed talk." },
                     { heading: "What to look for next time", body: "Someone whose pace matches yours on big decisions." }],
          try_this: "Write down three things you'd keep from that relationship." };
    const r = { id, kind, status: "generating" as const, content, created_at: new Date().toISOString(), credits_charged: PRICES[kind], helpful: null, name,
      suits: kind === "who_suits_me" ? { nakshatras: [3, 7, 25], moon_signs: [3, 7, 11, 1], best_score: 30.5 } : null, readyAt: Date.now() + 1500 };
    this.edit((d) => { d.readings = [r, ...(d.readings ?? [])]; });
    return id;
  }
  async readingView(id: string): Promise<ReadingFull | null> {
    const r = (this.load().readings ?? []).find((x) => x.id === id);
    if (!r) return null;
    const ready = Date.now() >= r.readyAt;
    const { readyAt: _r, ...rest } = r;
    return { ...rest, status: ready ? "ready" : "generating", content: ready ? r.content : null };
  }
  async myReadings(): Promise<ReadingItem[]> {
    return (this.load().readings ?? []).map((r) => ({ id: r.id, kind: r.kind, status: Date.now() >= r.readyAt ? "ready" : "generating", created_at: r.created_at, name: r.name }));
  }
  async setSuitsSort(on: boolean) {
    if (on && !(this.load().readings ?? []).some((r) => r.kind === "who_suits_me")) throw new Error("Buy Who Suits Me first.");
    this.edit((d) => { d.suitsSort = on; });
  }
  async buyCheckPack() { this.spend("check_anyone_5"); this.edit((d) => { d.prepaid = (d.prepaid ?? 0) + 5; }); return this.load().prepaid!; }
  async createCrushCheck(name: string, phone: string, relation: string) {
    if (!name.trim()) throw new Error("Their first name, please.");
    if (!/^(91)?[6-9]\d{9}$/.test(phone.replace(/\D/g, "").replace(/^0/, ""))) throw new Error("Enter a valid Indian mobile number.");
    const pre = (this.load().prepaid ?? 0) > 0;
    if (pre) this.edit((d) => { d.prepaid = (d.prepaid ?? 0) - 1; }); else this.spend("check_anyone");
    const c: CrushCheck = { id: crypto.randomUUID(), name: name.trim(), relation, token: Math.random().toString(36).slice(2, 12), joined: false,
      expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), reading_id: crypto.randomUUID(), status: "pending_consent" };
    this.edit((d) => { d.crush = [c, ...(d.crush ?? [])]; });
    return { token: c.token, reading_id: c.reading_id, prepaid: pre };
  }
  async myCrushChecks() { const db = this.load(); return { prepaid: db.prepaid ?? 0, checks: db.crush ?? [] }; }
  async sendGift(name: string, phone: string, kind: string, note: string, deliverOn: string) {
    if (!name.trim()) throw new Error("Their name, please.");
    if (!/^(91)?[6-9]\d{9}$/.test(phone.replace(/\D/g, "").replace(/^0/, ""))) throw new Error("Enter a valid Indian mobile number.");
    if (deliverOn < today()) throw new Error("Pick today or a later date.");
    this.spend("gift");
    const g: GiftItem = { id: crypto.randomUUID(), name: name.trim(), kind, note: note || null, token: Math.random().toString(36).slice(2, 12), deliver_on: deliverOn,
      opened: false, expires_at: new Date(Date.now() + 30 * 864e5).toISOString() };
    this.edit((d) => { d.gifts = [g, ...(d.gifts ?? [])]; });
    return g.token;
  }
  async myGifts() { return this.load().gifts ?? []; }
  async maasi(): Promise<MaasiState> {
    const db = this.load(); const on = (db.subs?.rishta_maasi ?? 0) > Date.now();
    const notes = ["She's a Taurus Moon. You need someone steady. (Sample pick.)", "Two planners, one kitchen. (Sample pick.)", "Lower Gunas, but your Moons are friends. (Sample pick.)"];
    return { until: on ? new Date(db.subs!.rishta_maasi).toISOString() : null, price_paise: 29900,
      picks: on ? this.pool(db).slice(0, 3).map((c, i) => ({ ...c, pick_id: `mp-${c.id}`, note: notes[i], response: null, week_of: today() })) : [] };
  }
  async answerMaasi(pickId: string, interested: boolean) {
    return interested ? this.like(pickId.replace(/^mp-/, "")) : { matched: false };
  }
}
