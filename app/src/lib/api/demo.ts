// Demo backend: everything lives in this browser. Used for design reviews and automated tests.
// OTP code is always 123456. Selfie always passes. The kundli is a fixed sample chart.
import type {
  Announcement, BoostState, ConsentNeeded, ConsentReq, CoupleKind, CoupleState, CrushLanding, CupidLink, CupidState, DueCheckin, GiftLanding, Invites, SevenState, Story, StoryEvent,
  TravelCity, TravelState, Universe,
  AccountState, DateShare, History, Invoice, MyProfile, Notice, NotifPrefs, ProfilePatch, ReportReason, Ticket, Toolkit, TrustedContact,
  CrushCheck, GiftItem, MaasiState, PaymentStatus, ReadingFull, ReadingItem, UpiApp, Wallet,
  ChatData, GuruState, Msg, SaathiChar, SaathiReply, SaathiState,
  CityCounter, WaitlistJoin, WaitlistResult,
  Api, Basics, Birth, Card, City, CityQueue, Filters, Gender, Goal, HomeData, Interest, Kick, LikeCard, LikeResult, Lifestyle,
  MatchRow, MyChart, OnboardingState, Photo, Place, Prefs, Prices, ProfileFull, PublicSettings, Pulse, Reading, Refresh, SelfieResult,
} from "./types";
import { SAMPLES, sampleProfile } from "./samples";
import { dayPlan, range } from "../panchang";
import { SEVEN } from "../seven";

const KEY = "likha-demo-db";
/** Optional overrides a reviewer (or a test) can set to see what Admin changes look like in the app. */
const ADMIN_KEY = "likha-demo-admin";
interface DemoAdminView { maintenance?: string; minVersion?: string; verification?: { selfie: "auto" | "manual" | "api"; photos: "auto" | "manual" | "api" }; features?: Record<string, boolean>; announcement?: Announcement; consent?: ConsentNeeded }
const adminView = (): DemoAdminView => { try { return JSON.parse(localStorage.getItem(ADMIN_KEY) ?? "{}"); } catch { return {}; } };
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
  subs?: Record<string, number>; readings?: (ReadingFull & { readyAt: number; consentAt?: number; waiting?: boolean })[]; prepaid?: number; crush?: CrushCheck[]; gifts?: GiftItem[];
  suitsSort?: boolean;
  nprefs?: NotifPrefs; contacts?: TrustedContact[]; blocked?: { id: string; first_name: string; since: string }[]; shares?: DateShare[];
  sos?: { id: string; token: string; share_until: string; lat: number | null; lng: number | null; updated_at: string }[]; reads?: number;
  tickets?: Ticket[]; grievances?: number; tried?: string[]; deleted?: boolean; otpSent?: boolean; reportsMade?: number;
  ledger?: { delta: number; kind: string; reason: string; at: string }[]; saathiMsgs?: SaathiState["history"]; saathiUsed?: { day: string; n: number; extra: number };
  // couples and growth
  couples?: Record<string, { otherAt: number; ended?: boolean }>; seven?: Record<string, { reading: string; mine: Record<string, string> }>;
  moments?: Record<string, StoryEvent[]>; checked?: string[]; boostAt?: { id: string; starts: number; ends: number };
  trip?: { id: string; city: string; from: string; to: string }; consentDone?: string[]; inviteUsed?: string; cupidFrom?: string;
  cupid?: { links: CupidLink[]; kyc: string | null };
}
const CRISIS = /suicide|kill myself|end my life|self.?harm|marna chahta|marna chahti|jeena nahi/i;
const CRISIS_REPLY = "I'm really glad you told me. You deserve support from a real person right now. Please call Tele-MANAS on 14416 " +
  "(free, 24x7, many languages) or 1-800-891-4416. If you are in danger right now, call 112. I'm here to keep talking too.";
const PRICES: Prices = { our_stars: 49, our_alignment: 49, imagine_us: 49, seven_questions: 39, cosmic_like: 9, full_report: 29, golden_hours: 19, daily_kick: 10, cupid_opener: 15, check_anyone: 29, check_anyone_5: 119, guru_20: 29, saathi_50: 25, who_suits_me: 49, why_not: 79, gift: 99, boost: 29, travel_mode: 29, top_matches_india: 49 };
const LABELS: Record<string, string> = { daily_kick: "Daily Kick", golden_hours: "Golden Hours", full_report: "Compatibility report", cosmic_like: "Cosmic Like",
  cupid_opener: "Cupid opener", check_anyone: "Check With Anyone", check_anyone_5: "Check With Anyone 5-pack", guru_20: "Guru Ji, 20 questions",
  saathi_50: "Saathi top-up", who_suits_me: "Who Suits Me", why_not: "Why It Didn't Work", gift: "Gift a Reading",
  our_stars: "Our Stars", our_alignment: "Our Alignment", imagine_us: "Imagine Us", seven_questions: "Seven Questions", boost: "Boost", travel_mode: "Travel Mode" };
