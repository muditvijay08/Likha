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
  grievance_officer?: { name: string; email: string; phone: string; ack_hours: number; resolve_days: number };
  company?: { legal_name: string; gstin: string; cin: string; address: string };
  /** Browser-safe keys set in Admin > Keys (Maps browser key, Razorpay key id in use). */
  public_keys?: { google_maps_browser_key?: string; razorpay_key_id?: string; onesignal_app_id?: string };
  /** Admin > Settings > General. When maintenance is on the app shows maintenance_message instead of screens. */
  app?: { maintenance?: boolean; maintenance_message?: string; support_email?: string; min_app_version?: string; otp_whatsapp?: boolean };
  // Admin > Onboarding and Matching
  max_age_filter?: number;
  gender_options?: Gender[];
  gender_theme?: Partial<Record<Gender, string>>;
  photos?: { min: number; max: number };
  prompts?: { required: number; max_length: number; interests_min: number; interests_max: number };
  saathi?: { max_session_minutes?: number };
  /** Admin > Verification: auto (let in, no check yet), manual (the team looks) or api */
  verification_modes?: { selfie: "auto" | "manual" | "api"; photos: "auto" | "manual" | "api" };
}

/** A required document (Terms, birth details…) republished in Admin that this member hasn't agreed to yet. */
export interface ConsentNeeded { key: string; version: string; title: string; body: string }
export interface Announcement { id: string; text: string; link: string | null }

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
  mahadashas?: { lord: string; start: string; end: string }[];
}

export interface CityQueue {
  city: string; slug: string; status: string; threshold: number; members: number; position: number;
  invite_code: string | null; live_cities: string[]; next_cities: string[];
}

export type SelfieResult = { status: "passed" | "pending" | "manual_review" | "failed"; message?: string; /** let in without a check (Admin > Verification) */ auto?: boolean };

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
  id: string; status: "pending_consent" | "generating" | "ready" | "failed" | "refunded" | "declined";
  content: { title: string; summary: string; sections: { heading: string; body: string }[]; try_this: string;
             images?: string[]; imagined?: boolean; scene?: string } | null;
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
// ---------------------------------------------------------------- wallet, payments, store
export interface TierRule { key: Tier; label: string; discount: number; min_conversations: number; min_streak_days: number }
export interface TierInfo { tier: Tier; label: string; discount: number; paused_until: string | null; conversations: number; streak: number;
  qualifies_for: Tier; next: TierRule | null; tiers: TierRule[] }
export interface Pack { id: string; label: string; price_paise: number; credits: number; bonus_pct: number }
export interface Plan { key: string; label: string; price_paise: number; interval: "month" | "year"; trial_note: string | null; active_until: string | null }
export interface Wallet { balance: number; expiring: { credits: number; on: string } | null; packs: Pack[]; plans: Plan[]; tier: TierInfo;
  activity: { delta: number; kind: string; reason: string; at: string }[] }
export type UpiApp = "gpay" | "phonepe" | "paytm" | "other";
export interface PaymentStatus { status: "created" | "authorized" | "captured" | "failed" | "refunded" | "partially_refunded"; credited: boolean;
  item_type: "pack" | "subscription"; item_key: string; amount_paise: number; payment_ref: string | null; invoice_no: string | null; credits: number | null; balance: number }
export interface ReadingFull extends Reading { kind: string; created_at: string; credits_charged: number; helpful: boolean | null; name: string | null;
  suits: { nakshatras: number[]; moon_signs: number[]; best_score: number } | null; mine?: boolean; match_id?: string | null }
export interface ReadingItem { id: string; kind: string; status: Reading["status"]; created_at: string; name: string | null }
export interface CrushCheck { id: string; name: string; relation: string; token: string; joined: boolean; expires_at: string; reading_id: string; status: string }
export interface GiftItem { id: string; name: string; kind: string; note: string | null; token: string; deliver_on: string; opened: boolean; expires_at: string }
export interface MaasiPick extends Card { pick_id: string; note: string; response: "interested" | "not_for_me" | null; week_of: string }
export interface MaasiState { until: string | null; price_paise: number; picks: MaasiPick[] }

