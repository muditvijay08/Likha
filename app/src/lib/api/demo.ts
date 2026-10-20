// Demo backend: everything lives in this browser. Used for design reviews and automated tests.
// OTP code is always 123456. Selfie always passes. The kundli is a fixed sample chart.
import type {
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
  saathi?: { character: SaathiChar; styles: string[] }; saathiMsgs?: SaathiState["history"]; saathiUsed?: { day: string; n: number; extra: number };
}
const CRISIS = /suicide|kill myself|end my life|self.?harm|marna chahta|marna chahti|jeena nahi/i;
const CRISIS_REPLY = "I'm really glad you told me. You deserve support from a real person right now. Please call Tele-MANAS on 14416 " +
  "(free, 24x7, many languages) or 1-800-891-4416. If you are in danger right now, call 112. I'm here to keep talking too.";
const PRICES: Prices = { cosmic_like: 9, full_report: 29, golden_hours: 19, daily_kick: 10, cupid_opener: 15, check_anyone: 29, guru_20: 29, saathi_50: 25, boost: 29, travel_mode: 29, top_matches_india: 49 };
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
    };
  }
  async savePushToken(t: string) { this.edit((d) => { d.pushTokens.push(t); }); }

  // ---------------------------------------------------------------- member app (sample profiles, clearly labelled)
  private pool(db: Db): Card[] {
    const want = db.profile?.gender === "man" ? "woman" : "man";
    return SAMPLES.filter((x) => x.gender === want).map(({ gender: _g, likesYou: _l, ...c }) => ({ ...c, is_sample: true }));
  }
  private likers(db: Db) { const want = db.profile?.gender === "man" ? "woman" : "man"; return SAMPLES.filter((x) => x.gender === want && x.likesYou); }
  private balance(db: Db) { return (db.bonus ?? 0) - (db.spent ?? 0); }
  private spend(key: string) {
    const db = this.load();
    if (this.balance(db) < PRICES[key]) throw new Error("Not enough credits. Top up your wallet to continue.");
    this.edit((d) => { d.spent = (d.spent ?? 0) + PRICES[key]; });
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
      balance: this.balance(db), kick: this.kick(db), kick_pass: false, kick_price: PRICES.daily_kick, streak: db.kickOpen === today() ? 1 : 0,
      likes_count: (await this.likesMe()).length, top: this.visible(db).slice(0, 4),
      feature: { key: "golden_hours", title: "Golden Hours", body: "The best time to text each match. Try it, +5 credits", link: "/matches", reward: 5, day: Math.max(day, 2) },
      unread: 0,
    };
  }
  async prices() { return PRICES; }
  async unlockKick() {
    const db = this.load();
    if (db.kickOpen !== today()) { this.spend("daily_kick"); this.edit((d) => { d.kickOpen = today(); }); }
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
}