/** Same keys as feature_schedule: only these reward a first try. */
const TOOLKIT_KEYS = ["daily_kick", "golden_hours", "check_anyone", "saathi", "our_universe", "cupid_opener", "gift", "who_suits_me", "my_kundli", "travel_mode"];
const COUPLE_KINDS = ["our_stars", "our_alignment", "imagine_us", "seven_questions"];
/** Demo stand-in for an Imagine Us picture: a drawn scene with the same "Imagined" label the real ones carry. */
function imaginedSvg(scene: string, n: number) {
  const sky = { travel: ["#FFB27A", "#7E5BEF"], wedding: ["#FFD36E", "#E8456B"], old_age: ["#F6E7C8", "#8A6F4E"] }[scene] ?? ["#FFB27A", "#7E5BEF"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs><rect width="640" height="640" fill="url(#g)"/>` +
    `<circle cx="${n ? 470 : 170}" cy="150" r="60" fill="#fff" opacity=".55"/><path d="M0 470 Q160 400 320 450 T640 430 V640 H0Z" fill="#1F1A3D" opacity=".35"/>` +
    `<g fill="#1F1A3D" opacity=".8"><circle cx="270" cy="330" r="34"/><rect x="236" y="368" width="68" height="120" rx="30"/>` +
    `<circle cx="370" cy="322" r="34"/><rect x="336" y="360" width="68" height="128" rx="30"/></g>` +
    `<rect x="20" y="572" width="380" height="44" rx="12" fill="#000" opacity=".6"/><text x="36" y="601" font-family="sans-serif" font-size="20" fill="#fff">` +
    `Imagined · Likha · not a real photo</text><text x="620" y="40" text-anchor="end" font-family="sans-serif" font-size="18" fill="#fff">SAMPLE</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
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
             welcome_bonus: { woman: 150, man: 70, expiry_days: 90 },
             grievance_officer: { name: "[NAME]", email: "grievance@likha.in", phone: "[NUMBER]", ack_hours: 24, resolve_days: 15 },
             company: { legal_name: "[COMPANY NAME] Private Limited", gstin: "[GSTIN]", cin: "[CIN]", address: "[ADDRESS], Jaipur, Rajasthan" },
             app: { maintenance: !!adminView().maintenance, maintenance_message: adminView().maintenance, support_email: "support@likha.in", min_app_version: adminView().minVersion ?? "1.0.0" },
             max_age_filter: 60, gender_options: ["woman", "man"], gender_theme: { woman: "#E0457B", man: "#2F6FE0" },
             verification_modes: adminView().verification ?? { selfie: "api", photos: "api" }, photos: { min: 2, max: 6 }, prompts: { required: 2, max_length: 300, interests_min: 3, interests_max: 10 }, saathi: { max_session_minutes: 45 } };
  }

  async myFeatures() { return { love_stories: false, hindi: false, porutham: false, ...(adminView().features ?? {}) }; }
  async myAnnouncement() { return adminView().announcement ?? null; }
  async consentsNeeded() {
    const c = adminView().consent; const db = this.load();
    return c && db.profile && !db.consents.includes(`${c.key}@${c.version}`) ? [c] : [];
  }
  async acceptConsents(items: { key: string; version: string }[]) {
    await wait(); this.edit((d) => { d.consents = [...d.consents, ...items.map((i) => `${i.key}@${i.version}`)]; });
  }

  async state(): Promise<OnboardingState> {
    let db = this.load();
    if (db.profile && !(db.profile as Record<string, unknown>).wasActive && this.pct(db) >= 75 && db.profile.selfie_status === "passed") {
      db = this.edit((d) => { (d.profile as Record<string, unknown>).wasActive = true; });
    }
    if (!db.profile) return { has_profile: false };
    return {
      has_profile: true, first_name: db.profile.first_name, gender: db.profile.gender, step: db.profile.onboarding_step,
      pct: this.pct(db), selfie_status: db.profile.selfie_status, goal: (db.profile.goal as Goal) ?? null, city: db.city ?? null,
      has_birth: !!db.birth, photos: db.photos.length, prompts: db.prompts.length, has_prefs: !!db.prefs,
      kundli_ready: !!db.kundliAt && Date.now() > db.kundliAt, consents: db.consents,
      // like the database: becoming active needs a passed selfie; once active, a re-check (name or main photo change) keeps you active
      status: (db.profile as Record<string, unknown>).wasActive || (this.pct(db) >= 75 && db.profile.selfie_status === "passed") ? "active" : "onboarding",
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
    const mode = adminView().verification?.selfie ?? "api";          // demo default: behaves like a connected check that passes
    if (mode === "manual") { this.edit((d) => { this.me(d).selfie_status = "manual_review"; }); return { status: "manual_review" }; }
    this.edit((d) => { this.me(d).selfie_status = "passed"; (this.me(d) as Record<string, unknown>).selfie_auto = mode === "auto"; });
    return mode === "auto" ? { status: "passed", auto: true } : { status: "passed" };
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
  async releasePushToken(token: string) { this.edit((d) => { d.pushTokens = d.pushTokens.filter((t) => t !== token); }); }

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
      unread: 0, notices: (await this.notices()).filter((n) => !n.read).length,
    };
  }
  /** Like the database: the first Cosmic Like each IST week is free (Admin > Pricing > free Cosmic Likes). */
  private cosmicFree() {
    const wk = Math.floor((Date.now() + 5.5 * 3600e3 - 4 * 864e5) / (7 * 864e5));       // weeks start Monday, IST
    const c = (this.load() as unknown as { cosmicWeek?: { wk: number; n: number } }).cosmicWeek;
    return { wk, left: Math.max(0, 1 - (c && c.wk === wk ? c.n : 0)) };
  }
  async prices() { return this.cosmicFree().left > 0 ? { ...PRICES, cosmic_like: 0 } : PRICES; }
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
    if (kind === "cosmic_like") {
      const { wk, left } = this.cosmicFree();
      if (left <= 0) this.spend("cosmic_like");
      this.edit((d) => { const x = d as unknown as { cosmicWeek?: { wk: number; n: number } }; x.cosmicWeek = { wk, n: (x.cosmicWeek?.wk === wk ? x.cosmicWeek.n : 0) + 1 }; });
    }
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
               jodi_score: o.jodi_score, gunas: o.gunas, last_body: null, last_kind: null, last_from_me: null, last_at: null, unread: 0, couple: !!db.couples?.[m.id] && !db.couples[m.id].ended && Date.now() >= db.couples[m.id].otherAt };
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
    const x = r as typeof r & { consentAt?: number; waiting?: boolean };
    if (x.waiting) return { ...r, status: "pending_consent", content: null };
    const ready = Date.now() >= r.readyAt;
    const { readyAt: _r, ...rest } = r;
    return { ...rest, status: x.consentAt && Date.now() < x.consentAt ? "pending_consent" : ready ? "ready" : "generating", content: ready ? r.content : null };
  }
  async myReadings(): Promise<ReadingItem[]> {
    return (this.load().readings ?? []).map((r) => ({ id: r.id, kind: r.kind, created_at: r.created_at, name: r.name,
      status: (r as { waiting?: boolean }).waiting ? "pending_consent" : Date.now() >= r.readyAt ? "ready" : "generating" }));
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

  // ---------------------------------------------------------------- me, settings, privacy (demo)
  async myProfile(): Promise<MyProfile> {
    const db = this.load(); const p = this.me(db) as Record<string, unknown>;
    const g = (k: string) => (p[k] ?? null) as never;
    return { id: "demo-me", first_name: p.first_name as string, gender: p.gender as Gender, age: 29, city: db.city?.name ?? "Jaipur", height_cm: g("height_cm"),
      mother_tongue: g("mother_tongue"), languages: (p.languages as string[]) ?? [], education: g("education"), profession: g("profession"), company: g("company"),
      college: g("college"), hometown: g("hometown"), diet: g("diet"), drinking: g("drinking"), smoking: g("smoking"), workout: g("workout"), kids: g("kids"),
      relocate: g("relocate"), religion: g("religion"), show_religion: !!p.show_religion, goal: g("goal"), bio: g("bio"), voice_intro_path: p.voice ? "voice" : null,
      status: "active", selfie_status: (p.selfie_status as string) ?? "passed", selfie_auto: !!p.selfie_auto, profile_complete_pct: this.pct(db), tier: "none",
      incognito: !!p.incognito, i_message_first: !!p.i_message_first, hide_company: !!p.hide_company, read_receipts: p.read_receipts !== false,
      show_online: p.show_online !== false, paused: !!p.paused, language_pref: (p.language_pref as MyProfile["language_pref"]) ?? "hinglish",
      photos: db.photos, prompts: db.prompts.map((x) => ({ key: x.key, label: x.key === "about_you" ? "About me" : x.key === "fond_of" ? "I'm fond of" : "The planets got me right about…", answer: x.answer })),
      interests: db.interests, birth: db.birth ? { date: db.birth.date, time: db.birth.time, place: db.birth.place.label } : null,
      balance: this.balance(db), streak: db.kickOpen === today() ? 1 : 0, matches: (db.matches ?? []).length, bonus_waiting: this.pct(db) < 100 ? (p.gender === "woman" ? 150 : 70) : null };
  }
  async saveProfile(patch: ProfilePatch) {
    await wait(150);
    this.edit((d) => {
      const p = this.me(d);
      if (patch.first_name && patch.first_name !== p.first_name && p.selfie_status === "passed") p.selfie_status = "manual_review";
      Object.assign(p, patch);
    });
  }
  async notifPrefs() { return this.load().nprefs ?? { kick_time: "07:00", new_likes: true, matches: true, golden_hours: true, offers: false, quiet_start: "23:00", quiet_end: "07:00" }; }
  async saveNotifPrefs(p: NotifPrefs) { this.edit((d) => { d.nprefs = p; }); }
  async trustedContacts() { return this.load().contacts ?? []; }
  async addTrustedContact(name: string, phone: string, relation: string) {
    if (!name.trim()) throw new Error("Their name, please.");
    if (!/^(\+?91)?0?[6-9]\d{9}$/.test(phone.replace(/[\s-]/g, ""))) throw new Error("Enter a valid Indian mobile number.");
    const c = { id: crypto.randomUUID(), name: name.trim(), phone: phone.trim(), relation: relation || null };
    this.edit((d) => { d.contacts = [...(d.contacts ?? []), c]; });
    return c;
  }
  async removeTrustedContact(id: string) { this.edit((d) => { d.contacts = (d.contacts ?? []).filter((c) => c.id !== id); }); }
  async blocks() { return this.load().blocked ?? []; }
  async unblock(id: string) { this.edit((d) => { d.blocked = (d.blocked ?? []).filter((b) => b.id !== id); }); }
  async block(id: string) {
    const o = sampleProfile(id);
    this.edit((d) => {
      d.blocked = [...(d.blocked ?? []).filter((b) => b.id !== id), { id, first_name: o?.first_name ?? "Someone", since: new Date().toISOString() }];
      d.matches = (d.matches ?? []).filter((m) => m.other !== id); d.passes = [...(d.passes ?? []), id];
    });
  }
  async unmatch(matchId: string) { this.edit((d) => { const m = (d.matches ?? []).find((x) => x.id === matchId); d.matches = (d.matches ?? []).filter((x) => x.id !== matchId); if (m) d.passes = [...(d.passes ?? []), m.other]; }); }
  async report(id: string, _reason: ReportReason, _details: string, alsoBlock: boolean) {
    await wait(300); if (alsoBlock) await this.block(id);
    this.edit((d) => { d.reportsMade = (d.reportsMade ?? 0) + 1; });
  }
  async sendDeleteOtp() { await wait(300); this.edit((d) => { d.otpSent = true; }); }
  async deleteAccount(code: string) {
    if (code !== "123456") throw new Error("That code didn't work. (Demo code: 123456)");
    const lost = this.balance(this.load());
    localStorage.removeItem("likha-demo-db");
    return { credits_lost: lost };
  }

  // ---------------------------------------------------------------- safety (demo: nothing is sent)
  async shareDate(matchId: string | null, place: string, startsAt: Date, checkinAt: Date, contactIds: string[]) {
    if (!place.trim()) throw new Error("Where are you meeting?");
    if (!contactIds.length) throw new Error("Add someone you trust first.");
    if (checkinAt <= startsAt) throw new Error("Check-in must be after the start.");
    const db = this.load();
    const m = (db.matches ?? []).find((x) => x.id === matchId);
    const s: DateShare = { id: crypto.randomUUID(), place: place.trim(), starts_at: startsAt.toISOString(), checkin_at: checkinAt.toISOString(), status: "scheduled",
      match_id: matchId, with: m ? sampleProfile(m.other)?.first_name ?? null : null, contacts: (db.contacts ?? []).filter((c) => contactIds.includes(c.id)), alert_after_minutes: 15 };
    this.edit((d) => { d.shares = [s, ...(d.shares ?? [])]; });
    return s.id;
  }
  async dateShare(id: string) { return (this.load().shares ?? []).find((s) => s.id === id) ?? null; }
  async checkin(id: string, answer: "ok" | "later" | "help") {
    this.edit((d) => { const s = (d.shares ?? []).find((x) => x.id === id); if (!s) return;
      if (answer === "ok") s.status = "ok"; else if (answer === "help") s.status = "help";
      else { s.status = "scheduled"; s.checkin_at = new Date(Math.max(Date.parse(s.checkin_at), Date.now()) + 3600e3).toISOString(); } });
    return (await this.dateShare(id))!;
  }
  async sosStart(_m: string | null, lat: number | null, lng: number | null) {
    const s = { id: crypto.randomUUID(), token: Math.random().toString(36).slice(2, 14), share_until: new Date(Date.now() + 2 * 3600e3).toISOString(), lat, lng, updated_at: new Date().toISOString() };
    this.edit((d) => { d.sos = [s, ...(d.sos ?? [])]; });
    return { id: s.id, token: s.token, share_until: s.share_until };
  }
  async sosUpdate(id: string, lat: number, lng: number) { this.edit((d) => { const s = (d.sos ?? []).find((x) => x.id === id); if (s) { s.lat = lat; s.lng = lng; s.updated_at = new Date().toISOString(); } }); }
  async sosStop(id: string) { this.edit((d) => { const s = (d.sos ?? []).find((x) => x.id === id); if (s) s.share_until = new Date().toISOString(); }); }
  async sosView(token: string) {
    const db = this.load(); const s = (db.sos ?? []).find((x) => x.token === token && Date.parse(x.share_until) > Date.now());
    return s ? { first_name: db.profile?.first_name ?? "", lat: s.lat, lng: s.lng, updated_at: s.updated_at, share_until: s.share_until } : null;
  }

  // ---------------------------------------------------------------- inbox, history, help, account (demo)
  async notices(): Promise<Notice[]> {
    const db = this.load(); const out: Notice[] = []; let id = 1;
    const read = (n: number) => (db.reads ?? 0) >= n;
    for (const l of await this.likesMe()) out.push({ id: id++, type: "like", title: l.kind === "cosmic_like" ? "A Cosmic Like for you" : "Someone likes you",
      body: `Someone with ${l.jodi_score}% liked you`, data: { link: "/likes" }, read: read(1), created_at: l.liked_at, group: "likes" });
    for (const m of db.matches ?? []) out.push({ id: id++, type: "match", title: "It's a match!", body: `You and ${sampleProfile(m.other)?.first_name}. Ab baat karo!`,
      data: { link: `/match/${m.id}` }, read: read(1), created_at: new Date(m.at).toISOString(), group: "likes" });
    for (const r of db.readings ?? []) out.push({ id: id++, type: "reading_ready", title: "Your reading is ready", body: "Tap to read it.", data: { link: `/readings/${r.id}` },
      read: read(1), created_at: r.created_at, group: "readings" });
    for (const a of (db.ledger ?? []).filter((x) => x.kind === "purchase")) out.push({ id: id++, type: "payment", title: `${a.delta} credits added`, body: a.reason,
      data: { link: "/plans" }, read: read(1), created_at: a.at, group: "account" });
    return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  async markAllRead() { this.edit((d) => { d.reads = 1; }); }
  async history(): Promise<History> {
    const db = this.load(); this.settle();
    let bal = (db.bonus ?? 0);
    const rows = [...(db.ledger ?? [])].reverse().map((l) => { bal += l.delta; return { at: l.at, reason: l.reason, delta: l.delta, kind: l.kind, balance: bal }; });
    return {
      plans: Object.entries(db.subs ?? {}).map(([key, until]) => ({ id: key, key, label: PLANS.find((p) => p.key === key)?.label ?? key, price_paise: PLANS.find((p) => p.key === key)?.price_paise ?? 0,
        interval: "month", status: until > Date.now() ? "active" : "expired", until: new Date(until).toISOString() })),
      ledger: [...rows.reverse(), ...(db.bonus ? [{ at: new Date(db.profile?.created ?? Date.now()).toISOString(), reason: "Welcome bonus", delta: db.bonus, kind: "bonus", balance: db.bonus }] : [])],
      invoices: Object.entries(db.orders ?? {}).filter(([, o]) => o.done).map(([id, o]) => ({ id, invoice_no: `LKH/DEMO/${id.slice(5, 9)}`, amount_paise: o.amount,
        gst_paise: Math.round(o.amount - o.amount / 1.18), item: o.type === "pack" ? `${PACKS.find((p) => p.id === o.key)?.credits} credits` : PLANS.find((p) => p.key === o.key)?.label ?? o.key,
        at: new Date(o.at).toISOString() })),
    };
  }
  async invoice(id: string): Promise<Invoice | null> {
    const inv = (await this.history()).invoices.find((x) => x.id === id);
    if (!inv) return null;
    return { invoice_no: inv.invoice_no, date: inv.at, amount_paise: inv.amount_paise, gst_paise: inv.gst_paise, taxable_paise: inv.amount_paise - inv.gst_paise,
      method: "upi", payment_ref: `pay_${id.slice(5)}`, item: inv.item, sac: "[SAC]",
      company: { legal_name: "[COMPANY NAME] Private Limited", gstin: "[GSTIN]", cin: "[CIN]", address: "[ADDRESS], Jaipur, Rajasthan" },
      customer: { name: this.load().profile?.first_name ?? "", phone: this.load().phone ?? null } };
  }
  async openTicket(subject: string, body: string) {
    if (!body.trim()) throw new Error("Tell us what happened.");
    const t: Ticket = { id: crypto.randomUUID(), subject: subject || "Help", status: "open", created_at: new Date().toISOString(),
      messages: [{ from: "me", body: body.trim(), at: new Date().toISOString() }] };
    this.edit((d) => { d.tickets = [t, ...(d.tickets ?? [])]; });
    return t.id;
  }
  async tickets() { return this.load().tickets ?? []; }
  async replyTicket(id: string, body: string) { this.edit((d) => { const t = (d.tickets ?? []).find((x) => x.id === id); t?.messages.push({ from: "me", body, at: new Date().toISOString() }); }); }
  async fileGrievance(_c: string, description: string) {
    if (!description.trim()) throw new Error("Tell us what happened.");
    await wait(300);
    const n = (this.load().grievances ?? 0) + 1000; this.edit((d) => { d.grievances = (d.grievances ?? 0) + 1; });
    return { ticket_no: `GR-${n}`, resolve_due_at: new Date(Date.now() + 15 * 864e5).toISOString() };
  }
  async accountState(): Promise<AccountState> {
    const p = this.load().profile;
    return { status: "active", selfie_status: (p?.selfie_status as string) ?? "passed", paused: !!p?.paused, tier_paused_until: null, action: null };
  }
  async appeal() { await wait(200); }
  async toolkit(): Promise<Toolkit> {
    const t = this.load().tried ?? [];
    const items = [["check_anyone", "Check With Anyone", "Crush, ex or co-founder", "/check"], ["saathi", "Saathi", "Chat till you match", "/saathi"],
      ["cupid_opener", "Cupid opener", "First line, sorted", "/matches"], ["gift", "Gift a Reading", "A birthday surprise", "/gift"],
      ["who_suits_me", "Who Suits Me", "What your chart wants", "/my-kundli?tab=suits"], ["my_kundli", "My Kundli", "Chart and dasha", "/my-kundli"],
      ["golden_hours", "Golden Hours", "Best times to talk", "/matches"], ["daily_kick", "Daily Kick", "Your day, decoded", "/kick"]];
    return { reward: 5, items: items.map(([key, title, body, link]) => ({ key, title, body, link, tried: t.includes(key) })) };
  }
  async tried(key: string) {
    const db = this.load(); if ((db.tried ?? []).includes(key) || !TOOLKIT_KEYS.includes(key)) return false;
    this.edit((d) => { d.tried = [...(d.tried ?? []), key]; d.purchased = (d.purchased ?? 0) + 5;
      d.ledger = [{ delta: 5, kind: "reward", reason: `Tried ${key.replace(/_/g, " ")}`, at: new Date().toISOString() }, ...(d.ledger ?? [])]; });
    return true;
  }
  // ---------------------------------------------------------------- couples and growth (demo: the sample partner says yes)
  private match(db: Db, matchId: string) {
    const m = (db.matches ?? []).find((x) => x.id === matchId);
    if (!m) throw new Error("This match isn't available any more.");
    return { m, o: sampleProfile(m.other)! };
  }
  private plus(db: Db) { return (db.subs?.couple_mode ?? 0) > Date.now(); }
  private cprice(db: Db, key: string) { return COUPLE_KINDS.includes(key) || key === "guru_20" ? (this.plus(db) ? Math.round(PRICES[key] * 0.8) : PRICES[key]) : PRICES[key]; }
  private charge(key: string, amount: number) {
    if (this.balance(this.load()) < amount) throw new Error("Not enough credits. Top up your wallet to continue.");
    this.edit((d) => { d.spent = (d.spent ?? 0) + amount;
      d.ledger = [{ delta: -amount, kind: "spend", reason: LABELS[key] ?? key, at: new Date().toISOString() }, ...(d.ledger ?? [])]; });
  }
  private coupleContent(kind: string, me: string, other: string, scene?: string): Reading["content"] {
    if (kind === "imagine_us") return { title: `Imagined: ${{ travel: "Travel", wedding: "Wedding", old_age: "At 70" }[scene ?? "travel"]}`, summary: "", sections: [], try_this: "",
      images: [imaginedSvg(scene ?? "travel", 0), imaginedSvg(scene ?? "travel", 1)], imagined: true, scene };
    const t: Record<string, Reading["content"]> = {
      our_stars: { title: `${me} and ${other}: easy warmth, different speeds`, summary: "Sample reading in demo mode.",
        sections: [{ heading: "What flows easily", body: "Your Moons are friends. Small talk turns into long talk quickly." },
                   { heading: "What needs care", body: "One of you decides fast, the other slowly. Name it early." },
                   { heading: "One thing to try", body: "Cook one meal together, start to finish." }], try_this: "Plan a Sunday with no plan." },
      our_alignment: { title: "The next few months look steady", summary: "Sample reading in demo mode.",
        sections: [{ heading: "Where you both are", body: "You're in a building phase; they're in a settling one." },
                   { heading: "What that means together", body: "Good months for routines and shared plans." },
                   { heading: "Watch for", body: "Work stress around the change of season. Be each other's quiet place." }], try_this: "Pick one shared goal for the next 90 days." },
      seven_questions: { title: "Two planners, one playful streak", summary: "Sample reading in demo mode.",
        sections: [{ heading: "Where you match", body: "Sundays and money: you picked the same answers." },
                   { heading: "Where you differ", body: "How you handle a disagreement. Neither way is wrong." },
                   { heading: "Something to talk about", body: "Where you'd like to live in five years." }], try_this: "Ask each other the question you differed on most." },
    };
    return t[kind] ?? t.our_stars;
  }
  async universe(matchId: string): Promise<Universe> {
    await wait(120);
    const db = this.load(); const { m, o } = this.match(db, matchId);
    const readings: Universe["readings"] = {};
    for (const r of db.readings ?? []) {
      if (r.match_id !== matchId || !COUPLE_KINDS.includes(r.kind) || readings[r.kind as CoupleKind]) continue;
      const v = (await this.readingView(r.id))!;
      readings[r.kind as CoupleKind] = { id: r.id, status: v.status, mine: r.mine !== false };
    }
    return { match_id: m.id, other_id: o.id, other_name: o.first_name, tier: null, couple_plus: this.plus(db), always_allowed: false, readings,
      prices: { our_stars: this.cprice(db, "our_stars"), our_alignment: this.cprice(db, "our_alignment"), imagine_us: this.cprice(db, "imagine_us"),
                seven_questions: this.cprice(db, "seven_questions"), guru_20: this.cprice(db, "guru_20") } };
  }
  async startCoupleReading(matchId: string, kind: "our_stars" | "our_alignment" | "imagine_us", scene?: string) {
    const db = this.load(); const { o } = this.match(db, matchId);
    if (kind === "imagine_us" && !["travel", "wedding", "old_age"].includes(scene ?? "")) throw new Error("Pick a scene first.");
    if (kind === "imagine_us" && !db.photos.length) throw new Error("Both of your main photos need to be approved first.");
    const price = this.cprice(db, kind);
    this.charge(kind, price);
    const now = Date.now();
    const r = { id: `r-${kind}-${now}`, kind, status: "pending_consent" as const, content: this.coupleContent(kind, this.me(db).first_name, o.first_name, scene),
      created_at: new Date().toISOString(), credits_charged: price, helpful: null, name: o.first_name, suits: null, match_id: matchId, mine: true,
      consentAt: now + 2500, readyAt: now + 4000 };
    this.edit((d) => { d.readings = [r, ...(d.readings ?? [])]; });
    return { id: r.id, status: "pending_consent" as const };
  }
  async consentRequests(): Promise<ConsentReq[]> {
    const db = this.load(); const done = new Set(db.consentDone ?? []);
    return (db.matches ?? []).slice(0, 1).filter((m) => !done.has(`cr-${m.id}`)).map((m) => {
      const o = sampleProfile(m.other)!;
      return { id: `cr-${m.id}`, kind: "our_stars", from_id: o.id, from_name: o.first_name, scene: null, created_at: new Date(m.at + 60e3).toISOString() };
    });
  }
  async decideConsent(id: string, allow: boolean) {
    await wait(200);
    const matchId = id.replace(/^cr-/, "");
    this.edit((d) => { d.consentDone = [...(d.consentDone ?? []), id]; });
    if (!allow) return;
    const db = this.load(); const { o } = this.match(db, matchId);
    const r = { id: `r-our_stars-in-${Date.now()}`, kind: "our_stars", status: "generating" as const, content: this.coupleContent("our_stars", o.first_name, this.me(db).first_name),
      created_at: new Date().toISOString(), credits_charged: 0, helpful: null, name: o.first_name, suits: null, match_id: matchId, mine: false, readyAt: Date.now() + 1500 };
    this.edit((d) => { d.readings = [r, ...(d.readings ?? [])]; });
  }
  private sampleAnswer(o: { id: string }, q: number) { return SEVEN[q - 1].options[(o.id.charCodeAt(o.id.length - 1) + q) % 4]; }
  async seven(matchId: string): Promise<SevenState> {
    const db = this.load(); const { o } = this.match(db, matchId);
    const st = db.seven?.[matchId];
    const theirs: Record<string, string> = {};
    for (const q of Object.keys(st?.mine ?? {})) theirs[q] = this.sampleAnswer(o, +q);
    const r = st ? await this.readingView(st.reading) : null;
    return { other_name: o.first_name, mine: st?.mine ?? {}, theirs_count: st ? 7 : 0, theirs, reading: r ? { id: r.id, status: r.status } : null, price: this.cprice(db, "seven_questions") };
  }
  async startSeven(matchId: string) {
    const db = this.load(); const { o } = this.match(db, matchId);
    if (db.seven?.[matchId]) return db.seven[matchId].reading;
    const price = this.cprice(db, "seven_questions");
    this.charge("seven_questions", price);
    const id = `r-seven-${Date.now()}`;
    const r = { id, kind: "seven_questions", status: "pending_consent" as const, content: this.coupleContent("seven_questions", this.me(db).first_name, o.first_name),
      created_at: new Date().toISOString(), credits_charged: price, helpful: null, name: o.first_name, suits: null, match_id: matchId, mine: true, readyAt: 0, waiting: true };
    this.edit((d) => { d.readings = [r, ...(d.readings ?? [])]; d.seven = { ...(d.seven ?? {}), [matchId]: { reading: id, mine: {} } }; });
    return id;
  }
  async answerSeven(matchId: string, q: number, answer: string) {
    if (!answer.trim()) throw new Error("Pick an answer.");
    const db = this.edit((d) => {
      const st = d.seven?.[matchId]; if (!st) throw new Error("Start Seven Questions first.");
      st.mine[String(q)] = st.mine[String(q)] ?? answer;                       // answers are locked in
      if (Object.keys(st.mine).length === 7) {
        const r = (d.readings ?? []).find((x) => x.id === st.reading) as (ReadingFull & { readyAt: number; waiting?: boolean }) | undefined;
        if (r?.waiting) { r.waiting = false; r.readyAt = Date.now() + 1500; }
      }
    });
    return Object.keys(db.seven![matchId].mine).length;
  }
  async couple(matchId: string): Promise<CoupleState> {
    const db = this.load(); const { m, o } = this.match(db, matchId);
    const c = db.couples?.[matchId]; const on = !!c && !c.ended;
    return { match_id: m.id, matched_at: new Date(m.at).toISOString(), other_name: o.first_name, me_name: this.me(db).first_name,
      confirmed_me: on, confirmed_other: on && Date.now() >= c!.otherAt, started_at: on && Date.now() >= c!.otherAt ? new Date(c!.otherAt).toISOString() : null,
      plus: this.plus(db), plus_until: this.plus(db) ? new Date(db.subs!.couple_mode).toISOString() : null, plus_price_paise: 14900, year_price_paise: 49900,
      jodi_score: o.jodi_score, gunas: o.gunas };
  }
  async confirmCouple(matchId: string) {
    await wait(200);
    this.match(this.load(), matchId);
    this.edit((d) => { d.couples = { ...(d.couples ?? {}), [matchId]: { otherAt: Date.now() + 2500 } }; });   // the sample partner confirms a moment later
    return false;
  }
  async endCouple(matchId: string) { this.edit((d) => { if (d.couples?.[matchId]) d.couples[matchId].ended = true; }); }
  async story(matchId: string): Promise<Story> {
    const db = this.load(); const { m, o } = this.match(db, matchId);
    const ev: StoryEvent[] = [{ id: "e-match", kind: "match", title: "You matched", body: `${o.jodi_score}% Jodi Score`, photo_path: null, at: new Date(m.at).toISOString(), mine: false }];
    const first = (db.chats?.[matchId] ?? []).find((x) => x.kind === "text" && !x.held);
    if (first) ev.push({ id: "e-first", kind: "first_message", title: "First message", body: `"${(first.body ?? "").slice(0, 120)}"`, photo_path: null, at: first.created_at, mine: first.mine });
    const c = db.couples?.[matchId];
    if (c && !c.ended && Date.now() >= c.otherAt) ev.push({ id: "e-couple", kind: "couple_mode", title: "Couple Mode on", body: "Both profiles left Discover. Proud of you two.", photo_path: null, at: new Date(c.otherAt).toISOString(), mine: false });
    for (const r of db.readings ?? []) if (r.match_id === matchId && Date.now() >= r.readyAt && !(r as { waiting?: boolean }).waiting && r.readyAt)
      ev.push({ id: `e-${r.id}`, kind: "reading", title: { our_stars: "Read Our Stars together", our_alignment: "Read Our Alignment", seven_questions: "Played Seven Questions" }[r.kind] ?? "Imagined us",
                body: r.content?.title ? `"${r.content.title}"` : null, photo_path: null, at: new Date(r.readyAt).toISOString(), mine: r.mine !== false });
    for (const s of db.shares ?? []) if (s.match_id === matchId) ev.push({ id: `e-${s.id}`, kind: "date", title: `Date · ${s.place}`, body: "Shared with a friend for safety.", photo_path: null, at: s.starts_at, mine: true });
    ev.push(...(db.moments?.[matchId] ?? []));
    ev.sort((a, b) => a.at.localeCompare(b.at));
    return { days: Math.floor((Date.now() - m.at) / 864e5), dates: (db.shares ?? []).filter((s) => s.match_id === matchId).length, jodi_score: o.jodi_score,
             matched_at: new Date(m.at).toISOString(), events: ev };
  }
  async addMoment(matchId: string, title: string, body: string, at: Date, photo?: Blob | null) {
    if (!title.trim()) throw new Error("Give the moment a title.");
    const url = photo ? await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(photo); }) : null;
    const e: StoryEvent = { id: crypto.randomUUID(), kind: "custom", title: title.trim().slice(0, 80), body: body.trim() || null, photo_path: url, photo: url, at: at.toISOString(), mine: true };
    this.edit((d) => { d.moments = { ...(d.moments ?? {}), [matchId]: [...(d.moments?.[matchId] ?? []), e] }; });
  }
  async dueCheckins(): Promise<DueCheckin[]> {
    const db = this.load(); const done = new Set(db.checked ?? []);
    return (db.matches ?? []).flatMap((m) => {
      const c = db.chats?.[m.id] ?? []; const age = (Date.now() - m.at) / 864e5;
      const mark = [180, 90, 30].find((x) => age >= x) as 30 | 90 | 180 | undefined;
      if (!mark || !c.some((x) => x.mine) || !c.some((x) => !x.mine) || done.has(`${m.id}:${mark}`)) return [];
      const o = sampleProfile(m.other)!;
      return [{ match_id: m.id, day_mark: mark, other_name: o.first_name, matched_at: new Date(m.at).toISOString(), jodi_score: o.jodi_score }];
    });
  }
  async answerCheckin(matchId: string, day: number) { this.edit((d) => { d.checked = [...(d.checked ?? []), `${matchId}:${day}`]; }); }
  async boost(): Promise<BoostState> {
    const b = this.load().boostAt; const now = Date.now();
    return { price: PRICES.boost, list_price: PRICES.boost, boost: b && b.ends > now ? { id: b.id, starts_at: new Date(b.starts).toISOString(), ends_at: new Date(b.ends).toISOString(),
      live: now >= b.starts, views: now >= b.starts ? Math.min(40, Math.floor((now - b.starts) / 15000)) : 0 } : null };
  }
  async activateBoost(minutes: number, start: Date | null) {
    await wait(200);
    const st = Math.max(start?.getTime() ?? Date.now(), Date.now());
    if (st > Date.now() + 24 * 3600e3) throw new Error("Pick a time within the next 24 hours.");
    if ((await this.boost()).boost) throw new Error("You already have a Boost running or booked.");
    this.spend("boost");
    this.edit((d) => { d.boostAt = { id: crypto.randomUUID(), starts: st, ends: st + Math.min(Math.max(minutes, 15), 60) * 60e3 }; });
    return this.boost();
  }
  async noteView() { /* demo: nothing to count */ }
  async travelCity(p: Place): Promise<TravelCity> {
    await wait(200);
    const db = this.load(); const known = CITIES.find((c) => c.name.toLowerCase() === p.name.toLowerCase());
    return { id: known?.id ?? `c-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name: p.name, status: known?.status ?? "locked",
             people: known && known.status !== "locked" ? this.pool(db).length : 0,                     // demo: the sample profiles stand in for any open city
             top_score: known && known.status !== "locked" ? Math.max(...this.pool(db).map((c) => c.jodi_score ?? 0)) : null };
  }
  async travel(): Promise<TravelState> { const t = this.load().trip; return { price: PRICES.travel_mode, trip: t && t.to >= today() ? t : null }; }
  async startTravel(cityId: string, from: string, to: string) {
    if (to < from) throw new Error("The trip ends before it starts.");
    if (from < today()) throw new Error("Pick today or a later date.");
    this.spend("travel_mode");
    const name = CITIES.find((c) => c.id === cityId)?.name ?? cityId.replace(/^c-/, "").replace(/-/g, " ").replace(/\b\w/g, (x) => x.toUpperCase());
    this.edit((d) => { d.trip = { id: crypto.randomUUID(), city: name, from, to }; });
  }
  async endTravel() { this.edit((d) => { d.trip = undefined; }); }
  async invites(): Promise<Invites> {
    const db = this.load();
    return { code: `${(db.profile?.first_name ?? "friend").toLowerCase().replace(/[^a-z]/g, "")}-demo`, reward: 20, friend_reward: 20, max_per_month: 10, earned: 0, invites: [] };
  }
  async redeemInvite(code: string) {
    const db = this.load(); if (db.cupidFrom || db.inviteUsed) return false;
    if (!/^[a-z0-9-]{3,}$/i.test(code.trim())) throw new Error("That invite code didn't work.");
    this.edit((d) => { d.inviteUsed = code.trim().toLowerCase(); }); return true;
  }
  async attachCupid(code: string) {
    const db = this.load(); if (db.cupidFrom || db.inviteUsed) return false;
    this.edit((d) => { d.cupidFrom = code; }); return true;
  }
  async cupid(): Promise<CupidState> {
    const db = this.load(); const c = db.cupid;
    if (!c) return { is_cupid: false, enabled: true, signup_paise: 2000, first_paid_paise: 5000 };
    return { is_cupid: true, status: "active", rates: { signup_paise: 2000, first_paid_paise: 5000, hold_days: 30, min_payout_paise: 50000 }, links: c.links,
      people: { joined: 0, verified: 0, paid: 0 }, recent: [], money: { on_hold_paise: 0, withdrawable_paise: 0, paid_paise: 0, tds_this_fy_paise: 0 }, kyc: c.kyc, payouts: [] };
  }
  async becomeCupid() {
    await wait(200);
    const db = this.load();
    if (this.me(db).selfie_status !== "passed") throw new Error("Your selfie is being checked. Be a Cupid opens once you're verified.");
    if (!db.cupid) {
      const code = `${this.me(db).first_name.toLowerCase().replace(/[^a-z0-9]/g, "") || "cupid"}-${Math.random().toString(36).slice(2, 7)}`;
      this.edit((d) => { d.cupid = { kyc: null, links: [{ id: crypto.randomUUID(), code, label: "My link", target: "/", url: `https://likha.in/c/${code}`, active: true, clicks: 0, joined: 0 }] }; });
    }
    return this.cupid();
  }
  async createCupidLink(code: string, label: string, target: string) {
    const c = code.trim().toLowerCase();
    if (!/^[a-z0-9-]{3,24}$/.test(c)) throw new Error("Use 3 to 24 letters, numbers or dashes.");
    if (/(likha|official|support|admin|team)/.test(c)) throw new Error("Pick a different link name.");
    const db = this.load(); if (!db.cupid) throw new Error("Join Be a Cupid first.");
    if (db.cupid.links.some((l) => l.code === c)) throw new Error("That link name is taken.");
    if (db.cupid.links.length >= 20) throw new Error("That's the most links you can have.");
    this.edit((d) => { d.cupid!.links.push({ id: crypto.randomUUID(), code: c, label: label.trim() || c, target, url: `https://likha.in/c/${c}`, active: true, clicks: 0, joined: 0 }); });
  }
  async submitCupidKyc(name: string, pan: string, upi: string) {
    if (name.trim().length < 3) throw new Error("Your full name as on PAN, please.");
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.trim().toUpperCase())) throw new Error("That PAN doesn't look right (like ABCDE1234F).");
    if (!/^[\w.-]{2,}@[a-z]{2,}$/i.test(upi.trim())) throw new Error("That UPI ID doesn't look right (like name@okbank).");
    this.edit((d) => { if (d.cupid) d.cupid.kyc = "submitted"; });
  }
  async requestPayout() {
    const c = this.load().cupid;
    if (c?.kyc !== "verified") throw new Error("Add your PAN and UPI details first. We check them within 2 working days.");
    throw new Error("You can withdraw once you have ₹500 approved.");
  }
  async crushLanding(token: string): Promise<CrushLanding | null> {
    const c = (this.load().crush ?? []).find((x) => x.token === token);
    return c ? { name: c.name, open: !c.joined && c.expires_at > new Date().toISOString() } : null;
  }
  async giftLanding(token: string): Promise<GiftLanding | null> {
    const db = this.load(); const g = (db.gifts ?? []).find((x) => x.token === token);
    return g ? { name: g.name, from: db.profile?.first_name ?? "A friend", note: g.note, kind: g.kind, deliver_on: g.deliver_on, open: !g.opened } : null;
  }
  async claimCrush(token: string) {
    const db = this.load(); const c = (db.crush ?? []).find((x) => x.token === token);
    if (!c || c.joined) throw new Error("This link has expired or was already used.");
    const r = { id: c.reading_id, kind: "check_anyone", status: "generating" as const, created_at: new Date().toISOString(), credits_charged: 0, helpful: null, name: c.name, suits: null,
      content: { title: `You and ${c.name}`, summary: "Sample reading in demo mode.", sections: [{ heading: "How your Moons get along", body: "Friendly signs. Easy to talk to." },
        { heading: "Where you'll differ", body: "Pace. One of you likes plans, the other surprises." }], try_this: "Ask them about their favourite trip." }, readyAt: Date.now() + 1500 };
    this.edit((d) => { d.crush = (d.crush ?? []).map((x) => x.token === token ? { ...x, joined: true, status: "generating" } : x); d.readings = [r, ...(d.readings ?? [])]; });
    return r.id;
  }
  async openGift(token: string) {
    const db = this.load(); const g = (db.gifts ?? []).find((x) => x.token === token);
    if (!g || g.opened) throw new Error("This gift has expired or was already opened.");
    if (g.deliver_on > today()) throw new Error("This gift opens on the date they picked. Come back then.");
    const r = { id: `r-gift-${Date.now()}`, kind: "gift", status: "generating" as const, created_at: new Date().toISOString(), credits_charged: 0, helpful: null, name: null, suits: null,
      content: { title: "Your year ahead in love", summary: "Sample reading in demo mode.", sections: [{ heading: "The first months", body: "A slow, steady start. Good for friendships that turn into more." },
        { heading: "Later in the year", body: "More confidence. Say yes to the plans you'd usually skip." }], try_this: g.note ? `From your friend: "${g.note}"` : "Write down what you want this year." }, readyAt: Date.now() + 1500 };
    this.edit((d) => { d.gifts = (d.gifts ?? []).map((x) => x.token === token ? { ...x, opened: true } : x); d.readings = [r, ...(d.readings ?? [])]; });
    return r.id;
  }
  // Website: sample counts, clearly labelled on the page. Sign-ups stay in this browser.
  async cityCounters(): Promise<CityCounter[]> {
    await wait(100);
    const joined = this.waitlist();
    const base: Record<string, number> = { pune: 612, ahmedabad: 410, dubai: 288 };
    return CITIES.filter((c) => c.status !== "locked").map((c) => ({ slug: c.slug, name: c.name, status: c.status as "live" | "waitlist",
      members: c.status === "live" ? null : (base[c.slug] ?? 0) + joined.filter((j) => j.city === c.slug).length, unlock_threshold: c.slug === "dubai" ? 800 : 1000, sample: true }));
  }
  private waitlist(): { phone: string; city: string; code: string }[] { try { return JSON.parse(localStorage.getItem("likha-demo-waitlist") ?? "[]"); } catch { return []; } }
  async joinWaitlist(w: WaitlistJoin): Promise<WaitlistResult> {
    await wait();
    const name = w.first_name.trim();
    if (!name || name.length > 40 || /[<>{}\\/@0-9]/.test(name)) throw new Error("Enter your first name (letters only).");
    const d = w.phone.replace(/\D/g, "").replace(/^(91|0)(?=[6-9]\d{9}$)/, "");
    if (!/^[6-9]\d{9}$/.test(d) && !/^(971)?5\d{8}$/.test(d)) throw new Error("Enter a valid mobile number.");
    if (!w.consent) throw new Error("Tick the box to confirm you're 18+ and agree to the Terms and Privacy Policy.");
    const city = CITIES.find((c) => c.slug === w.city);
    if (!city || city.status === "locked") throw new Error("Pick a city from the list.");
    if (city.status === "live") return { city_live: true, city: city.name };
    const list = this.waitlist();
    if (list.some((j) => j.phone === d)) return { existing: true };
    const code = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
    list.push({ phone: d, city: w.city, code });
    try { localStorage.setItem("likha-demo-waitlist", JSON.stringify(list)); } catch { /* private mode */ }
    const base: Record<string, number> = { pune: 612, ahmedabad: 410, dubai: 288 };
    return { existing: false, position: (base[w.city] ?? 0) + list.filter((j) => j.city === w.city).length, invite_code: code, city: city.name,
      unlock_threshold: w.city === "dubai" ? 800 : 1000, jump_per_invite: 50 };
  }
}
