// Demo data for the daily-work screens. Sample people only (the demo bar says so). Rules mirror database part 15.
import type { Appeal, Candidate, DataRequest, GrievanceRow, MaasiMember, PaymentRow, ReadingRow, RefundRow, ReportRow, SelfieRow, Ticket, TicketRow, UserDetail } from "./types";

const H = 3600e3, D = 864e5;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const sid = (id: string) => "#" + id.replace(/^u-/, "").slice(0, 6).toUpperCase();

export interface DemoUser { id: string; first_name: string; age: number; gender: "woman" | "man"; city: string; joined: string; selfie: string; tier: string; credits: number;
  status: string; paused: boolean; phone: string; profession: string; goal: string; tier_override: { tier: string; until: string } | null }
export interface Ops {
  users: DemoUser[]; reports: (ReportRow & { reporter_id: string; chat: { from: "reported" | "reporter"; body: string; held: boolean; at: string }[] })[];
  actions: { id: string; user_id: string; action: string; reason: string; until: string | null; at: string; by: string; by_me: boolean }[];
  appeals: (Appeal & { action_id: string; status: string })[]; selfies: SelfieRow[]; payments: PaymentRow[]; refunds: (RefundRow & { payment_id: string | null })[];
  readings: (ReadingRow & { content: { title: string; summary: string; sections: { heading: string; body: string }[] } })[];
  tickets: (TicketRow & { messages: Ticket["messages"] })[]; grievances: GrievanceRow[]; dataRequests: DataRequest[];
  maasi: { user_id: string; until: string }[]; picks: { id: string; user_id: string; pick_id: string; name: string; note: string; response: string | null; week_of: string }[];
  ledger: Record<string, { at: string; delta: number; kind: string; reason: string; balance: number }[]>; crush: { from: string; to: string; token: string; joined: boolean; expires: string; at: string }[];
  audit: { at: string; action: string; target: string; note: string }[];
}

