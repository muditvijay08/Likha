export interface Me { name: string; role: string; mfa: boolean; perms: string[] }
export interface KeySlot { key: string; mode: "any" | "test" | "live"; grp: string; label: string; provider: string | null; is_public: boolean; is_secret: boolean;
  testable: boolean; hint: string | null; set: boolean; shown: string | null; set_at: string | null; set_by: string | null; tested_at: string | null;
  test_ok: boolean | null; test_note: string | null; in_use: boolean }
export interface Keys { payments_mode: "test" | "live"; slots: KeySlot[] }
export interface Model { model: string; provider: "anthropic" | "gemini" | "openai" | "fal"; kind: "text" | "image"; label: string; input: number; output: number;
  per_image: number | null; note: string | null; active: boolean; verified_at: string | null; test_note: string | null; key_set: boolean; used_by: string[] }
export interface Feature { key: string; label: string; kind: "text" | "image"; model: string; fallback: string | null; enabled: boolean; paid: boolean; spent_7d_paise: number }
export interface Ai { can_edit: boolean; usd_inr: number; models: Model[]; features: Feature[] }
export interface TestResult { ok: boolean; note: string; preview?: string }
export interface MfaState { level: "aal1" | "aal2" | null; factorId: string | null }

// ---------------------------------------------------------------- batch A: daily work
export interface Overview {
  queues: { reports: number; reports_urgent: number; appeals: number; selfies: number; selfie_oldest: string | null; grievances: number; grievances_ack_overdue: number;
    tickets: number; data_requests: number; refunds_waiting: number; not_credited: number; readings_stuck: number };
  today: { signups: number; signups_yesterday: number; women_pct: number | null; revenue_paise: number; payments: number; ai_paise: number; matches: number; paying_pct: number | null };
  signups_14d: { day: string; n: number }[]; funnel: { step: string; n: number }[];
  cities: { slug: string; name: string; status: string; members: number; women_pct: number | null; matches_today: number; revenue_today_paise: number }[];
}
export interface UserRow { id: string; short_id: string; first_name: string; age: number | null; city: string | null; gender: string; joined: string; selfie: string; tier: string;
  credits: number; reports: number; status: string; paused: boolean }
export interface UserList { counts: Record<"all" | "women" | "men" | "under_review" | "suspended" | "banned", number>; rows: UserRow[] }
export interface UserDetail { id: string; short_id: string; first_name: string; age: number | null; gender: string; city: string | null; travel_city: string | null; phone: string | null;
  status: string; paused: boolean; joined: string; last_active: string | null; selfie: string; goal: string | null; profession: string | null; complete_pct: number;
  tier: string; tier_override: { tier: string; until: string } | null; photo: string | null; credits: number;
  ledger: { at: string; delta: number; kind: string; reason: string; balance: number }[];
  payments: { id: string; at: string; item: string; amount_paise: number; status: string; credited: boolean; ref: string | null }[];
  plans: { plan: string; until: string; status: string }[];
  reports_against: { id: string; reason: string; status: string; at: string; priority: string }[]; reports_made: number;
  actions: { id: string; action: string; reason: string; until: string | null; at: string; by: string; appeal: { id: string; status: string; text: string } | null }[];
  matches: number; likes_sent_7d: number; readings: { id: string; kind: string; status: string; credits: number; at: string }[];
  crush_checks: { name: string; token: string; joined: boolean; expires: string; at: string }[];
  gifts_sent: { name: string; token: string; kind: string; opened: boolean; deliver_on: string }[]; gifts_received: number;
  saathi: { messages_7d: number; crisis: number }; guru_questions: number; maasi_until: string | null; referred_by: string | null }
export interface TokenInfo { type: "crush" | "gift"; from_id: string; from: string; to: string; created: string; expires: string; joined_id?: string | null; reading_id?: string;
  reading_status?: string; kind?: string; deliver_on?: string; opened_id?: string | null; opened_at?: string | null }
export type ModAction = "warn" | "hide" | "suspend" | "ban" | "unban" | "restore";
export interface ReportRow { id: string; priority: string; reason: string; details: string | null; status: string; reported_id: string; reported: string; reporter: string;
  ai_check: { label?: string; score?: number } | null; at: string; has_chat: boolean; times_reported: number }
