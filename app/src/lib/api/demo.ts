// Demo backend: everything lives in this browser. Used for design reviews and automated tests.
// OTP code is always 123456. Selfie always passes. The kundli is a fixed sample chart.
import type {
  Api, Basics, Birth, City, CityQueue, Gender, Goal, Interest, Lifestyle, MyChart, OnboardingState, Photo, Place, Prefs,
  PublicSettings, Refresh, SelfieResult,
} from "./types";

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
}

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
}