export function seedOps(): Ops {
  const U = (id: string, first_name: string, age: number, gender: "woman" | "man", city: string, daysAgo: number, selfie: string, tier: string, credits: number, status: string, profession: string, phone: string): DemoUser =>
    ({ id, first_name, age, gender, city, joined: iso(daysAgo * D), selfie, tier, credits, status, paused: false, phone, profession, goal: "matchmaking", tier_override: null });
  const users = [
    U("u-a1b2c3", "Aarav", 27, "man", "Jaipur", 9, "passed", "graha", 120, "active", "Product manager", "919829041234"),
    U("u-r1y4a7", "Riya", 26, "woman", "Jaipur", 9, "passed", "graha", 310, "active", "Architect", "919829041235"),
    U("u-k0n4l9", "Kunal", 19, "man", "Jaipur", 0.2, "manual_review", "none", 70, "under_review", "Student", "919829041236"),
    U("u-r4hu11", "Rahul", 31, "man", "Jaipur", 19, "passed", "tara", 45, "active", "Sales", "919829041237"),
    U("u-n3ha24", "Neha", 24, "woman", "Jaipur", 1, "failed", "none", 0, "banned", "Designer", "919829041238"),
    U("u-ishta5", "Ishita", 25, "woman", "Jaipur", 4, "passed", "none", 30, "active", "Teacher", "919829041239"),
    U("u-r1tu22", "Ritu", 23, "woman", "Jaipur", 0.1, "manual_review", "none", 0, "onboarding", "Nurse", "919829041240"),
    U("u-sanyaa", "Sanya", 24, "woman", "Jaipur", 12, "passed", "tara", 80, "active", "Teacher", "919829041241"),
    U("u-kab1r8", "Kabir", 28, "man", "Jaipur", 15, "passed", "graha", 60, "active", "Chartered accountant", "919829041242"),
    U("u-dev0r7", "Devansh", 29, "man", "Jaipur", 22, "passed", "tara", 25, "active", "Doctor", "919829041243"),
  ];
  const chat = (pairs: [("reported" | "reporter"), string][]) => pairs.map(([from, body], i) => ({ from, body, held: false, at: iso((pairs.length - i) * 30 * 60e3) }));
  return {
    users,
    reports: [
      { id: "rp-1", priority: "urgent", reason: "under_18", details: "Says he is in class 12", status: "open", reported_id: "u-k0n4l9", reported: "#K0N4L9 Kunal", reporter: "#SANYAA", reporter_id: "u-sanyaa",
        ai_check: { label: "Likely under 18", score: 0.81 }, at: iso(6 * 60e3), has_chat: true, times_reported: 1,
        chat: chat([["reported", "hi"], ["reporter", "Hi! What do you do?"], ["reported", "class 12 boards next year haha"]]) },
      { id: "rp-2", priority: "high", reason: "scam", details: "Asked for money for a cab", status: "open", reported_id: "u-r4hu11", reported: "#R4HU11 Rahul", reporter: "#ISHTA5", reporter_id: "u-ishta5",
        ai_check: { label: "Scam pattern", score: 0.93 }, at: iso(32 * 60e3), has_chat: true, times_reported: 3,
        chat: chat([["reported", "Hey Ishita, can you send 2000 on GPay? Cab broke down"], ["reporter", "We haven't even met"], ["reported", "Please, I'll return tomorrow"]]) },
      { id: "rp-3", priority: "normal", reason: "fake_profile", details: "Photos look like a model", status: "open", reported_id: "u-r1tu22", reported: "#R1TU22 Ritu", reporter: "#A1B2C3", reporter_id: "u-a1b2c3",
        ai_check: { label: "Stock photo", score: 0.74 }, at: iso(2 * H), has_chat: false, times_reported: 1, chat: [] },
    ],
    actions: [{ id: "ma-1", user_id: "u-n3ha24", action: "ban", reason: "Same face on 3 accounts (bonus abuse)", until: null, at: iso(20 * H), by: "team", by_me: false }],
    appeals: [{ id: "ap-1", action_id: "ma-1", user_id: "u-n3ha24", user: "#N3HA24 Neha", text: "Those are my sisters' accounts, we look alike", at: iso(5 * H), action: "ban",
      reason: "Same face on 3 accounts (bonus abuse)", until: null, acted_at: iso(20 * H), status: "open" }],
    selfies: [
      { id: "sc-1", user_id: "u-k0n4l9", user: "#K0N4L9 Kunal", age: 19, score: 0.71, liveness: true, tries: 3, why: "Low light", at: iso(4 * 60e3), photo: null, same_face: 0, under_18_report: true },
      { id: "sc-2", user_id: "u-r1tu22", user: "#R1TU22 Ritu", age: 23, score: 0.62, liveness: true, tries: 1, why: "Glasses", at: iso(11 * 60e3), photo: null, same_face: 0, under_18_report: false },
    ],
    payments: [
      { id: "py-1", at: iso(20 * 60e3), user_id: "u-a1b2c3", user: "#A1B2C3 Aarav", item: "600 cr pack", amount_paise: 49900, order: "order_ORx81K", ref: "pay_ORx81K2", status: "captured", credited: true, method: "upi", invoice: "LKH/26-27/000412", refunded_paise: 0 },
      { id: "py-2", at: iso(49 * 60e3), user_id: "u-r1y4a7", user: "#R1Y4A7 Riya", item: "Kick Pass", amount_paise: 19900, order: "order_ORx7Ga", ref: "pay_ORx7Ga1", status: "captured", credited: true, method: "upi", invoice: "LKH/26-27/000411", refunded_paise: 0 },
      { id: "py-3", at: iso(63 * 60e3), user_id: "u-ishta5", user: "#ISHTA5 Ishita", item: "275 cr pack", amount_paise: 24900, order: "order_ORx6Lm", ref: null, status: "created", credited: false, method: null, invoice: null, refunded_paise: 0 },
      { id: "py-4", at: iso(81 * 60e3), user_id: "u-r4hu11", user: "#R4HU11 Rahul", item: "100 cr pack", amount_paise: 9900, order: "order_ORx5Qe", ref: "pay_ORx5Qe2", status: "failed", credited: false, method: "upi", invoice: null, refunded_paise: 0 },
    ],
    refunds: [{ id: "rf-1", user: "#R1Y4A7 Riya", user_id: "u-r1y4a7", method: "bank", credits: null, amount_paise: 19900, reason: "Charged twice for Kick Pass", status: "awaiting_second_approval",
      at: iso(3 * H), requested_by: "Seema", mine: false, payment_ref: "pay_ORx7Ga1", payment_id: "py-2" }],
    readings: [
      { id: "rd-1", user_id: "u-ishta5", user: "#ISHTA5 Ishita", kind: "who_suits_me", status: "generating", credits: 49, at: iso(40 * 60e3), attempts: 2, helpful: null, last_error: "number check: Gunas 31 not in facts",
        content: { title: "Your chart looks for someone steady", summary: "Sample reading.", sections: [{ heading: "Your 7th house", body: "Someone calm and warm." }] } },
      { id: "rd-2", user_id: "u-a1b2c3", user: "#A1B2C3 Aarav", kind: "our_stars", status: "ready", credits: 49, at: iso(26 * H), attempts: 1, helpful: false, last_error: null,
        content: { title: "Aarav and Riya: easy warmth", summary: "Sample reading.", sections: [{ heading: "What flows", body: "Your Moons are friends." }, { heading: "What flows", body: "Your Moons are friends." }] } },
    ],
    tickets: [
      { id: "tk-1", user_id: "u-ishta5", user: "#ISHTA5 Ishita", subject: "Paid ₹249, no credits", channel: "whatsapp", status: "open", at: iso(3 * 60e3), new: true, last: "I paid ₹249 on GPay but my credits didn't come. Paise kat gaye!", draft: true,
        messages: [{ id: 1, from: "user", by: null, body: "I paid ₹249 on GPay but my credits didn't come. Paise kat gaye!", draft: false, at: iso(3 * 60e3) },
                   { id: 2, from: "ai", by: null, body: "Sorry Ishita! Your payment of ₹249 reached us but the credits didn't land. I've checked with Razorpay and added 275 credits.", draft: true, at: iso(2 * 60e3) }] },
      { id: "tk-2", user_id: "u-a1b2c3", user: "#A1B2C3 Aarav", subject: "Change birth time", channel: "in_app", status: "waiting_user", at: iso(H), new: false, last: "Could you send a photo of your birth certificate?", draft: false,
        messages: [{ id: 3, from: "user", by: null, body: "My birth time is 9:40 not 9:10", draft: false, at: iso(H) }, { id: 4, from: "team", by: "Priya", body: "Could you send a photo of your birth certificate?", draft: false, at: iso(50 * 60e3) }] },
    ],
    grievances: [
      { id: "gr-1", ticket_no: "GR-1042", category: "impersonation", description: "A profile is using my photos", attachments: [], user_id: "u-sanyaa", user: "#SANYAA Sanya", at: iso(25 * H), ack_due: iso(H),
        acked: null, resolve_due: new Date(Date.now() + 14 * D).toISOString(), resolved: null, status: "open", resolution: null, owner: null },
      { id: "gr-2", ticket_no: "GR-1041", category: "payment", description: "Charged twice", attachments: [], user_id: "u-r1y4a7", user: "#R1Y4A7 Riya", at: iso(2 * D), ack_due: iso(D),
        acked: iso(1.8 * D), resolve_due: new Date(Date.now() + 13 * D).toISOString(), resolved: null, status: "in_progress", resolution: null, owner: "Seema" },
    ],
    dataRequests: [
      { id: "dr-1", user_id: "u-a1b2c3", user: "#A1B2C3 Aarav", kind: "export", details: null, status: "open", at: iso(2 * D), due: new Date(Date.now() + 5 * D).toISOString(), done: null, proof: null },
      { id: "dr-2", user_id: "u-n3ha24", user: "#N3HA24 Neha", kind: "delete", details: "Delete everything", status: "open", at: iso(6 * D), due: new Date(Date.now() + D).toISOString(), done: null, proof: null },
      { id: "dr-3", user_id: "u-r4hu11", user: "#R4HU11 Rahul", kind: "withdraw_consent", details: "marketing", status: "open", at: iso(D), due: new Date(Date.now() + 6 * D).toISOString(), done: null, proof: null },
    ],
    maasi: [{ user_id: "u-r1y4a7", until: new Date(Date.now() + 20 * D).toISOString() }], picks: [],
    ledger: { "u-a1b2c3": [{ at: iso(20 * 60e3), delta: 600, kind: "purchase", reason: "600 cr pack", balance: 720 }, { at: iso(2 * D), delta: -49, kind: "spend", reason: "Our Stars", balance: 120 }] },
    crush: [{ from: "u-a1b2c3", to: "Meera", token: "k7Qp2", joined: false, expires: new Date(Date.now() + 20 * D).toISOString(), at: iso(3 * D) }],
    audit: [],
  };
}