export interface ReportDetail { id: string; reason: string; details: string | null; priority: string; status: string; at: string; ai_check: { label?: string; score?: number } | null;
  resolution: string | null; reported_id: string; reporter_id: string;
  reported: { name: string; age: number | null; status: string; selfie: string; joined: string; photo: string | null };
  other_reports: { reason: string; at: string; status: string }[]; chat: { from: "reported" | "reporter"; body: string; held: boolean; at: string }[] | null; can_read_chat: boolean }
export interface Appeal { id: string; user_id: string; user: string; text: string; at: string; action: string; reason: string; until: string | null; acted_at: string }
export interface SelfieRow { id: string; user_id: string; user: string; age: number | null; score: number | null; liveness: boolean | null; tries: number; why: string | null; at: string;
  photo: string | null; same_face: number; under_18_report: boolean; /** kept in the selfies bucket until decided (manual mode) */ selfie?: string | null }
export interface SelfieQueue { reviewed_today: number; approved_today: number; rows: SelfieRow[] }
export interface PaymentRow { id: string; at: string; user_id: string; user: string; item: string; amount_paise: number; order: string | null; ref: string | null; status: string;
  credited: boolean; method: string | null; invoice: string | null; refunded_paise: number }
export interface RefundRow { id: string; user: string; user_id: string; method: "credits" | "bank"; credits: number | null; amount_paise: number | null; reason: string; status: string; at: string;
  requested_by: string | null; mine: boolean; payment_ref: string | null }
export interface Payments { kpis: { gross_today_paise: number; payments_today: number; refunds_today: number; refunds_today_paise: number; failed_today: number; attempts_today: number;
  not_credited: number; unconfirmed: number }; rows: PaymentRow[]; refunds: RefundRow[]; can_approve: boolean }
export interface ReadingRow { id: string; user_id: string; user: string; kind: string; status: string; credits: number; at: string; attempts: number; helpful: boolean | null; last_error: string | null }
export interface ReadingContent { id: string; kind: string; status: string; content: { title?: string; summary?: string; sections?: { heading: string; body: string }[] } | null; credits: number; at: string }
export interface TicketRow { id: string; user_id: string | null; user: string; subject: string; channel: string; status: string; at: string; new: boolean; last: string | null; draft: boolean }
export interface Tickets { kpis: { open: number; new: number; first_reply_min: number | null; csat: number | null }; rows: TicketRow[] }
export interface Ticket { id: string; subject: string; status: string; channel: string; at: string; user_id: string | null;
  user: { name: string; short_id: string; credits: number; status: string; city: string | null } | null;
  messages: { id: number; from: "user" | "team" | "ai" | "system"; by: string | null; body: string; draft: boolean; at: string }[];
  recent_payments: { id: string; amount_paise: number; status: string; credited: boolean; ref: string | null; at: string }[] }
export interface GrievanceRow { id: string; ticket_no: string; category: string; description: string; attachments: string[]; user_id: string | null; user: string; at: string;
  ack_due: string; acked: string | null; resolve_due: string; resolved: string | null; status: string; resolution: string | null; owner: string | null }
export interface Grievances { kpis: { open: number; ack_overdue: number; due_3d: number; resolved_month: number; avg_days: number | null }; rows: GrievanceRow[];
  team: { id: string; name: string; role: string }[] }
export interface GrievanceReport { month: string; received: number; resolved: number; acked_in_24h: number; resolved_in_15d: number; by_category: Record<string, number>; actions: number }
export interface DataRequest { id: string; user_id: string | null; user: string; kind: "export" | "delete" | "correct" | "withdraw_consent"; details: string | null; status: string;
  at: string; due: string; done: string | null; proof: Record<string, unknown> | null }
export interface MaasiMember { user_id: string; user: string; age: number | null; gender: string; city: string | null; until: string;
  picks: { id: string; name: string; note: string; response: string | null }[]; last_week_interested: number }
