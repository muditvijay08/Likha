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
  photo: string | null; same_face: number; under_18_report: boolean }
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
  photoUrl(path: string | null): Promise<string | null>;
}
