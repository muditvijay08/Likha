// Demo data for batch B (sample only). Rules mirror database part 16.
import type { AuditRow, CityRow, CupidAdmin, FraudCase, Incident, SettingVersion, TeamMember } from "./types";

const H = 3600e3, D = 864e5;
const iso = (ms: number) => new Date(Date.now() - ms).toISOString();

export interface Growth {
  settings: Record<string, { value: unknown; version: number; updated_at: string; history: SettingVersion[] }>;
  cities: CityRow[]; cupid: Omit<CupidAdmin, "can_manage" | "can_pay" | "can_rules" | "config">; fraud: FraudCase[]; incidents: Incident[];
  team: TeamMember[]; matrix: Record<string, string[]>; audit: AuditRow[]; freePaused: string[] | null;
  limits: Record<string, { daily: number | null; monthly: number | null; blocked: boolean; reason: string }>;
}

const S = (value: unknown) => ({ value, version: 1, updated_at: iso(10 * D), history: [] as SettingVersion[] });
const C = (slug: string, name: string, status: CityRow["status"], members: number, women: number, complete: number, threshold: number, per_day: number, unlocked: string | null): CityRow => ({
  slug, name, state: null, country: slug === "dubai" ? "AE" : "IN", status, threshold, min_women: 40, min_complete: 65, unlock_at: null, unlocked_at: unlocked, lat: null, lng: null,
  timezone: slug === "dubai" ? "Asia/Dubai" : "Asia/Kolkata", members, women_pct: women, complete_pct: complete, waitlist_only: Math.round(members * 0.3), per_day,
  eta_days: members >= threshold ? 0 : per_day > 0 ? Math.ceil((threshold - members) / per_day) : null, ready: members >= threshold && women >= 40 && complete >= 65 });

export const OWNER_MATRIX: Record<string, string[]> = {
  owner: ["ai.approve", "ai.limits", "ai.view", "audit.read", "birth.reveal", "campaigns.manage", "cities.unlock", "credits.adjust", "cupid.manage", "data.manage", "fraud.manage",
    "grievances.manage", "keys.manage", "payments.read", "payouts.manage", "refunds.large", "refunds.small", "reports.read_chats", "settings.write", "support.reply", "team.manage", "users.moderate", "users.read"],
  admin: ["ai.view", "audit.read", "campaigns.manage", "cities.unlock", "cupid.manage", "data.manage", "fraud.manage", "grievances.manage", "payments.read", "refunds.small", "reports.read_chats", "support.reply", "users.moderate", "users.read"],
  safety: ["fraud.manage", "grievances.manage", "reports.read_chats", "users.moderate", "users.read"],
  support: ["refunds.small", "support.reply", "users.read"],
  finance: ["ai.view", "credits.adjust", "payments.read", "payouts.manage", "refunds.large", "refunds.small", "users.read"],
  viewer: ["users.read"],
};
export const PERMISSIONS: { key: string; label: string }[] = [
  ["users.read", "See member profiles"], ["users.moderate", "Suspend, ban, review selfies and reports"], ["reports.read_chats", "Read reported chats"], ["birth.reveal", "Reveal and correct birth details"],
  ["support.reply", "Answer support"], ["grievances.manage", "Handle grievances"], ["data.manage", "Export and erase data"], ["fraud.manage", "Fraud cases"], ["refunds.small", "Refund up to ₹500"],
  ["refunds.large", "Refund above ₹500 and approve refunds"], ["credits.adjust", "Change credits and tiers"], ["payments.read", "See payments"], ["payouts.manage", "Cupid KYC, payouts and TDS"],
  ["cupid.manage", "Run Be a Cupid"], ["cities.unlock", "Add and unlock cities"], ["campaigns.manage", "Campaigns"], ["ai.view", "See AI spend"], ["ai.limits", "Change AI caps and member limits"],
  ["ai.approve", "Approve AI CEO requests"], ["settings.write", "Change prices and settings"], ["keys.manage", "Provider keys and live mode"], ["audit.read", "Read the audit log"], ["team.manage", "Invite people and change roles"],
].map(([key, label]) => ({ key, label }));