export interface Maasi { week_of: string; per_week: number; members: MaasiMember[] }
export interface Candidate { id: string; name: string; age: number | null; profession: string | null; jodi_score: number | null; gunas: number | null; moon: string | null;
  nakshatra: string | null; goal: string | null; photo: string | null }

// ---------------------------------------------------------------- batch B: growth and control
export interface SettingValue { value: unknown; version: number; updated_at: string; updated_by: string | null; description: string | null }
export interface SettingVersion { version: number; value: unknown; note: string; at: string; by: string | null }
export interface CityRow { slug: string; name: string; state: string | null; country: string; status: "locked" | "waitlist" | "live"; threshold: number; min_women: number; min_complete: number;
  unlock_at: string | null; unlocked_at: string | null; lat: number | null; lng: number | null; timezone: string;
  members: number; women_pct: number | null; complete_pct: number | null; waitlist_only: number; per_day: number; eta_days: number | null; ready: boolean }
export interface Cities { can_edit: boolean; can_rules: boolean; cities: CityRow[]; invites_month: number; rules: Record<string, unknown> }
export interface CupidRow { user_id: string; name: string; short_id: string; kind: "user" | "partner"; status: string; clicks: number; joined: number; verified: number; paying: number;
  owed_paise: number; kyc: string | null; rates: { signup_paise: number | null; first_paid_paise: number | null } }
export interface CupidAdmin { can_manage: boolean; can_pay: boolean; can_rules: boolean; config: Record<string, number | boolean | string>;
  kpis: { active: number; partners: number; joined_30d: number; verified_pct: number | null; paying_30d: number; owed_paise: number; waiting_payouts: number; waiting_kyc: number; waiting_review: number };
  cupids: CupidRow[];
  review: { id: string; cupid_id: string; cupid: string; kind: string; amount_paise: number; at: string; signups_that_day: number; shared_network: number; face_matches: number }[];
  kyc: { cupid_id: string; cupid: string; legal_name: string; pan: string; upi: string | null; resident: boolean; at: string }[];
  payouts: { id: string; cupid_id: string; cupid: string; gross: number; tds: number; net: number; status: string; needs_review: boolean; requested_at: string; paid_at: string | null; utr: string | null;
    reason: string | null; kyc: string | null }[];
  blocked_30d: Record<string, number> }
export interface AiSpend { can_edit: boolean; config: Record<string, number | boolean | string | string[]>; free_paused: boolean; today_paise: number; month_paise: number; calls_today: number;
  capped_today: number; check_fail_pct_7d: number | null; refunded_today: number; by_feature: { feature: string; label: string; paise: number; calls: number }[];
  top_users: { user_id: string; user: string; calls: number; paise: number; capped: number; paying: boolean; limit: { daily: number | null; monthly: number | null; blocked: boolean; reason: string } | null }[] }
export interface FraudCase { id: string; pattern: string; risk: string; status: string; evidence: Record<string, unknown>; at: string; decision: string | null; decided_by: string | null;
  accounts: { id: string; short_id: string; name: string; status: string; joined: string; bonus: boolean }[] }
export interface Fraud { kpis: { open: number; high: number; bonuses_held: number; linked_groups: number; banned_today: number }; cases: FraudCase[]; rules: Record<string, unknown> }
export interface Service { key: string; name: string; status: "up" | "slow" | "down" | "idle" | "off"; calls?: number; success_pct?: number | null; latency_ms?: number | null;
  spend_paise?: number; note?: string | null; mode?: string; size_mb?: number }
export interface Incident { id: string; started_at: string; title: string; impact: string | null; status: "open" | "watching" | "fixed"; fixed_at: string | null; notes: { at: string; by: string | null; note: string }[] }
export interface Health { services: Service[]; jobs: { job: string; schedule: string; last_start: string | null; last_status: string | null; message: string | null; failed_24h: number }[] | null;
  incidents: Incident[]; ai_cap_paise: number }
export interface TeamMember { user_id: string; name: string; role: string; active: boolean; since: string; invited_by: string | null; email: string | null; last_sign_in: string | null; mfa: boolean | null }
export interface Team { can_manage: boolean; me: string; members: TeamMember[]; roles: string[]; permissions: { key: string; label: string }[]; matrix: Record<string, string[]> }
export interface AuditRow { id: number; at: string; actor_type: string; who: string; action: string; target_type: string | null; target_id: string | null; reason: string | null;
  before: unknown; after: unknown }