// ---------------------------------------------------------------- account, settings, safety, inbox, help
export interface MyProfile {
  id: string; first_name: string; gender: Gender; age: number | null; city: string | null; height_cm: number | null; mother_tongue: string | null;
  languages: string[]; education: string | null; profession: string | null; company: string | null; college: string | null; hometown: string | null;
  diet: string | null; drinking: string | null; smoking: string | null; workout: string | null; kids: string | null; relocate: string | null;
  religion: string | null; show_religion: boolean; goal: Goal | null; bio: string | null; voice_intro_path: string | null;
  status: string; selfie_status: string; selfie_auto?: boolean; profile_complete_pct: number; tier: Tier;
  incognito: boolean; i_message_first: boolean; hide_company: boolean; read_receipts: boolean; show_online: boolean; paused: boolean;
  language_pref: "en" | "hinglish" | "hi";
  photos: Photo[]; prompts: { key: string; label: string; answer: string }[]; interests: number[];
  birth: { date: string; time: string; place: string } | null; balance: number; streak: number; matches: number; bonus_waiting: number | null;
}
export type ProfilePatch = Partial<Pick<MyProfile, "first_name" | "height_cm" | "mother_tongue" | "languages" | "education" | "profession" | "company" | "college" |
  "hometown" | "diet" | "drinking" | "smoking" | "workout" | "kids" | "relocate" | "religion" | "show_religion" | "goal" | "bio" | "incognito" |
  "i_message_first" | "hide_company" | "read_receipts" | "show_online" | "paused" | "language_pref">>;
export interface NotifPrefs { kick_time: string; new_likes: boolean; matches: boolean; golden_hours: boolean; offers: boolean; quiet_start: string; quiet_end: string }
export interface TrustedContact { id: string; name: string; phone: string; relation: string | null }
export type ReportReason = "fake_profile" | "harassment" | "inappropriate_photos" | "scam" | "under_18" | "unsafe_meeting" | "other";
export interface DateShare { id: string; place: string; starts_at: string; checkin_at: string; status: string; match_id: string | null; with: string | null;
  contacts: TrustedContact[]; alert_after_minutes: number }
export interface Notice { id: number; type: string; title: string; body: string; data: { link?: string; discount?: number }; read: boolean; created_at: string; group: "likes" | "readings" | "account" }
export interface History {
  plans: { id: string; key: string; label: string; price_paise: number; interval: string; status: string; until: string }[];
  ledger: { at: string; reason: string; delta: number; kind: string; balance: number }[];
  invoices: { id: string; invoice_no: string; amount_paise: number; gst_paise: number; item: string; at: string }[];
}
export interface Invoice { invoice_no: string; date: string; amount_paise: number; gst_paise: number; taxable_paise: number; method: string | null; payment_ref: string | null;
  item: string; sac: string | null; company: { legal_name: string; gstin: string; cin: string; address: string }; customer: { name: string; phone: string | null } }
export interface Ticket { id: string; subject: string; status: string; created_at: string; messages: { from: "me" | "team"; body: string; at: string }[] }
export interface AccountState { status: string; selfie_status: string; paused: boolean; tier_paused_until: string | null;
  action: { id: string; action: string; reason: string; until: string | null; at: string; appealed: boolean; appeal_status: string | null; can_appeal: boolean } | null }
export interface Toolkit { reward: number; items: { key: string; title: string; body: string; link: string; tried: boolean }[] }

export interface SaathiReply { reply: string | null; left?: number; topup?: boolean; crisis?: boolean; message?: string }

// ---------------------------------------------------------------- batch 5: couples and growth
export type CoupleKind = "our_stars" | "our_alignment" | "imagine_us" | "seven_questions";
export interface Universe { match_id: string; other_id: string; other_name: string; tier: string | null; couple_plus: boolean; always_allowed: boolean;
  prices: Record<CoupleKind | "guru_20", number>; readings: Partial<Record<CoupleKind, { id: string; status: Reading["status"]; mine: boolean }>> }
export interface ConsentReq { id: string; kind: CoupleKind; from_id: string; from_name: string; scene: string | null; created_at: string }
export interface SevenState { other_name: string; mine: Record<string, string>; theirs_count: number; theirs: Record<string, string>;
  reading: { id: string; status: Reading["status"] } | null; price: number }
export interface CoupleState { match_id: string; matched_at: string; other_name: string; me_name: string; confirmed_me: boolean; confirmed_other: boolean;
  started_at: string | null; plus: boolean; plus_until: string | null; plus_price_paise: number; year_price_paise: number; jodi_score: number | null; gunas: number | null }