export const shortId = sid;
export function userDetail(o: Ops, id: string): UserDetail {
  const u = o.users.find((x) => x.id === id);
  if (!u) throw new Error("user not found");
  return { id: u.id, short_id: sid(u.id), first_name: u.first_name, age: u.age, gender: u.gender, city: u.city, travel_city: null,
    phone: `+${u.phone.slice(0, 2)} ${u.phone.slice(2, 4)}•• ••${u.phone.slice(-4)}`, status: u.status, paused: u.paused, joined: u.joined, last_active: iso(H),
    selfie: u.selfie, goal: u.goal, profession: u.profession, complete_pct: 100, tier: u.tier, tier_override: u.tier_override && u.tier_override.until > new Date().toISOString() ? u.tier_override : null,
    photo: null, credits: u.credits, ledger: o.ledger[u.id] ?? [],
    payments: o.payments.filter((p) => p.user_id === u.id).map((p) => ({ id: p.id, at: p.at, item: p.item, amount_paise: p.amount_paise, status: p.status, credited: p.credited, ref: p.ref })),
    plans: o.maasi.filter((m) => m.user_id === u.id).map((m) => ({ plan: "rishta_maasi", until: m.until, status: "active" })),
    reports_against: o.reports.filter((r) => r.reported_id === u.id).map((r) => ({ id: r.id, reason: r.reason, status: r.status, at: r.at, priority: r.priority })),
    reports_made: o.reports.filter((r) => r.reporter_id === u.id).length,
    actions: o.actions.filter((a) => a.user_id === u.id).map((a) => ({ id: a.id, action: a.action, reason: a.reason, until: a.until, at: a.at, by: a.by,
      appeal: (() => { const x = o.appeals.find((p) => p.action_id === a.id); return x ? { id: x.id, status: x.status, text: x.text } : null; })() })),
    matches: u.id === "u-a1b2c3" || u.id === "u-r1y4a7" ? 1 : 0, likes_sent_7d: 4,
    readings: o.readings.filter((r) => r.user_id === u.id).map((r) => ({ id: r.id, kind: r.kind, status: r.status, credits: r.credits, at: r.at })),
    crush_checks: o.crush.filter((c) => c.from === u.id).map((c) => ({ name: c.to, token: c.token, joined: c.joined, expires: c.expires, at: c.at })),
    gifts_sent: [], gifts_received: 0, saathi: { messages_7d: u.id === "u-sanyaa" ? 23 : 0, crisis: 0 }, guru_questions: 0,
    maasi_until: o.maasi.find((m) => m.user_id === u.id)?.until ?? null, referred_by: u.id === "u-ishta5" ? "Cupid riya-insta" : null };
}