export interface AdminApi {
  readonly demo: boolean;
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  mfaState(): Promise<MfaState>;
  enrollMfa(): Promise<{ factorId: string; qr: string; secret: string }>;
  verifyMfa(factorId: string, code: string): Promise<void>;
  me(): Promise<Me | null>;
  signOut(): Promise<void>;
  keys(): Promise<Keys>;
  setKey(key: string, mode: string, value: string): Promise<void>;
  clearKey(key: string, mode: string): Promise<void>;
  setPaymentsMode(mode: "test" | "live", confirm: string): Promise<void>;
  testKey(key: string, mode: string): Promise<TestResult>;
  ai(): Promise<Ai>;
  setFeatureModel(feature: string, model: string, fallback: string | null): Promise<void>;
  saveModel(m: Pick<Model, "model" | "provider" | "kind" | "label" | "input" | "output" | "per_image" | "note" | "active">): Promise<void>;
  testModel(model: string): Promise<TestResult>;
  // daily work
  overview(): Promise<Overview>;
  users(query: string, filter: string): Promise<UserList>;
  user(id: string): Promise<UserDetail>;
  adjustCredits(user: string, delta: number, reason: string): Promise<number>;
  setTier(user: string, tier: string, days: number, reason: string): Promise<void>;
  moderate(user: string, action: ModAction, reason: string, days: number | null): Promise<void>;
  revealBirth(user: string, reason: string): Promise<Record<string, unknown> | null>;
  lookupToken(token: string): Promise<TokenInfo | null>;
  reports(status: "open" | "closed"): Promise<ReportRow[]>;
  report(id: string): Promise<ReportDetail>;
  resolveReport(id: string, outcome: "resolved" | "dismissed", note: string, action: ModAction | null, days: number | null): Promise<void>;
  appeals(): Promise<Appeal[]>;
  decideAppeal(id: string, overturn: boolean, note: string): Promise<void>;
  selfies(): Promise<SelfieQueue>;
  decideSelfie(id: string, decision: "approve" | "retry" | "reject", reason?: string): Promise<void>;
  payments(filter: string, query: string): Promise<Payments>;
  recheckPayment(id: string): Promise<{ ok: boolean; note: string }>;
  refund(user: string, method: "credits" | "bank", reason: string, credits: number | null, amountPaise: number | null, payment: string | null): Promise<void>;
  approveRefund(id: string): Promise<void>;
  sendRefund(id: string): Promise<{ ok: boolean; note: string }>;
  readings(filter: "problems" | "all", user?: string): Promise<ReadingRow[]>;
  readingContent(id: string): Promise<ReadingContent>;
  rewriteReading(id: string, reason: string): Promise<void>;
  refundReading(id: string, reason: string): Promise<void>;
  tickets(status: "open" | "closed"): Promise<Tickets>;
  ticket(id: string): Promise<Ticket>;
  replyTicket(id: string, body: string, status: "in_progress" | "waiting_user" | "resolved", draftId: number | null): Promise<void>;
  grievances(): Promise<Grievances>;
  ackGrievance(id: string, owner: string | null, message: string): Promise<void>;
  resolveGrievance(id: string, resolution: string): Promise<void>;
  grievanceReport(month: string): Promise<GrievanceReport>;
  dataRequests(): Promise<DataRequest[]>;
  exportUser(requestId: string): Promise<Record<string, unknown>>;
  eraseUser(user: string, requestId: string): Promise<Record<string, unknown>>;
  closeDataRequest(id: string, note: string): Promise<void>;
  maasi(): Promise<Maasi>;
  maasiCandidates(user: string): Promise<Candidate[]>;
  addMaasiPick(user: string, pick: string, note: string): Promise<void>;
  removeMaasiPick(id: string): Promise<void>;
  photoUrl(path: string | null, bucket?: "photos" | "selfies"): Promise<string | null>;
  // growth and control
  settings(keys: string[]): Promise<Record<string, SettingValue>>;
  saveSettings(changes: Record<string, unknown>, note: string): Promise<number>;
  settingHistory(key: string): Promise<SettingVersion[]>;
  cities(): Promise<Cities>;
  saveCity(c: { slug: string; name: string; state: string | null; country: string; lat: number | null; lng: number | null; timezone: string; threshold: number; min_women: number; min_complete: number }): Promise<void>;
  setCityStatus(slug: string, status: "locked" | "waitlist", reason: string): Promise<void>;
  scheduleUnlock(slug: string, at: string | null, override: string | null): Promise<void>;
  unlockNow(slug: string): Promise<{ notified: number }>;
  cupidAdmin(): Promise<CupidAdmin>;
  decideEarning(id: string, approve: boolean, note: string): Promise<void>;
  decideKyc(cupid: string, verified: boolean, reason: string | null): Promise<void>;
  decidePayout(id: string, approve: boolean, reason: string | null): Promise<void>;
  setCupid(user: string, status: "active" | "paused" | "banned", reason: string): Promise<void>;
  makePartner(user: string, signupPaise: number | null, firstPaidPaise: number | null, reason: string): Promise<void>;
  cupidTds(fy: string): Promise<{ legal_name: string; pan: string; quarter: string; gross_paise: number; tds_paise: number; net_paise: number; payouts: number }[]>;
  aiSpend(): Promise<AiSpend>;
  pauseFreeAi(pause: boolean, reason: string): Promise<void>;
  setAiUserLimit(user: string, daily: number | null, monthly: number | null, blocked: boolean, reason: string): Promise<void>;
  aiCalls(days: number): Promise<Record<string, unknown>[]>;
  fraud(): Promise<Fraud>;
  scanFraud(): Promise<number>;
  decideFraud(id: string, action: "ban_all" | "keep_oldest" | "remove_bonuses" | "not_fraud", reason: string): Promise<void>;
  health(): Promise<Health>;
  saveIncident(id: string | null, title: string, impact: string, status: "open" | "watching" | "fixed", note: string): Promise<void>;
  team(): Promise<Team>;
  setMember(user: string, role: string, active: boolean, reason: string): Promise<void>;
  setRolePermission(role: string, perm: string, on: boolean, reason: string): Promise<void>;
  inviteMember(email: string, name: string, role: string): Promise<{ ok: boolean; note: string }>;
  audit(query: string, actor: string | null, before: number | null): Promise<AuditRow[]>;
  // settings and AI CEO (batch C)
  unusedSettings(): Promise<string[]>;
  restoreSetting(key: string, version: number, note: string): Promise<void>;
  clearPolicyReview(doc: string): Promise<void>;
  pricing(): Promise<Pricing>;
  savePricing(catalog: Catalog, note: string): Promise<void>;
  restorePricing(id: number, note: string): Promise<void>;
  flags(): Promise<Flag[]>;
  saveFlag(key: string, enabled: boolean, rollout: number, cities: string[], note: string): Promise<void>;
  testMessage(text: string, early: boolean): Promise<{ held: boolean; reason: string }>;
  consents(): Promise<Consents>;
  publishConsent(key: string, version: string, title: string, body: string, required: boolean, note: string): Promise<void>;
  content(): Promise<Content>;
  strings(query: string, missingHindi: boolean): Promise<AppString[]>;
  saveStrings(strings: Record<string, { en: string; hi?: string | null }>, note: string): Promise<number>;
  saveContent(kind: "kick_template" | "prompt" | "interest" | "schedule" | "announcement", row: Record<string, unknown>, note: string): Promise<void>;
  security(): Promise<Security>;
  aiCeo(): Promise<AiCeo>;
  decideApproval(id: string, approve: boolean): Promise<void>;
  undoAgentAction(id: number, reason: string): Promise<void>;
  saveAgent(key: string, acting: boolean, canDo: string[], needs: string[], never: string[], limits: Record<string, number>, note: string): Promise<void>;
  agentsControl(mode: "pause" | "resume" | "read_only", reason: string): Promise<void>;
  aiEmergency(stop: boolean, reason: string): Promise<void>;
  /** Admin > Security > sign team members out after this many idle minutes. */
  session(): Promise<{ idle_minutes: number }>;
  // verification (selfie and photo checks)
  verification(): Promise<Verification>;
  setVerification(check: "selfie" | "photos", mode: VerifyMode, url: string | null, note: string): Promise<void>;
  testVerification(check: "selfie" | "photos"): Promise<{ ok: boolean; note: string }>;
  photoQueue(): Promise<PhotoQueue>;
  decidePhoto(id: string, approve: boolean, reason: string | null): Promise<void>;
}