export interface StoryEvent { id: string; kind: string; title: string; body: string | null; photo_path: string | null; photo?: string | null; at: string; mine: boolean }
export interface Story { days: number; dates: number; jodi_score: number | null; matched_at: string; events: StoryEvent[] }
export interface DueCheckin { match_id: string; day_mark: 30 | 90 | 180; other_name: string; matched_at: string; jodi_score: number | null }
export interface BoostState { price: number; list_price: number; boost: { id: string; starts_at: string; ends_at: string; live: boolean; views: number } | null }
export interface TravelCity { id: string; name: string; status: string; people: number; top_score: number | null }
export interface TravelState { price: number; trip: { id: string; city: string; from: string; to: string } | null }
export interface Invites { code: string | null; reward: number; friend_reward: number; max_per_month: number; earned: number;
  invites: { first_name: string | null; status: string; selfie: string | null; at: string }[] }
export interface CupidLink { id: string; code: string; label: string; target: string; url: string; active: boolean; clicks: number; joined: number }
export interface CupidState { is_cupid: boolean; enabled?: boolean; signup_paise?: number; first_paid_paise?: number; status?: string;
  rates?: { signup_paise: number; first_paid_paise: number; hold_days: number; min_payout_paise: number }; links?: CupidLink[];
  people?: { joined: number; verified: number; paid: number }; recent?: { initial: string; status: string; at: string }[];
  money?: { on_hold_paise: number; withdrawable_paise: number; paid_paise: number; tds_this_fy_paise: number }; kyc?: string | null;
  payouts?: { id: string; gross: number; tds: number; net: number; status: string; requested_at: string; paid_at: string | null }[] }
export interface CrushLanding { name: string; open: boolean }
export interface GiftLanding { name: string; from: string; note: string | null; kind: string; deliver_on: string; open: boolean }

export interface Api {
  readonly demo: boolean;
  sendOtp(phoneE164: string, channel: "sms" | "whatsapp"): Promise<void>;
  verifyOtp(phoneE164: string, code: string): Promise<void>;
  signedIn(): Promise<boolean>;
  signOut(): Promise<void>;
  settings(): Promise<PublicSettings>;
  /** Feature switches from Admin > Settings > Features, for this member's city. Missing key = on. */
  myFeatures(): Promise<Record<string, boolean>>;
  myAnnouncement(): Promise<Announcement | null>;
  consentsNeeded(): Promise<ConsentNeeded[]>;
  acceptConsents(items: { key: string; version: string }[]): Promise<void>;
  state(): Promise<OnboardingState>;
  createProfile(firstName: string, gender: Gender, consents: string[]): Promise<void>;
  saveBasics(b: Basics): Promise<void>;
  setCity(p: Place, tz: string): Promise<City>;
  saveLifestyle(l: Lifestyle): Promise<void>;
  saveBirth(b: Birth): Promise<void>;
  photos(): Promise<Photo[]>;
  uploadPhoto(file: Blob, position: number): Promise<Photo>;
  removePhoto(id: string): Promise<void>;
  /** image: one JPEG frame as a data URL, sent only when a person or the check service will look at it */
  startSelfie(image?: string): Promise<SelfieResult>;
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
  releasePushToken(token: string): Promise<void>;

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

  wallet(): Promise<Wallet>;
  /** Opens payment (Razorpay Checkout, UPI first) and resolves with the order id once the member has paid or left. */
  pay(type: "pack" | "subscription", key: string, upi: UpiApp, email?: string): Promise<{ order_id: string; paid: boolean }>;
  paymentStatus(orderId: string): Promise<PaymentStatus | null>;
  startReading(kind: "who_suits_me" | "why_not", subject?: Record<string, unknown>): Promise<string>;
  readingView(id: string): Promise<ReadingFull | null>;
  myReadings(): Promise<ReadingItem[]>;
  setSuitsSort(on: boolean): Promise<void>;
  buyCheckPack(): Promise<number>;
  createCrushCheck(name: string, phone: string, relation: string, dob: string | null): Promise<{ token: string; reading_id: string; prepaid: boolean }>;
  myCrushChecks(): Promise<{ prepaid: number; checks: CrushCheck[] }>;
  sendGift(name: string, phone: string, kind: string, note: string, deliverOn: string): Promise<string>;
  myGifts(): Promise<GiftItem[]>;
  maasi(): Promise<MaasiState>;
  answerMaasi(pickId: string, interested: boolean): Promise<LikeResult>;

