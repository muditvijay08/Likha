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
}