export function maasiMembers(o: Ops, week: string): MaasiMember[] {
  return o.maasi.map((m) => { const u = o.users.find((x) => x.id === m.user_id)!;
    return { user_id: u.id, user: `${sid(u.id)} ${u.first_name}`, age: u.age, gender: u.gender, city: u.city, until: m.until,
      picks: o.picks.filter((p) => p.user_id === u.id && p.week_of === week).map((p) => ({ id: p.id, name: p.name, note: p.note, response: p.response })), last_week_interested: 0 }; });
}
export function candidates(o: Ops, userId: string): Candidate[] {
  const me = o.users.find((x) => x.id === userId)!;
  const taken = new Set(o.picks.filter((p) => p.user_id === userId).map((p) => p.pick_id));
  return o.users.filter((u) => u.gender !== me.gender && u.status === "active" && !taken.has(u.id) && u.id !== "u-a1b2c3")
    .map((u, i) => ({ id: u.id, name: u.first_name, age: u.age, profession: u.profession, jodi_score: 88 - i * 6, gunas: 27 - i * 2, moon: ["Taurus", "Cancer", "Virgo"][i % 3],
      nakshatra: ["Rohini", "Pushya", "Hasta"][i % 3], goal: u.goal, photo: null }));
}
export const nextSunday = () => { const d = new Date(Date.now() + 5.5 * H); d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7)); return d.toISOString().slice(0, 10); };