  myProfile(): Promise<MyProfile>;
  saveProfile(p: ProfilePatch): Promise<void>;
  notifPrefs(): Promise<NotifPrefs>;
  saveNotifPrefs(p: NotifPrefs): Promise<void>;
  trustedContacts(): Promise<TrustedContact[]>;
  addTrustedContact(name: string, phone: string, relation: string): Promise<TrustedContact>;
  removeTrustedContact(id: string): Promise<void>;
  blocks(): Promise<{ id: string; first_name: string; since: string }[]>;
  unblock(id: string): Promise<void>;
  block(userId: string): Promise<void>;
  unmatch(matchId: string): Promise<void>;
  report(userId: string, reason: ReportReason, details: string, alsoBlock: boolean): Promise<void>;
  /** Deleting needs a fresh OTP: first send it, then confirm with the code. */
  sendDeleteOtp(): Promise<void>;
  deleteAccount(code: string, reason: string): Promise<{ credits_lost: number }>;
  shareDate(matchId: string | null, place: string, startsAt: Date, checkinAt: Date, contactIds: string[]): Promise<string>;
  dateShare(id: string): Promise<DateShare | null>;
  checkin(id: string, answer: "ok" | "later" | "help"): Promise<DateShare>;
  sosStart(matchId: string | null, lat: number | null, lng: number | null, flag: boolean): Promise<{ id: string; token: string; share_until: string }>;
  sosUpdate(id: string, lat: number, lng: number): Promise<void>;
  sosStop(id: string): Promise<void>;
  sosView(token: string): Promise<{ first_name: string; lat: number | null; lng: number | null; updated_at: string; share_until: string } | null>;
  notices(): Promise<Notice[]>;
  markAllRead(): Promise<void>;
  history(): Promise<History>;
  invoice(paymentId: string): Promise<Invoice | null>;
  openTicket(subject: string, body: string): Promise<string>;
  tickets(): Promise<Ticket[]>;
  replyTicket(id: string, body: string): Promise<void>;
  fileGrievance(category: string, description: string, file?: Blob | null): Promise<{ ticket_no: string; resolve_due_at: string }>;
  accountState(): Promise<AccountState>;
  appeal(actionId: string, text: string): Promise<void>;
  toolkit(): Promise<Toolkit>;
  tried(feature: string): Promise<boolean>;
  // couples and growth
  universe(matchId: string): Promise<Universe>;
  startCoupleReading(matchId: string, kind: "our_stars" | "our_alignment" | "imagine_us", scene?: string): Promise<{ id: string; status: Reading["status"] }>;
  consentRequests(): Promise<ConsentReq[]>;
  decideConsent(id: string, allow: boolean, always: boolean): Promise<void>;
  seven(matchId: string): Promise<SevenState>;
  startSeven(matchId: string): Promise<string>;
  answerSeven(matchId: string, q: number, answer: string): Promise<number>;
  couple(matchId: string): Promise<CoupleState>;
  confirmCouple(matchId: string): Promise<boolean>;
  endCouple(matchId: string): Promise<void>;
  story(matchId: string): Promise<Story>;
  addMoment(matchId: string, title: string, body: string, at: Date, photo?: Blob | null): Promise<void>;
  dueCheckins(): Promise<DueCheckin[]>;
  answerCheckin(matchId: string, day: number, answer: string): Promise<void>;
  boost(): Promise<BoostState>;
  activateBoost(minutes: number, start: Date | null): Promise<BoostState>;
  noteView(userId: string): Promise<void>;
  travelCity(p: Place, tz: string): Promise<TravelCity>;
  travel(): Promise<TravelState>;
  startTravel(cityId: string, from: string, to: string): Promise<void>;
  endTravel(id: string): Promise<void>;
  invites(): Promise<Invites>;
  redeemInvite(code: string): Promise<boolean>;
  attachCupid(code: string, clickId: number | null): Promise<boolean>;
  cupid(): Promise<CupidState>;
  becomeCupid(): Promise<CupidState>;
  createCupidLink(code: string, label: string, target: string): Promise<void>;
  submitCupidKyc(legalName: string, pan: string, upi: string, resident: boolean): Promise<void>;
  requestPayout(): Promise<void>;
  crushLanding(token: string): Promise<CrushLanding | null>;
  giftLanding(token: string): Promise<GiftLanding | null>;
  claimCrush(token: string): Promise<string>;
  openGift(token: string): Promise<string>;
}
