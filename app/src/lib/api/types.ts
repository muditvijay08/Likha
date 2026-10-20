// The one interface every screen uses. Two implementations: Supabase (real) and Demo (in the browser).
export type Gender = "woman" | "man";
export type Goal = "dating" | "matchmaking";

export interface City { id: string; slug: string; name: string; status: "live" | "waitlist" | "locked" }

export interface OnboardingState {
  has_profile: boolean;
  first_name?: string;
  gender?: Gender;
  status?: string;
  step?: number;
  pct?: number;
  selfie_status?: "not_started" | "pending" | "passed" | "manual_review" | "failed";
  goal?: Goal | null;
  city?: City | null;
  has_birth?: boolean;
  photos?: number;
  prompts?: number;
  has_prefs?: boolean;
  kundli_ready?: boolean;
  consents?: string[];
}

export interface PublicSettings {
  onboarding_step_credits: Record<Gender, number[]>;
  welcome_bonus: { woman: number; man: number; expiry_days: number };
}

export interface Place {
  name: string;          // "Jaipur"
  state?: string;        // "Rajasthan"
  country: string;       // "IN"
  label: string;         // "Jaipur, Rajasthan, India"
  place_id?: string;
  lat: number;
  lng: number;
}

export interface Basics {
  first_name: string;
  show_me: Gender[];
  height_cm: number | null;
  mother_tongue: string;
  education: string;
  profession: string;
  languages?: string[];
  college?: string;
  company?: string;
  hometown?: string;
}

export interface Lifestyle {
  diet: string | null; drinking: string | null; smoking: string | null;
  workout: string | null; kids: string | null; relocate: string | null;
  religion: string | null; show_religion: boolean;
}

export interface Birth { date: string; time: string; place: Place; tz: string; offsetMinutes: number }

export interface Photo { id: string; position: number; url: string; status: "pending" | "approved" | "rejected" }

export interface Prefs { age_min: number; age_max: number; distance: "same_city" | "any_city"; diets: string[] }

export interface Interest { id: number; slug: string; label: string }

export interface Refresh { pct: number; bonus_granted: boolean; balance: number }

export interface ChartPlanet { planet: string; sign: number; sign_name: string; house: number; retro: boolean; nakshatra: string }
export interface MyChart {
  summary: { lagna: string; moon_sign: string; nakshatra: string; pada: number; manglik: boolean; manglik_reason: string | null;
             current_dasha: string | null; borderline: boolean };
  planets: ChartPlanet[];
  dasha: { maha: string; antar: string; antar_end: string } | null;
}

export interface CityQueue {
  city: string; slug: string; status: string; threshold: number; members: number; position: number;
  invite_code: string | null; live_cities: string[]; next_cities: string[];
}

export type SelfieResult = { status: "passed" | "pending" | "manual_review" | "failed"; message?: string };

// ---------------------------------------------------------------- member app (Home, Discover, Likes, Matches)
export type Tier = "none" | "tara" | "graha" | "surya";
export interface Card {
  id: string; first_name: string; age: number | null; profession: string | null; goal: Goal | null; tier: Tier; city: string | null;
  verified: boolean; diet: string | null; gunas: number | null; jodi_score: number | null; summary: string | null;
  moon_sign: string | null; nakshatra: string | null; manglik: boolean | null;
  photos: string[];                                   // signed URLs, approved photos only
  prompt: { label: string; answer: string } | null; interests: string[]; liked_me: boolean;
  is_sample?: boolean;                                // demo mode only: a labelled sample profile, never a real person
}
export interface Dosha { present: boolean; cancelled: boolean; reason: string | null }
export interface ProfileFull extends Card {
  height_cm: number | null; education: string | null; company: string | null; languages: string[]; drinking: string | null;
  smoking: string | null; kids: string | null; religion: string | null; voice_url: string | null;
  lagna: string | null; pada: number | null; borderline: boolean | null;
  prompts: { label: string; answer: string }[];
  kootas: Record<string, number> | null;
  doshas: { nadi?: Dosha; bhakoot?: Dosha; gana?: Dosha; manglik_match?: boolean } | null;
  i_liked: boolean; match_id: string | null;
}
export interface LikeCard extends Card { liked_at: string; kind: "like" | "cosmic_like"; note: string | null; new: boolean }
export interface MatchRow {
  match_id: string; matched_at: string; other_id: string; first_name: string; age: number | null; photo: string | null;
  jodi_score: number | null; gunas: number | null; last_body: string | null; last_kind: string | null; last_from_me: boolean | null;
  last_at: string | null; unread: number; couple: boolean;
}
export interface TimeWindow { label: string; time: string }
export interface Kick {
  date: string; unlocked: boolean; streak: number;
  teaser: { vibe: number; date_score: number; love_weather: string; line: string; lucky_window: string | null; rahu_kaal?: string };
  content: { fix: string[]; time_windows: TimeWindow[]; first_date_answer: string; tara?: string; today_moon?: string } | null;
}
export interface HomeCity { name: string; lat: number; lng: number; timezone: string; status: string }
export interface HomeData {
  first_name: string; gender: Gender; tier: Tier; status: string; pct: number; city: HomeCity | null; balance: number;
  kick: Kick | null; kick_pass: boolean; kick_price: number; streak: number; likes_count: number; top: Card[];
  feature: { key: string; title: string; body: string; link: string; reward: number; day: number } | null; unread: number;
}
export interface Pulse { city: string; matches_last_hour: number; top_score: number | null; minutes_ago: number }
export interface Filters {
  age_min: number; age_max: number; distance: "same_city" | "any_city"; diets: string[]; goals: Goal[]; languages: string[];
  height_min_cm: number | null; height_max_cm: number | null; active_this_week: boolean; has_voice_intro: boolean;
}
export interface LikeResult { matched: boolean; match_id?: string; already_liked?: boolean }
export interface Reading {
  id: string; status: "generating" | "ready" | "failed" | "refunded";
  content: { title: string; summary: string; sections: { heading: string; body: string }[]; try_this: string } | null;
}
export type Prices = Record<string, number>;