export function seedGrowth(): Growth {
  return {
    settings: {
      waitlist_jump_per_invite: S(50), public_counter_min: S(100), booth_bonus: S(20), crush_links_per_day: S(5), gift_links_per_day: S(3),
      invite_rewards: S({ inviter: 20, friend: 20, max_per_month: 10 }),
      cupid: S({ enabled: true, signup_paise: 2000, first_paid_paise: 5000, first_paid_max_pct_of_net: 40, min_first_payment_paise: 9900, friend_bonus_credits: 20, hold_days: 30,
        min_active_days_after_verify: 3, attribution_days: 30, max_signup_earnings_per_month: 100, review_above_signups_per_day: 25, review_above_paise: 100000,
        min_payout_paise: 50000, auto_approve_payout_paise: 500000, tds_rate_pct: 2, tds_threshold_paise_fy: 2000000, require_resident_india: true, max_links: 20 }),
      ai: S({ daily_cap_paise: 400000, monthly_cap_paise: 9000000, paid_overflow_pct: 125, degrade_at_pct: 85, alert_at_pct: 80, user_daily_paise: 300, user_monthly_paise: 3000,
        paid_user_multiplier: 5, usd_inr: 88, enabled: true }),
    },
    cities: [C("jaipur", "Jaipur", "live", 4812, 46, 88, 1000, 41, iso(9 * D)), C("pune", "Pune", "waitlist", 612, 44, 71, 1000, 22, null), C("ahmedabad", "Ahmedabad", "waitlist", 410, 39, 64, 1000, 9, null),
      C("dubai", "Dubai", "waitlist", 288, 35, 58, 800, 6, null), C("udaipur", "Udaipur", "locked", 94, 41, 52, 600, 1, null)],
    cupid: {
      kpis: { active: 128, partners: 19, joined_30d: 1240, verified_pct: 61, paying_30d: 142, owed_paise: 3842000, waiting_payouts: 1, waiting_kyc: 1, waiting_review: 2 },
      cupids: [
        { user_id: "u-a1b2c3", name: "Aarav", short_id: "#A1B2C3", kind: "user", status: "active", clicks: 212, joined: 46, verified: 38, paying: 9, owed_paise: 71000, kyc: "verified", rates: { signup_paise: null, first_paid_paise: null } },
        { user_id: "u-mnitdc", name: "MNIT Dating Club", short_id: "#MNITDC", kind: "partner", status: "active", clicks: 1904, joined: 311, verified: 240, paying: 41, owed_paise: 986000, kyc: "verified", rates: { signup_paise: 3000, first_paid_paise: 7000 } },
        { user_id: "u-r1y4a7", name: "Riya", short_id: "#R1Y4A7", kind: "user", status: "active", clicks: 96, joined: 22, verified: 17, paying: 4, owed_paise: 54000, kyc: "submitted", rates: { signup_paise: null, first_paid_paise: null } },
        { user_id: "u-sumitv", name: "Sumit", short_id: "#SUMITV", kind: "user", status: "active", clicks: 2870, joined: 188, verified: 12, paying: 0, owed_paise: 24000, kyc: null, rates: { signup_paise: null, first_paid_paise: null } },
      ],
      review: [
        { id: "ce-1", cupid_id: "u-sumitv", cupid: "Sumit", kind: "signup", amount_paise: 24000, at: iso(5 * H), signups_that_day: 31, shared_network: 19, face_matches: 2 },
        { id: "ce-2", cupid_id: "u-mnitdc", cupid: "MNIT Dating Club", kind: "first_paid", amount_paise: 120000, at: iso(8 * H), signups_that_day: 6, shared_network: 0, face_matches: 0 },
      ],
      kyc: [{ cupid_id: "u-r1y4a7", cupid: "Riya", legal_name: "Riya Kapoor", pan: "ABC••••34F", upi: "riya@okicici", resident: true, at: iso(D) }],
      payouts: [
        { id: "po-1", cupid_id: "u-mnitdc", cupid: "MNIT Dating Club", gross: 986000, tds: 19720, net: 966280, status: "requested", needs_review: true, requested_at: iso(2 * H), paid_at: null, utr: null, reason: null, kyc: "verified" },
        { id: "po-2", cupid_id: "u-a1b2c3", cupid: "Aarav", gross: 55000, tds: 0, net: 55000, status: "approved", needs_review: false, requested_at: iso(5 * H), paid_at: null, utr: null, reason: null, kyc: "verified" },
        { id: "po-3", cupid_id: "u-jwco", cupid: "Jaipur Weddings Co.", gross: 217000, tds: 0, net: 217000, status: "paid", needs_review: false, requested_at: iso(D), paid_at: iso(20 * H), utr: "610245781123", reason: null, kyc: "verified" },
      ],
      blocked_30d: { "same device or face as the Cupid": 43, "member banned before hold ended": 9, "refund after payout": 2 },
    },
    fraud: [
      { id: "fc-1", pattern: "Same face, 3 accounts", risk: "high", status: "open", evidence: { signal: "face_group", bonuses: 3 }, at: iso(3 * H), decision: null, decided_by: null,
        accounts: [{ id: "u-n3ha24", short_id: "#N3HA24", name: "Neha", status: "banned", joined: iso(2 * D), bonus: true }, { id: "u-n3ha25", short_id: "#N3HA25", name: "Nehal", status: "active", joined: iso(D), bonus: true },
          { id: "u-n3ha26", short_id: "#N3HA26", name: "Neha P", status: "active", joined: iso(0.5 * D), bonus: true }] },
      { id: "fc-2", pattern: "Held messages (money or contact asks)", risk: "high", status: "open", evidence: { held_7d: 4 }, at: iso(5 * H), decision: null, decided_by: null,
        accounts: [{ id: "u-r4hu11", short_id: "#R4HU11", name: "Rahul", status: "active", joined: iso(19 * D), bonus: true }] },
      { id: "fc-3", pattern: "Refund pattern", risk: "normal", status: "open", evidence: { refunds_30d: 4 }, at: iso(D), decision: null, decided_by: null,
        accounts: [{ id: "u-k4ran0", short_id: "#K4RAN0", name: "Karan", status: "active", joined: iso(30 * D), bonus: true }] },
      { id: "fc-4", pattern: "Copied bio text", risk: "low", status: "open", evidence: { bio: "i love chai, long drives, old hindi songs and planning trips" }, at: iso(2 * D), decision: null, decided_by: null,
        accounts: [{ id: "u-x1", short_id: "#X10001", name: "Ankit", status: "active", joined: iso(4 * D), bonus: true }, { id: "u-x2", short_id: "#X10002", name: "Isha", status: "active", joined: iso(3 * D), bonus: true },
          { id: "u-x3", short_id: "#X10003", name: "Rohan", status: "active", joined: iso(2 * D), bonus: true }] },
    ],
    incidents: [{ id: "in-1", started_at: iso(2 * H), title: "Selfie check slow (provider)", impact: "Sign-ups wait about 6 s", status: "watching", fixed_at: null, notes: [] },
      { id: "in-2", started_at: iso(5 * D), title: "Razorpay webhook delay 12 min", impact: "1 payment credited late", status: "fixed", fixed_at: iso(5 * D - 0.5 * H), notes: [] }],
    team: [
      { user_id: "t-me", name: "You", role: "owner", active: true, since: iso(40 * D), invited_by: null, email: "you@likha.in", last_sign_in: iso(0), mfa: true },
      { user_id: "t-seema", name: "Seema", role: "finance", active: true, since: iso(20 * D), invited_by: "You", email: "seema@likha.in", last_sign_in: iso(2 * H), mfa: true },
      { user_id: "t-anil", name: "Anil", role: "safety", active: true, since: iso(20 * D), invited_by: "You", email: "anil@likha.in", last_sign_in: iso(14 * 60e3), mfa: true },
      { user_id: "t-priya", name: "Priya", role: "support", active: true, since: iso(18 * D), invited_by: "You", email: "priya@likha.in", last_sign_in: iso(H), mfa: true },
      { user_id: "t-rohit", name: "Rohit (agency)", role: "support", active: true, since: iso(3 * D), invited_by: "You", email: "rohit@agency.in", last_sign_in: null, mfa: false },
    ],
    matrix: JSON.parse(JSON.stringify(OWNER_MATRIX)),
    audit: [
      { id: 104, at: iso(40 * 60e3), actor_type: "team", who: "Seema", action: "refund_processed", target_type: "profile", target_id: "u-ishta5", reason: "Paid, not credited", before: null, after: { credits: 275 } },
      { id: 103, at: iso(51 * 60e3), actor_type: "ai", who: "AI · safety", action: "moderation_suspend", target_type: "profile", target_id: "u-r4hu11", reason: "3 upheld reports", before: null, after: { days: 7 } },
      { id: 102, at: iso(2 * H), actor_type: "team", who: "You", action: "setting_changed", target_type: "setting", target_id: "price_list", reason: "Weekend test", before: { boost: 29 }, after: { boost: 26 } },
      { id: 101, at: iso(6 * H), actor_type: "system", who: "System", action: "unlock_city", target_type: "city", target_id: "jaipur", reason: "Scheduled unlock", before: null, after: { notified: 4812 } },
    ],
    freePaused: null, limits: {},
  };
}