export type VerifyMode = "auto" | "manual" | "api";
export interface Verification {
  config: Record<"selfie" | "photos", { mode: VerifyMode; url: string | null }>; can_edit: boolean; keys: Record<"selfie" | "photos", boolean>;
  counts: { auto_members: number; selfie_queue: number; photo_queue: number; auto_photos_7d: number; unreviewed_auto_photos: number };
  last_tests: Record<string, { at: string; ok: string; note: string }>;
}
export interface PhotoRow { id: string; user_id: string; user: string; path: string; position: number; at: string; labels?: Record<string, unknown> | null }
export interface PhotoQueue { pending: PhotoRow[]; auto_recent: PhotoRow[]; mode: VerifyMode }

// ---------------------------------------------------------------- batch C
export interface Pack { id: string; label: string; price_paise: number; credits: number; bonus_pct: number; active: boolean; sort: number }
export interface PriceRow { key: string; label: string; credits: number; tier_discount: boolean; active: boolean }
export interface Plan { key: string; label: string; price_paise: number; interval: string; trial_note: string | null; active: boolean }
export interface TierRow { key: string; label: string; discount_pct: number; min_conversations: number; min_streak_days: number }
export interface Catalog { packs: Pack[]; prices: PriceRow[]; plans: Plan[]; tiers: TierRow[] }
export interface Pricing extends Catalog { can_edit: boolean; history: { id: number; note: string; at: string; by: string | null }[] }
export interface Flag { key: string; enabled: boolean; rollout: number; cities: string[]; label: string; updated_at?: string; by?: string | null }
export interface ConsentRow { key: string; version: string; title: string; required: boolean; published_at: string; latest: boolean; members: number }
export interface Consents { policy_review: string[]; rows: ConsentRow[] }
export interface KickTemplate { key: string; label: string; used_for: string; tone: string; template: string; active: boolean; updated_at?: string }
export interface PromptRow { key: string; label: string; active: boolean; sort: number }
export interface ScheduleRow { sort: number; trigger: string; feature_key: string; title: string; body: string; link: string; reward_credits: number; active: boolean }
export interface AnnouncementRow { id: string; text: string; link: string | null; city_slugs: string[]; starts_at: string; ends_at: string; active: boolean }
export interface Content {
  can_edit: boolean; strings: { total: number; hindi_done: number }; kick_templates: KickTemplate[]; prompts: PromptRow[];
  interests: { slug: string; label: string }[]; schedule: ScheduleRow[]; announcements: AnnouncementRow[];
}
export interface AppString { key: string; en: string; hi: string | null; updated_at: string }
export interface Security {
  reveal_roles: string[]; chat_roles: string[]; reveals_30d: number; chat_reads_30d: number; team_without_mfa: number; data_request_days: number; consents: ConsentRow[];
}
export interface Agent { key: string; label: string; acting: boolean; can_do: string[]; needs_approval: string[]; never: string[]; limits: Record<string, number>; last_action: string | null }
export interface Approval { id: string; agent: string; title: string; detail: string | null; amount_paise: number | null; status: "pending" | "approved" | "declined" | "expired"; at: string; expires_at: string; decided_by: string | null }
export interface AgentAction { id: number; at: string; agent: string; action: string; target: string | null; reason: string | null; after: Record<string, unknown> | null; undone: boolean; undoable: boolean }
export interface AiCeo { can_decide: boolean; paused: boolean; limits: Record<string, unknown>; agents: Agent[]; approvals: Approval[]; actions: AgentAction[] }