// ---------------------------------------------------------------- chat, Guru Ji, Saathi
export interface Msg { id: string; mine: boolean; kind: "text" | "voice" | "image" | "system"; body: string | null; media_url: string | null;
  held: boolean; read_at: string | null; created_at: string }
export interface ChatData {
  match_id: string; open: boolean; jodi_score: number | null; gunas: number | null;
  other: { id: string; first_name: string; age: number | null; photo: string | null; is_sample?: boolean }; messages: Msg[];
}
export interface GuruState { allowed: number; used: number; left: number; pack_questions: number; other_name: string; waiting: boolean;
  messages: { id: number; from: "me" | "them" | "guru"; body: string; created_at: string }[] }
export type SaathiChar = "chandni" | "dhruv";
export interface SaathiState {
  available: boolean; setup: boolean; character: SaathiChar; styles: string[]; left: number; free_per_day: number; topup_messages: number;
  paused: boolean; pause_match: { match_id: string; first_name: string } | null; top_today: number;
  history: { role: "user" | "assistant"; body: string; created_at?: string }[];
}
export interface SaathiReply { reply: string | null; left?: number; topup?: boolean; crisis?: boolean; message?: string }

export interface Api {
  readonly demo: boolean;
  sendOtp(phoneE164: string, channel: "sms" | "whatsapp"): Promise<void>;
  verifyOtp(phoneE164: string, code: string): Promise<void>;
  signedIn(): Promise<boolean>;
  signOut(): Promise<void>;
  settings(): Promise<PublicSettings>;
  state(): Promise<OnboardingState>;
  createProfile(firstName: string, gender: Gender, consents: string[]): Promise<void>;
  saveBasics(b: Basics): Promise<void>;
  setCity(p: Place, tz: string): Promise<City>;
  saveLifestyle(l: Lifestyle): Promise<void>;
  saveBirth(b: Birth): Promise<void>;
  photos(): Promise<Photo[]>;
  uploadPhoto(file: Blob, position: number): Promise<Photo>;
  removePhoto(id: string): Promise<void>;
  startSelfie(): Promise<SelfieResult>;
  interests(): Promise<Interest[]>;
  saveVibe(prompts: { key: string; answer: string }[], interestIds: number[]): Promise<void>;
  uploadVoice(audio: Blob): Promise<void>;
  saveGoal(g: Goal): Promise<void>;
  savePrefs(p: Prefs): Promise<void>;
  setStep(step: number): Promise<void>;
  refresh(): Promise<Refresh>;
  cityQueue(): Promise<CityQueue | null>;
  myChart(): Promise<MyChart | null>;
  savePushToken(token: string): Promise<void>;

  // member app
  home(): Promise<HomeData>;
  prices(): Promise<Prices>;
  unlockKick(): Promise<Kick>;
  discover(offset?: number): Promise<Card[]>;
  discoverCount(anyCity?: boolean): Promise<number>;
  pulse(): Promise<Pulse | null>;
  profile(id: string): Promise<ProfileFull>;
  like(id: string, kind?: "like" | "cosmic_like", note?: string): Promise<LikeResult>;
  pass(id: string): Promise<void>;
  likesMe(): Promise<LikeCard[]>;
  markLikesSeen(): Promise<void>;
  matches(): Promise<MatchRow[]>;
  filters(): Promise<Filters>;
  saveFilters(f: Filters): Promise<void>;
  compatReport(otherId: string): Promise<Reading>;           // buys it the first time (idempotent), then returns it
  reading(kind: string, otherId?: string): Promise<Reading | null>;
  goldenUnlocked(matchId: string): Promise<boolean>;
  unlockGolden(matchId: string): Promise<void>;

  chat(matchId: string): Promise<ChatData>;
  sendMessage(matchId: string, body: string): Promise<Msg>;
  sendVoice(matchId: string, audio: Blob): Promise<Msg>;
  markRead(matchId: string): Promise<void>;
  /** Live updates for one chat. Returns a function that stops listening. */
  onMessages(matchId: string, cb: (m: Msg) => void): () => void;
  openers(matchId: string): Promise<string[]>;
  guru(matchId: string): Promise<GuruState>;
  askGuru(matchId: string, question: string): Promise<GuruState>;
  buyGuru(matchId: string): Promise<GuruState>;
  saathi(): Promise<SaathiState>;
  saathiSetup(c: SaathiChar, styles: string[]): Promise<void>;
  saathiSend(c: SaathiChar, text: string): Promise<SaathiReply>;
  saathiTopup(): Promise<number>;
}
