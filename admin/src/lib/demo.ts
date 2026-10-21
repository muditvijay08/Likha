// Demo admin: everything lives in this browser. Any team email works, codes are 123456. Mirrors the database rules in part 14.
import type { AdminApi, Ai, Feature, KeySlot, Keys, Me, MfaState, Model, TestResult, ModAction, Overview, UserList, Payments, Tickets, Grievances, GrievanceReport } from "./types";
import { candidates, maasiMembers, nextSunday, seedOps, shortId, userDetail, type Ops } from "./demo-ops";
import { PERMISSIONS, seedGrowth, type Growth } from "./demo-growth";
import type { AiSpend, Cities, CupidAdmin, Fraud, Health, Team } from "./types";

type Slot = [string, KeySlot["mode"], string, string, string | null, boolean, boolean, boolean, string | null];
const SLOTS: Slot[] = [
  ["ANTHROPIC_API_KEY", "any", "AI", "Anthropic (Claude)", "anthropic", false, true, true, "console.anthropic.com > API keys"],
  ["GEMINI_API_KEY", "any", "AI", "Google Gemini (text and images)", "gemini", false, true, true, "aistudio.google.com > Get API key"],
  ["OPENAI_API_KEY", "any", "AI", "OpenAI (text and GPT Image)", "openai", false, true, true, "platform.openai.com > API keys"],
  ["FAL_KEY", "any", "AI", "fal.ai (FLUX, Seedream and more)", "fal", false, true, false, "fal.ai > Dashboard > Keys. Checked with AI models > Test"],
  ["RAZORPAY_KEY_ID", "test", "Payments", "Razorpay key id (test)", "razorpay", true, false, false, "Starts rzp_test_"],
  ["RAZORPAY_KEY_SECRET", "test", "Payments", "Razorpay key secret (test)", "razorpay", false, true, true, "Tested together with the key id"],
  ["RAZORPAY_WEBHOOK_SECRET", "test", "Payments", "Razorpay webhook secret (test)", "razorpay", false, true, false, "Dashboard > Webhooks (test mode)"],
  ["RAZORPAY_KEY_ID", "live", "Payments", "Razorpay key id (live)", "razorpay", true, false, false, "Starts rzp_live_"],
  ["RAZORPAY_KEY_SECRET", "live", "Payments", "Razorpay key secret (live)", "razorpay", false, true, true, "Tested together with the key id"],
  ["RAZORPAY_WEBHOOK_SECRET", "live", "Payments", "Razorpay webhook secret (live)", "razorpay", false, true, false, "Dashboard > Webhooks (live mode)"],
  ["RAZORPAYX_KEY_ID", "test", "Payouts", "RazorpayX key id (test)", "razorpayx", false, false, false, null],
  ["RAZORPAYX_KEY_SECRET", "test", "Payouts", "RazorpayX key secret (test)", "razorpayx", false, true, true, null],
  ["RAZORPAYX_ACCOUNT_NUMBER", "test", "Payouts", "RazorpayX account number (test)", "razorpayx", false, false, false, null],
  ["RAZORPAYX_WEBHOOK_SECRET", "test", "Payouts", "RazorpayX webhook secret (test)", "razorpayx", false, true, false, null],
  ["RAZORPAYX_KEY_ID", "live", "Payouts", "RazorpayX key id (live)", "razorpayx", false, false, false, null],
  ["RAZORPAYX_KEY_SECRET", "live", "Payouts", "RazorpayX key secret (live)", "razorpayx", false, true, true, null],
  ["RAZORPAYX_ACCOUNT_NUMBER", "live", "Payouts", "RazorpayX account number (live)", "razorpayx", false, false, false, null],
  ["RAZORPAYX_WEBHOOK_SECRET", "live", "Payouts", "RazorpayX webhook secret (live)", "razorpayx", false, true, false, null],
  ["MSG91_AUTH_KEY", "any", "SMS", "MSG91 auth key", "msg91", false, true, false, "Safety alerts. Login OTPs are set in Supabase > Auth > SMS"],
  ["MSG91_SAFETY_TEMPLATE_ID", "any", "SMS", "MSG91 safety template id (DLT)", "msg91", false, false, false, "The DLT-approved alert template"],
  ["KUNDLI_URL", "any", "Kundli", "Kundli service address", "kundli", false, false, false, "e.g. https://kundli.likha.in"],
  ["KUNDLI_KEY", "any", "Kundli", "Kundli service key", "kundli", false, true, true, "Same as LIKHA_KUNDLI_KEY on the kundli server"],
  ["GOOGLE_MAPS_BROWSER_KEY", "any", "Maps", "Google Maps browser key", "google", true, false, false, "Places API (New). Restrict to likha.in in Google Cloud"],
  ["LIKHA_ALERT_WEBHOOK", "any", "Alerts", "Team alert webhook (Slack / Google Chat)", null, false, true, true, "AI spend and safety alerts"],
];
const M = (model: string, provider: Model["provider"], kind: Model["kind"], label: string, input: number, output: number, per_image: number | null, note: string | null, active = true) =>
  ({ model, provider, kind, label, input, output, per_image, note, active, verified_at: null, test_note: null }) as Omit<Model, "key_set" | "used_by">;
const MODELS = [
  M("claude-sonnet-5-5", "anthropic", "text", "claude-sonnet-5-5", 2, 10, null, null), M("claude-haiku-5-5", "anthropic", "text", "claude-haiku-5-5", 0.1, 0.5, null, null),
  M("gemini-3.1-pro-preview", "gemini", "text", "gemini-3.1-pro-preview", 2, 12, null, null), M("gemini-3.8-flash", "gemini", "text", "gemini-3.8-flash", 0.75, 3.75, null, null),
  M("gemini-3.5-flash-lite", "gemini", "text", "gemini-3.5-flash-lite", 0.3, 2.5, null, null), M("gpt-6.1-sol", "openai", "text", "gpt-6.1-sol", 2, 10, null, null),
  M("gpt-6-luna", "openai", "text", "gpt-6-luna", 0.1, 0.5, null, null),
  M("gemini-nano-banana-2.1", "gemini", "image", "Nano Banana 2.1 (Google)", 0, 0, 0.0336, "Up to 4 character references. Half price on Batch."),
  M("gemini-3.1-flash-lite-image", "gemini", "image", "Nano Banana 2 Lite (Google)", 0, 0, 0.0336, "Cheapest Google option. No character references: likeness is weaker."),
  M("gemini-3-pro-image", "gemini", "image", "Nano Banana Pro (Google)", 0, 0, 0.134, "Best likeness from Google, 4x the price."),
  M("gemini-3.1-flash-image", "gemini", "image", "Nano Banana 2 (Google, retiring)", 0, 0, 0.067, "Google retires it on 29 Oct 2026.", false),
  M("gemini-2.5-flash-image", "gemini", "image", "Nano Banana (original, legacy)", 0, 0, 0.039, "Legacy. Google recommends Nano Banana 2.1.", false),
  M("gpt-image-2", "openai", "image", "GPT Image 2 (OpenAI)", 0, 0, 0.053, "Medium quality, 1024 px. Input photos are billed on top."),
  M("gpt-image-2.5-flare", "openai", "image", "GPT Image 2.5 Flare (OpenAI)", 0, 0, 0.06, "Token-priced; this per-picture figure is an estimate. Check after the first week."),
  M("fal-ai/flux-2-max/edit", "fal", "image", "FLUX.2 [max] (fal.ai)", 0, 0, 0.13, "$0.07 first megapixel + $0.03 each extra, input photos included."),
  M("bytedance/seedream/v5/pro/edit", "fal", "image", "Seedream 5.0 Pro (fal.ai)", 0, 0, 0.051, "Confirm the edit endpoint id on fal.ai before use.", false),
  M("openai/gpt-image-2/edit", "fal", "image", "GPT Image 2 via fal.ai", 0, 0, 0.06, "Same model as OpenAI direct, billed by fal."),
];
const FEATURES: Feature[] = [
  { key: "reading", label: "Paid readings (Our Stars, Full report, Who Suits Me, ...)", kind: "text", model: "claude-sonnet-5-5", fallback: null, enabled: true, paid: true, spent_7d_paise: 0 },
  { key: "check_anyone", label: "Check With Anyone", kind: "text", model: "claude-sonnet-5-5", fallback: null, enabled: true, paid: true, spent_7d_paise: 0 },
  { key: "daily_kick", label: "Daily Kick (batch)", kind: "text", model: "claude-haiku-5-5", fallback: null, enabled: true, paid: false, spent_7d_paise: 0 },
  { key: "saathi", label: "Saathi chat", kind: "text", model: "claude-haiku-5-5", fallback: null, enabled: true, paid: false, spent_7d_paise: 0 },
  { key: "guru", label: "Guru Ji in chat", kind: "text", model: "claude-sonnet-5-5", fallback: "claude-haiku-5-5", enabled: true, paid: true, spent_7d_paise: 0 },
  { key: "cupid_opener", label: "Cupid opener", kind: "text", model: "claude-haiku-5-5", fallback: null, enabled: true, paid: true, spent_7d_paise: 0 },
  { key: "imagine", label: "Imagine Us (2 images)", kind: "image", model: "gemini-nano-banana-2.1", fallback: null, enabled: true, paid: true, spent_7d_paise: 0 },
];
/** Same as the Owner role in the database (04_seed, 07, 14). */
const OWNER_PERMS = ["ai.approve", "ai.limits", "ai.view", "audit.read", "birth.reveal", "campaigns.manage", "cities.unlock", "credits.adjust", "cupid.manage", "data.manage",
  "fraud.manage", "grievances.manage", "keys.manage", "payments.read", "payouts.manage", "refunds.large", "refunds.small", "reports.read_chats", "settings.write", "support.reply",
  "team.manage", "users.moderate", "users.read"];
const PROVIDER_KEY: Record<string, string> = { anthropic: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY", openai: "OPENAI_API_KEY", fal: "FAL_KEY" };
const KEY = "likha-admin-demo";
const H = 3600e3;
interface Stored { value: string; set_at: string; tested_at: string | null; test_ok: boolean | null; test_note: string | null }
interface Db { email?: string; signedIn: boolean; mfaFactor?: string; aal2: boolean; mode: "test" | "live"; vals: Record<string, Stored>;
  models: Omit<Model, "key_set" | "used_by">[]; features: Feature[]; spent: number; ops?: Ops; growth?: Growth }
const fresh = (): Db => ({ signedIn: false, aal2: false, mode: "test", vals: {}, models: MODELS, features: FEATURES, spent: 0 });
const wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));

/** A picture the demo "test" returns: drawn here, with the same label every real picture gets. */
function demoPicture(label: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFB27A"/><stop offset="1" stop-color="#7E5BEF"/></linearGradient></defs>` +
    `<rect width="512" height="512" fill="url(#g)"/><circle cx="210" cy="250" r="40" fill="#1F1A3D" opacity=".8"/><circle cx="300" cy="245" r="40" fill="#1F1A3D" opacity=".8"/>` +
    `<rect x="16" y="452" width="330" height="40" rx="10" fill="#000" opacity=".6"/><text x="30" y="478" font-family="sans-serif" font-size="17" fill="#fff">Imagined · Likha · not a real photo</text>` +
    `<text x="496" y="30" text-anchor="end" font-family="sans-serif" font-size="14" fill="#fff">DEMO · ${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export class DemoAdmin implements AdminApi {
  readonly demo = true;
  private load(): Db { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return fresh(); } }
  private save(d: Db) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* private mode */ } }
  private edit(fn: (d: Db) => void) { const d = this.load(); fn(d); this.save(d); return d; }
  private owner() { const d = this.load(); if (!d.signedIn || !d.aal2) throw new Error("Sign in again."); }

  async sendCode(email: string) { await wait(); if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) throw new Error("Enter your work email."); this.edit((d) => { d.email = email; }); }
  async verifyCode(_e: string, code: string) { await wait(); if (code !== "123456") throw new Error("That code didn't work or has expired. (Demo code: 123456)"); this.edit((d) => { d.signedIn = true; }); }
  async mfaState(): Promise<MfaState> { const d = this.load(); return { level: d.signedIn ? (d.aal2 ? "aal2" : "aal1") : null, factorId: d.mfaFactor ?? null }; }
  async enrollMfa() {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#fff"/><text x="80" y="84" text-anchor="middle" font-family="sans-serif" font-size="13">Demo QR</text></svg>';
    return { factorId: "demo-factor", qr: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, secret: "DEMO DEMO DEMO DEMO" };
  }
  async verifyMfa(factorId: string, code: string) { await wait(); if (code !== "123456") throw new Error("That code didn't match. (Demo code: 123456)"); this.edit((d) => { d.mfaFactor = factorId; d.aal2 = true; }); }
  async me(): Promise<Me | null> {
    const d = this.load(); if (!d.signedIn) return null;
    return { name: (d.email ?? "team").split("@")[0].replace(/^\w/, (c) => c.toUpperCase()), role: "owner", mfa: d.aal2,
             perms: OWNER_PERMS };
  }
  async signOut() { this.edit((d) => { d.signedIn = false; d.aal2 = false; }); }

  async keys(): Promise<Keys> {
    this.owner(); await wait(120); const d = this.load();
    return { payments_mode: d.mode, slots: SLOTS.map(([key, mode, grp, label, provider, is_public, is_secret, testable, hint]) => {
      const v = d.vals[`${key}:${mode}`];
      return { key, mode, grp, label, provider, is_public, is_secret, testable, hint, set: !!v,
        shown: v ? (is_secret ? `••••${v.value.slice(-4)}` : v.value) : null, set_at: v?.set_at ?? null, set_by: v ? (d.email ?? "").split("@")[0] : null,
        tested_at: v?.tested_at ?? null, test_ok: v?.test_ok ?? null, test_note: v?.test_note ?? null, in_use: mode === "any" || mode === d.mode };
    }) };
  }
  async setKey(key: string, mode: string, value: string) {
    this.owner(); await wait();
    const v = value.trim();
    if (!SLOTS.some((s) => s[0] === key && s[1] === mode)) throw new Error("unknown key");
    if (v.length < 4 || /\s/.test(v)) throw new Error("That doesn't look like a key.");
    if (key === "RAZORPAY_KEY_ID" && !v.startsWith(`rzp_${mode}_`)) throw new Error(`A ${mode} key id starts with rzp_${mode}_`);
    if (key === "KUNDLI_URL" && !v.startsWith("https://")) throw new Error("Use an https:// address.");
    this.edit((d) => { d.vals[`${key}:${mode}`] = { value: v, set_at: new Date().toISOString(), tested_at: null, test_ok: null, test_note: null }; });
  }
  async clearKey(key: string, mode: string) {
    this.owner();
    if (mode === "live" && this.load().mode === "live" && key.startsWith("RAZORPAY")) throw new Error("Switch payments to test before removing a live key.");
    this.edit((d) => { delete d.vals[`${key}:${mode}`]; });
  }
  async setPaymentsMode(mode: "test" | "live", confirm: string) {
    this.owner(); await wait();
    const d = this.load();
    if (mode === "live") {
      if (confirm !== "LIVE") throw new Error("Type LIVE to confirm.");
      const missing = SLOTS.filter((s) => s[1] === "live" && s[2] === "Payments" && !d.vals[`${s[0]}:live`]).map((s) => s[3]);
      if (missing.length) throw new Error(`Missing: ${missing.join(", ")}`);
      if (!d.vals["RAZORPAY_KEY_SECRET:live"]?.test_ok) throw new Error("Test the live Razorpay secret first.");
    }
    this.edit((x) => { x.mode = mode; });
  }
  async testKey(key: string, mode: string): Promise<TestResult> {
    this.owner(); await wait(500);
    const d = this.load(); const v = d.vals[`${key}:${mode}`];
    let r: TestResult;
    if (!v) r = { ok: false, note: "Not set" };
    else if (key === "RAZORPAY_KEY_SECRET" && !d.vals[`RAZORPAY_KEY_ID:${mode}`]) r = { ok: false, note: "Set the key id for this mode first" };
    else if (/bad|wrong/i.test(v.value)) r = { ok: false, note: "Provider refused the key (401) · demo" };
    else r = { ok: true, note: "Provider answered 200 · demo" };
    this.edit((x) => { const s = x.vals[`${key}:${mode}`]; if (s) { s.tested_at = new Date().toISOString(); s.test_ok = r.ok; s.test_note = r.note; } });
    return r;
  }

  async ai(): Promise<Ai> {
    this.owner(); await wait(120); const d = this.load();
    return { can_edit: true, usd_inr: 88, features: d.features, models: d.models.map((m) => ({ ...m,
      key_set: !!Object.keys(d.vals).find((k) => k.startsWith(`${PROVIDER_KEY[m.provider]}:`)),
      used_by: d.features.filter((f) => f.model === m.model || f.fallback === m.model).map((f) => f.key) })) };
  }
  async setFeatureModel(feature: string, model: string, fallback: string | null) {
    this.owner(); await wait();
    const d = this.load(); const f = d.features.find((x) => x.key === feature);
    const m = d.models.find((x) => x.model === model && x.active);
    if (!f) throw new Error("unknown feature");
    if (!m) throw new Error("Pick an active model.");
    const fb = fallback ? d.models.find((x) => x.model === fallback) : null;
    if (m.kind !== f.kind || (fb && fb.kind !== f.kind)) throw new Error(`${f.label} needs a ${f.kind} model`);
    this.edit((x) => { const ff = x.features.find((y) => y.key === feature)!; ff.model = model; ff.fallback = fallback || null; });
  }
  async saveModel(m: Pick<Model, "model" | "provider" | "kind" | "label" | "input" | "output" | "per_image" | "note" | "active">) {
    this.owner(); await wait();
    if (!m.model.trim() || /\s/.test(m.model)) throw new Error("Model id has no spaces.");
    if (m.kind === "image" && !(Number(m.per_image) > 0)) throw new Error("Image models need a price per picture.");
    const d = this.load();
    if (!m.active && d.features.some((f) => f.model === m.model || f.fallback === m.model)) throw new Error("A feature still uses this model; switch it first.");
    this.edit((x) => { const i = x.models.findIndex((y) => y.model === m.model);
      const row = { ...m, model: m.model.trim(), verified_at: i >= 0 ? x.models[i].verified_at : null, test_note: i >= 0 ? x.models[i].test_note : null };
      if (i >= 0) x.models[i] = row; else x.models.push(row); });
  }
  async testModel(model: string): Promise<TestResult> {
    this.owner(); await wait(900);
    const d = this.load(); const m = d.models.find((x) => x.model === model)!;
    if (!Object.keys(d.vals).some((k) => k.startsWith(`${PROVIDER_KEY[m.provider]}:`))) {
      const r = { ok: false, note: `${PROVIDER_KEY[m.provider]} is not set (Admin > Keys)` };
      this.edit((x) => { x.models.find((y) => y.model === model)!.test_note = r.note; }); return r;
    }
    const cost = m.kind === "image" ? Math.ceil((m.per_image ?? 0) * 88 * 100) : 1;
    const r: TestResult = m.kind === "image" ? { ok: true, note: `1 picture in 9 s, ₹${(cost / 100).toFixed(2)} · demo`, preview: demoPicture(m.label) } : { ok: true, note: 'Answered "OK" in 0.8 s · demo' };
    this.edit((x) => { const y = x.models.find((z) => z.model === model)!; y.verified_at = new Date().toISOString(); y.test_note = r.note; x.spent += cost; });
    return r;
  }

  // ---------------------------------------------------------------- daily work (sample data)
  private ops(): Ops { this.owner(); const d = this.load(); if (!d.ops) { d.ops = seedOps(); this.save(d); } return d.ops; }
  private opsEdit<T>(fn: (o: Ops) => T): T { this.owner(); const d = this.load(); d.ops ??= seedOps(); const r = fn(d.ops); this.save(d); return r; }
  private note(n: string, what = "a short note") { if (!n || !n.trim()) throw new Error(`Add ${what}.`); }

  async overview(): Promise<Overview> {
    await wait(120); const o = this.ops();
    return { queues: { reports: o.reports.filter((r) => r.status === "open").length, reports_urgent: o.reports.filter((r) => r.status === "open" && r.priority === "urgent").length,
        appeals: o.appeals.filter((a) => a.status === "open").length, selfies: o.selfies.length, selfie_oldest: o.selfies.at(-1)?.at ?? null,
        grievances: o.grievances.filter((g) => !["resolved", "dismissed"].includes(g.status)).length,
        grievances_ack_overdue: o.grievances.filter((g) => !g.acked && g.ack_due < new Date().toISOString() && g.status !== "resolved").length,
        tickets: o.tickets.filter((t) => t.status !== "resolved").length, data_requests: o.dataRequests.filter((x) => x.status !== "resolved").length,
        refunds_waiting: o.refunds.filter((r) => r.status === "awaiting_second_approval").length, not_credited: o.payments.filter((p) => p.status === "captured" && !p.credited).length,
        readings_stuck: o.readings.filter((r) => r.status === "generating").length },
      today: { signups: 412, signups_yesterday: 349, women_pct: 46, revenue_paise: 3820000, payments: 212, ai_paise: 194000, matches: 1126, paying_pct: 7.4 },
      signups_14d: Array.from({ length: 14 }, (_, i) => ({ day: new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10), n: 180 + i * 17 + (i % 3) * 9 })),
      funnel: [{ step: "Signed up", n: 5422 }, { step: "Selfie verified", n: 4229 }, { step: "Sent a like", n: 3470 }, { step: "Got a match", n: 2223 }, { step: "First message", n: 1789 }],
      cities: [{ slug: "jaipur", name: "Jaipur", status: "live", members: 4812, women_pct: 46, matches_today: 1126, revenue_today_paise: 3820000 },
        { slug: "pune", name: "Pune", status: "waitlist", members: 612, women_pct: 44, matches_today: 0, revenue_today_paise: 0 },
        { slug: "ahmedabad", name: "Ahmedabad", status: "waitlist", members: 410, women_pct: 39, matches_today: 0, revenue_today_paise: 0 }] };
  }
  async users(query: string, filter: string): Promise<UserList> {
    await wait(120); const o = this.ops(); const q = query.trim().toLowerCase(); const qd = query.replace(/\D/g, "");
    const all = o.users;
    const rows = all.filter((u) => (!q || (qd.length >= 10 && u.phone.endsWith(qd.slice(-10))) || shortId(u.id).toLowerCase().startsWith(q.startsWith("#") ? q : "#" + q) || u.first_name.toLowerCase().startsWith(q))
      && (filter === "women" ? u.gender === "woman" : filter === "men" ? u.gender === "man" : filter === "under_review" ? u.status === "under_review" || u.selfie === "manual_review"
        : filter === "suspended" ? u.status === "suspended" : filter === "banned" ? u.status === "banned" : true))
      .map((u) => ({ id: u.id, short_id: shortId(u.id), first_name: u.first_name, age: u.age, city: u.city, gender: u.gender, joined: u.joined, selfie: u.selfie, tier: u.tier,
        credits: u.credits, reports: o.reports.filter((r) => r.reported_id === u.id).length, status: u.status, paused: u.paused }));
    return { counts: { all: all.length, women: all.filter((u) => u.gender === "woman").length, men: all.filter((u) => u.gender === "man").length,
      under_review: all.filter((u) => u.status === "under_review" || u.selfie === "manual_review").length, suspended: all.filter((u) => u.status === "suspended").length,
      banned: all.filter((u) => u.status === "banned").length }, rows };
  }
  async user(id: string) { await wait(120); return userDetail(this.ops(), id); }
  async adjustCredits(user: string, delta: number, reason: string) {
    await wait(); this.note(reason, "a reason");
    if (!delta || Math.abs(delta) > 500) throw new Error("Adjust between 1 and 500 credits at a time.");
    return this.opsEdit((o) => { const u = o.users.find((x) => x.id === user)!; if (u.credits + delta < 0) throw new Error("Not enough credits to take back.");
      u.credits += delta; (o.ledger[user] ??= []).unshift({ at: new Date().toISOString(), delta, kind: "adjustment", reason, balance: u.credits }); return u.credits; });
  }
  async setTier(user: string, tier: string, days: number, reason: string) {
    await wait(); this.note(reason, "a reason"); if (days > 365) throw new Error("At most 365 days.");
    this.opsEdit((o) => { const u = o.users.find((x) => x.id === user)!;
      if (days <= 0) { u.tier_override = null; } else { u.tier_override = { tier, until: new Date(Date.now() + days * 864e5).toISOString() }; u.tier = tier; } });
  }
  async moderate(user: string, action: ModAction, reason: string, days: number | null) {
    await wait(); this.note(reason, "a reason");
    this.opsEdit((o) => { const u = o.users.find((x) => x.id === user)!;
      u.status = action === "suspend" ? "suspended" : action === "ban" ? "banned" : action === "hide" ? "under_review" : ["unban", "restore"].includes(action) ? "active" : u.status;
      o.actions.unshift({ id: crypto.randomUUID(), user_id: user, action, reason, until: days ? new Date(Date.now() + days * 864e5).toISOString() : null, at: new Date().toISOString(), by: "team", by_me: true }); });
  }
  async revealBirth(_user: string, reason: string) { await wait(); this.note(reason, "a reason"); return { birth_date: "1997-08-14", birth_time: "21:10", birth_place: "Jaipur (sample)" }; }
  async lookupToken(token: string) {
    await wait(); const o = this.ops(); const c = o.crush.find((x) => x.token === token.trim());
    if (!c) return null; const u = o.users.find((x) => x.id === c.from)!;
    return { type: "crush" as const, from_id: c.from, from: u.first_name, to: c.to, created: c.at, expires: c.expires, joined_id: null, reading_status: "pending_consent" };
  }
  async reports(status: "open" | "closed") {
    await wait(120); return this.ops().reports.filter((r) => status === "open" ? r.status === "open" : r.status !== "open").map(({ chat: _c, reporter_id: _r, ...x }) => x);
  }
  async report(id: string) {
    await wait(120); const o = this.ops(); const r = o.reports.find((x) => x.id === id)!; const u = o.users.find((x) => x.id === r.reported_id)!;
    return { id: r.id, reason: r.reason, details: r.details, priority: r.priority, status: r.status, at: r.at, ai_check: r.ai_check, resolution: null, reported_id: r.reported_id, reporter_id: r.reporter_id,
      reported: { name: u.first_name, age: u.age, status: u.status, selfie: u.selfie, joined: u.joined, photo: null },
      other_reports: o.reports.filter((x) => x.reported_id === r.reported_id && x.id !== r.id).map((x) => ({ reason: x.reason, at: x.at, status: x.status })),
      chat: r.has_chat ? r.chat : null, can_read_chat: true };
  }
  async resolveReport(id: string, outcome: "resolved" | "dismissed", note: string, action: ModAction | null, days: number | null) {
    await wait(); this.note(note);
    const r = this.ops().reports.find((x) => x.id === id)!;
    if (action) await this.moderate(r.reported_id, action, note, days);
    this.opsEdit((o) => { const x = o.reports.find((y) => y.id === id)!; x.status = outcome; });
  }
  async appeals() { await wait(120); return this.ops().appeals.filter((a) => a.status === "open").map(({ action_id: _a, status: _s, ...x }) => x); }
  async decideAppeal(id: string, overturn: boolean, note: string) {
    await wait(); this.note(note);
    const a = this.ops().appeals.find((x) => x.id === id)!;
    if (this.ops().actions.find((x) => x.id === a.action_id)?.by_me) throw new Error("Someone else must review an appeal of your own decision.");
    this.opsEdit((o) => { o.appeals.find((x) => x.id === id)!.status = overturn ? "overturned" : "upheld"; if (overturn) o.users.find((u) => u.id === a.user_id)!.status = "active"; });
  }
  async selfies() { await wait(120); return { reviewed_today: 46, approved_today: 41, rows: this.ops().selfies }; }
  async decideSelfie(id: string, decision: "approve" | "retry" | "reject") {
    await wait(150);
    this.opsEdit((o) => { const s = o.selfies.find((x) => x.id === id); if (!s) throw new Error("Already decided.");
      const u = o.users.find((x) => x.id === s.user_id)!; u.selfie = decision === "approve" ? "passed" : decision === "reject" ? "failed" : "not_started";
      if (decision === "approve" && u.status === "under_review") u.status = "active"; o.selfies = o.selfies.filter((x) => x.id !== id); });
  }
  async payments(filter: string, query: string): Promise<Payments> {
    await wait(120); const o = this.ops(); const q = query.trim();
    const rows = o.payments.filter((p) => (!q || p.ref === q || p.order === q || p.invoice === q) && (filter === "not_credited" ? p.status === "captured" && !p.credited
      : filter === "unconfirmed" ? p.status === "created" : filter === "failed" ? p.status === "failed" : filter === "refunded" ? p.status.includes("refunded") : true));
    return { kpis: { gross_today_paise: o.payments.filter((p) => p.status === "captured").reduce((a, p) => a + p.amount_paise, 0), payments_today: o.payments.filter((p) => p.status === "captured").length,
        refunds_today: o.refunds.length, refunds_today_paise: o.refunds.filter((r) => r.status === "processed").reduce((a, r) => a + (r.amount_paise ?? (r.credits ?? 0) * 100), 0),
        failed_today: o.payments.filter((p) => p.status === "failed").length, attempts_today: o.payments.length,
        not_credited: o.payments.filter((p) => p.status === "captured" && !p.credited).length, unconfirmed: o.payments.filter((p) => p.status === "created").length },
      rows, refunds: o.refunds.map(({ payment_id: _p, ...r }) => r), can_approve: true };
  }
  async recheckPayment(id: string) {
    await wait(600);
    return this.opsEdit((o) => { const p = o.payments.find((x) => x.id === id)!;
      if (p.status === "created") { p.status = "captured"; p.credited = true; p.ref = "pay_DEMO" + id.slice(-1); const u = o.users.find((x) => x.id === p.user_id)!; u.credits += 275;
        return { ok: true, note: `Captured by Razorpay (${p.ref}). Credited now. · demo` }; }
      return { ok: true, note: `Razorpay says ${p.status}. Nothing to change. · demo` }; });
  }
  async refund(user: string, method: "credits" | "bank", reason: string, credits: number | null, amountPaise: number | null, payment: string | null) {
    await wait(); this.note(reason, "a reason");
    const value = amountPaise ?? (credits ?? 0) * 100;
    this.opsEdit((o) => { const u = o.users.find((x) => x.id === user)!; const direct = method === "credits" && value <= 50000;
      if (direct) { u.credits += credits ?? 0; (o.ledger[user] ??= []).unshift({ at: new Date().toISOString(), delta: credits ?? 0, kind: "refund", reason, balance: u.credits }); }
      o.refunds.unshift({ id: crypto.randomUUID(), user: `${shortId(user)} ${u.first_name}`, user_id: user, method, credits, amount_paise: amountPaise, reason,
        status: direct ? "processed" : "awaiting_second_approval", at: new Date().toISOString(), requested_by: "You", mine: true,
        payment_ref: o.payments.find((p) => p.id === payment)?.ref ?? null, payment_id: payment }); });
  }
  async approveRefund(id: string) {
    await wait();
    this.opsEdit((o) => { const r = o.refunds.find((x) => x.id === id)!; if (r.mine) throw new Error("Second approver must be a different person.");
      r.status = r.method === "credits" ? "processed" : "approved"; });
  }
  async sendRefund(id: string) {
    await wait(500);
    return this.opsEdit((o) => { const r = o.refunds.find((x) => x.id === id)!; if (r.status !== "approved") throw new Error("Needs a second approval first.");
      r.status = "processed"; const p = o.payments.find((x) => x.id === r.payment_id); if (p) { p.refunded_paise += r.amount_paise ?? 0; p.status = "refunded"; }
      return { ok: true, note: "Sent to Razorpay (rfnd_DEMO). Money reaches the member in 5 to 7 working days. · demo" }; });
  }
  async readings(filter: "problems" | "all", user?: string) {
    await wait(120); return this.ops().readings.filter((r) => (!user || r.user_id === user) && (filter === "all" || ["generating", "failed", "refunded"].includes(r.status) || r.helpful === false))
      .map(({ content: _c, ...r }) => r);
  }
  async readingContent(id: string) { await wait(120); const r = this.ops().readings.find((x) => x.id === id)!; return { id: r.id, kind: r.kind, status: r.status, content: r.content, credits: r.credits, at: r.at }; }
  async rewriteReading(id: string, reason: string) {
    await wait(); this.note(reason, "a reason");
    this.opsEdit((o) => { const r = o.readings.find((x) => x.id === id)!; if (r.kind === "imagine_us" && r.status === "ready") throw new Error("Pictures are not rewritten; refund instead."); r.status = "generating"; r.attempts = 0; });
  }
  async refundReading(id: string, reason: string) {
    await wait(); this.note(reason, "a reason");
    this.opsEdit((o) => { const r = o.readings.find((x) => x.id === id)!; if (r.status === "refunded") throw new Error("Already refunded."); r.status = "refunded";
      const u = o.users.find((x) => x.id === r.user_id)!; u.credits += r.credits; });
  }
  async tickets(status: "open" | "closed"): Promise<Tickets> {
    await wait(120); const o = this.ops();
    return { kpis: { open: o.tickets.filter((t) => t.status !== "resolved").length, new: o.tickets.filter((t) => t.new).length, first_reply_min: 6, csat: 4.6 },
      rows: o.tickets.filter((t) => status === "open" ? t.status !== "resolved" : t.status === "resolved").map(({ messages: _m, ...t }) => t) };
  }
  async ticket(id: string) {
    await wait(120); const o = this.ops(); const t = o.tickets.find((x) => x.id === id)!; const u = o.users.find((x) => x.id === t.user_id);
    return { id: t.id, subject: t.subject, status: t.status, channel: t.channel, at: t.at, user_id: t.user_id,
      user: u ? { name: u.first_name, short_id: shortId(u.id), credits: u.credits, status: u.status, city: u.city } : null, messages: t.messages,
      recent_payments: o.payments.filter((p) => p.user_id === t.user_id).map((p) => ({ id: p.id, amount_paise: p.amount_paise, status: p.status, credited: p.credited, ref: p.ref, at: p.at })) };
  }
  async replyTicket(id: string, body: string, status: "in_progress" | "waiting_user" | "resolved", draftId: number | null) {
    await wait();
    this.opsEdit((o) => { const t = o.tickets.find((x) => x.id === id)!;
      if (body.trim()) { if (draftId) { const m = t.messages.find((x) => x.id === draftId)!; m.body = body.trim(); m.draft = false; m.from = "team"; m.by = "You"; }
        else t.messages.push({ id: Date.now(), from: "team", by: "You", body: body.trim(), draft: false, at: new Date().toISOString() }); t.new = false; t.last = body.trim(); }
      t.status = status; t.draft = t.messages.some((m) => m.draft); });
  }
  async grievances(): Promise<Grievances> {
    await wait(120); const o = this.ops(); const now = new Date().toISOString();
    return { kpis: { open: o.grievances.filter((g) => g.status !== "resolved").length, ack_overdue: o.grievances.filter((g) => !g.acked && g.ack_due < now && g.status !== "resolved").length,
        due_3d: o.grievances.filter((g) => g.status !== "resolved" && g.resolve_due < new Date(Date.now() + 3 * 864e5).toISOString()).length,
        resolved_month: o.grievances.filter((g) => g.status === "resolved").length + 31, avg_days: 4.2 },
      rows: o.grievances, team: [{ id: "t-1", name: "You", role: "owner" }, { id: "t-2", name: "Anil", role: "safety" }, { id: "t-3", name: "Seema", role: "finance" }] };
  }
  async ackGrievance(id: string, owner: string | null) {
    await wait();
    this.opsEdit((o) => { const g = o.grievances.find((x) => x.id === id)!; g.acked ??= new Date().toISOString(); g.status = "in_progress";
      g.owner = owner ? ({ "t-1": "You", "t-2": "Anil", "t-3": "Seema" } as Record<string, string>)[owner] ?? g.owner : g.owner ?? "You"; });
  }
  async resolveGrievance(id: string, resolution: string) {
    await wait(); if (resolution.trim().length < 20) throw new Error("Write the outcome the member will read (at least a sentence).");
    this.opsEdit((o) => { const g = o.grievances.find((x) => x.id === id)!; g.status = "resolved"; g.resolution = resolution.trim(); g.resolved = new Date().toISOString(); g.acked ??= g.resolved; });
  }
  async grievanceReport(month: string): Promise<GrievanceReport> {
    await wait(); const o = this.ops();
    return { month: new Date(month).toLocaleDateString("en-IN", { month: "short", year: "numeric" }), received: o.grievances.length + 33, resolved: o.grievances.filter((g) => g.status === "resolved").length + 31,
      acked_in_24h: 33, resolved_in_15d: 31, by_category: { impersonation: 9, payment: 11, account: 8, other: 7 }, actions: 14 };
  }
  async dataRequests() { await wait(120); return this.ops().dataRequests; }
  async exportUser(requestId: string) {
    await wait(400);
    return this.opsEdit((o) => { const r = o.dataRequests.find((x) => x.id === requestId)!; if (r.kind !== "export") throw new Error("Not an export request.");
      const data = { generated_at: new Date().toISOString(), notes: "Sample export in demo mode.", profile: userDetail(o, r.user_id!), messages_sent: [], payments: o.payments.filter((p) => p.user_id === r.user_id) };
      r.status = "resolved"; r.done = new Date().toISOString(); r.proof = { exported_at: r.done, sections: Object.keys(data) }; return data; });
  }
  async eraseUser(user: string, requestId: string) {
    await wait(400);
    return this.opsEdit((o) => { const u = o.users.find((x) => x.id === user)!; u.first_name = "Deleted user"; u.status = "deleted";
      const proof = { erased_at: new Date().toISOString(), items: ["photos", "prompts", "saathi", "birth_details", "kundli", "messages", "profile"], kept: ["payments (tax law)"] };
      const r = o.dataRequests.find((x) => x.id === requestId)!; r.status = "resolved"; r.done = proof.erased_at; r.proof = proof; return proof; });
  }
  async closeDataRequest(id: string, note: string) {
    await wait(); this.note(note);
    this.opsEdit((o) => { const r = o.dataRequests.find((x) => x.id === id)!; if (r.kind === "delete") throw new Error("Deletions are closed by Erase, which records the checklist.");
      r.status = "resolved"; r.done = new Date().toISOString(); r.proof = { note }; });
  }
  async maasi() { await wait(120); const w = nextSunday(); return { week_of: w, per_week: 3, members: maasiMembers(this.ops(), w) }; }
  async maasiCandidates(user: string) { await wait(120); return candidates(this.ops(), user); }
  async addMaasiPick(user: string, pick: string, note: string) {
    await wait();
    if (note.trim().length < 10) throw new Error("Write Maasi's note (why this person).");
    if (/(guarantee|100%|marriage fixed|definitely)/i.test(note)) throw new Error("No promises in the note.");
    this.opsEdit((o) => { const w = nextSunday(); if (o.picks.filter((p) => p.user_id === user && p.week_of === w).length >= 3) throw new Error("Three picks a week.");
      o.picks.push({ id: crypto.randomUUID(), user_id: user, pick_id: pick, name: o.users.find((u) => u.id === pick)!.first_name, note: note.trim(), response: null, week_of: w }); });
  }
  async removeMaasiPick(id: string) { await wait(); this.opsEdit((o) => { o.picks = o.picks.filter((p) => p.id !== id || p.response !== null); }); }
  async photoUrl() { return null; }

  // ---------------------------------------------------------------- growth and control (sample data)
  private g(): Growth { this.owner(); const d = this.load(); if (!d.growth) { d.growth = seedGrowth(); this.save(d); } return d.growth; }
  private gEdit<T>(fn: (g: Growth) => T): T { this.owner(); const d = this.load(); d.growth ??= seedGrowth(); const r = fn(d.growth); this.save(d); return r; }
  private log(g: Growth, action: string, target: string, reason: string | null, after: unknown = null) {
    g.audit.unshift({ id: (g.audit[0]?.id ?? 100) + 1, at: new Date().toISOString(), actor_type: "team", who: "You", action, target_type: null, target_id: target, reason, before: null, after });
  }
  async settings(keys: string[]) {
    await wait(100); const g = this.g();
    return Object.fromEntries(keys.filter((k) => g.settings[k]).map((k) => [k, { value: g.settings[k].value, version: g.settings[k].version, updated_at: g.settings[k].updated_at, updated_by: null, description: null }]));
  }
  async saveSettings(changes: Record<string, unknown>, note: string) {
    await wait(); if (note.trim().length < 3) throw new Error("Add a note saying why.");
    return this.gEdit((g) => { let n = 0;
      for (const [k, v] of Object.entries(changes)) {
        const s = g.settings[k]; if (!s) throw new Error(`Unknown setting ${k}`);
        const t = (x: unknown) => Array.isArray(x) ? "array" : typeof x;
        if (t(s.value) !== t(v)) throw new Error(`${k} must stay a ${t(s.value)}`);
        const neg = (x: unknown): boolean => typeof x === "number" ? x < 0 : !!x && typeof x === "object" && Object.values(x as object).some((y) => typeof y === "number" && y < 0);
        if (neg(v)) throw new Error(`${k} cannot be negative`);
        if (JSON.stringify(s.value) === JSON.stringify(v)) continue;
        if (!s.history.length) s.history.push({ version: s.version, value: s.value, note: "Before first change", at: s.updated_at, by: null });
        s.version += 1; s.value = v; s.updated_at = new Date().toISOString(); s.history.unshift({ version: s.version, value: v, note: note.trim(), at: s.updated_at, by: "You" });
        this.log(g, "setting_changed", k, note.trim(), v); n++;
      } return n; });
  }
  async settingHistory(key: string) { await wait(100); return this.g().settings[key]?.history ?? []; }
  async cities(): Promise<Cities> {
    await wait(120); const g = this.g();
    return { can_edit: true, can_rules: true, cities: g.cities, invites_month: 2310,
      rules: Object.fromEntries(["waitlist_jump_per_invite", "public_counter_min", "booth_bonus", "crush_links_per_day", "gift_links_per_day", "invite_rewards"].map((k) => [k, g.settings[k].value])) };
  }
  async saveCity(c: { slug: string; name: string; state: string | null; country: string; lat: number | null; lng: number | null; timezone: string; threshold: number; min_women: number; min_complete: number }) {
    await wait();
    if (!/^[a-z0-9-]{2,40}$/.test(c.slug)) throw new Error("City id: lowercase letters, numbers and dashes.");
    if (c.threshold < 50 || c.min_women < 0 || c.min_women > 100 || c.min_complete < 0 || c.min_complete > 100) throw new Error("Check the unlock numbers.");
    this.gEdit((g) => { const x = g.cities.find((y) => y.slug === c.slug);
      if (x) Object.assign(x, { name: c.name, state: c.state, country: c.country, timezone: c.timezone, threshold: c.threshold, min_women: c.min_women, min_complete: c.min_complete });
      else g.cities.push({ slug: c.slug, name: c.name, state: c.state, country: c.country, status: "locked", threshold: c.threshold, min_women: c.min_women, min_complete: c.min_complete, unlock_at: null,
        unlocked_at: null, lat: c.lat, lng: c.lng, timezone: c.timezone, members: 0, women_pct: null, complete_pct: null, waitlist_only: 0, per_day: 0, eta_days: null, ready: false });
      this.log(g, x ? "city_edited" : "city_added", c.slug, null); });
  }
  async setCityStatus(slug: string, status: "locked" | "waitlist", reason: string) {
    await wait(); if (!reason.trim()) throw new Error("Add a reason.");
    this.gEdit((g) => { const c = g.cities.find((x) => x.slug === slug)!; if (c.status === "live") throw new Error("A live city stays live."); c.status = status; if (status === "locked") c.unlock_at = null; this.log(g, "city_status", slug, reason); });
  }
  async scheduleUnlock(slug: string, at: string | null, override: string | null) {
    await wait();
    this.gEdit((g) => { const c = g.cities.find((x) => x.slug === slug)!;
      if (c.status !== "waitlist") throw new Error("Only waitlist cities can be scheduled.");
      if (at) { if (new Date(at).getTime() < Date.now() + 5 * 60e3) throw new Error("Pick a time at least 5 minutes ahead.");
        if (!c.ready && !override?.trim()) throw new Error("Not ready yet: give a reason to unlock early."); }
      c.unlock_at = at; this.log(g, at ? "unlock_scheduled" : "unlock_cancelled", slug, override); });
  }
  async unlockNow(slug: string) {
    await wait(400);
    return this.gEdit((g) => { const c = g.cities.find((x) => x.slug === slug)!; if (c.status !== "waitlist") throw new Error("City not on waitlist.");
      c.status = "live"; c.unlocked_at = new Date().toISOString(); c.unlock_at = null; this.log(g, "unlock_city", slug, "Unlocked now", { notified: c.members }); return { notified: c.members }; });
  }
  async cupidAdmin(): Promise<CupidAdmin> {
    await wait(120); const g = this.g();
    return { ...g.cupid, can_manage: true, can_pay: true, can_rules: true, config: g.settings.cupid.value as CupidAdmin["config"],
      kpis: { ...g.cupid.kpis, waiting_review: g.cupid.review.length, waiting_kyc: g.cupid.kyc.length, waiting_payouts: g.cupid.payouts.filter((p) => p.status === "requested").length } };
  }
  async decideEarning(id: string, approve: boolean, note: string) {
    await wait(); if (!note.trim()) throw new Error("Add a note.");
    this.gEdit((g) => { g.cupid.review = g.cupid.review.filter((r) => r.id !== id); this.log(g, approve ? "cupid_earning_ok" : "cupid_earning_reversed", id, note); });
  }
  async decideKyc(cupid: string, verified: boolean, reason: string | null) {
    await wait(); if (!verified && !reason?.trim()) throw new Error("Say what's wrong so they can fix it.");
    this.gEdit((g) => { g.cupid.kyc = g.cupid.kyc.filter((k) => k.cupid_id !== cupid); const c = g.cupid.cupids.find((x) => x.user_id === cupid); if (c) c.kyc = verified ? "verified" : "rejected";
      this.log(g, verified ? "cupid_kyc_verified" : "cupid_kyc_rejected", cupid, reason); });
  }
  async decidePayout(id: string, approve: boolean, reason: string | null) {
    await wait();
    this.gEdit((g) => { const p = g.cupid.payouts.find((x) => x.id === id)!; if (!["requested", "approved"].includes(p.status)) throw new Error("Payout not open.");
      p.status = approve ? "approved" : "cancelled"; p.reason = reason; this.log(g, approve ? "cupid_payout_approved" : "cupid_payout_cancelled", id, reason); });
  }
  async setCupid(user: string, status: "active" | "paused" | "banned", reason: string) {
    await wait(); if (!reason.trim()) throw new Error("Reason required.");
    this.gEdit((g) => { const c = g.cupid.cupids.find((x) => x.user_id === user)!; c.status = status; if (status === "banned") c.owed_paise = 0; this.log(g, "cupid_update", user, reason, { status }); });
  }
  async makePartner(user: string, signupPaise: number | null, firstPaidPaise: number | null, reason: string) {
    await wait(); if (!reason.trim()) throw new Error("Reason required.");
    this.gEdit((g) => { const c = g.cupid.cupids.find((x) => x.user_id === user || x.short_id.toLowerCase() === user.toLowerCase());
      if (!c) throw new Error("Partner must be a verified member (use their #ID)."); c.kind = "partner"; c.rates = { signup_paise: signupPaise, first_paid_paise: firstPaidPaise }; this.log(g, "cupid_partner", c.user_id, reason); });
  }
  async cupidTds(fy: string) {
    await wait(); this.gEdit((g) => this.log(g, "tds_export", fy, "TDS return"));
    return [{ legal_name: "Jaipur Weddings Co.", pan: "AAJFJ1234K", quarter: "Q3", gross_paise: 217000, tds_paise: 0, net_paise: 217000, payouts: 1 },
            { legal_name: "MNIT Dating Club", pan: "AAATM5678L", quarter: "Q3", gross_paise: 2140000, tds_paise: 42800, net_paise: 2097200, payouts: 3 }];
  }
  async aiSpend(): Promise<AiSpend> {
    await wait(120); const g = this.g(); const cfg = g.settings.ai.value as Record<string, number | boolean>;
    return { can_edit: true, config: cfg as AiSpend["config"], free_paused: !!g.freePaused, today_paise: 128400, month_paise: 2194000, calls_today: 18402, capped_today: 212, check_fail_pct_7d: 0.6, refunded_today: 3,
      by_feature: [{ feature: "reading", label: "Paid readings", paise: 61200, calls: 412 }, { feature: "saathi", label: "Saathi chat", paise: 23300, calls: 9120 },
        { feature: "guru", label: "Guru Ji in chat", paise: 17600, calls: 1702 }, { feature: "check_anyone", label: "Check With Anyone", paise: 14800, calls: 96 }, { feature: "daily_kick", label: "Daily Kick (batch)", paise: 11500, calls: 4812 }],
      top_users: [{ user_id: "u-k4ran0", user: "#K4RAN0 Karan", calls: 1920, paise: 2080, capped: 64, paying: false, limit: g.limits["u-k4ran0"] ?? null },
        { user_id: "u-simran", user: "#SIMRAN Simran", calls: 640, paise: 1810, capped: 0, paying: true, limit: g.limits["u-simran"] ?? null },
        { user_id: "u-k0n4l9", user: "#K0N4L9 Kunal", calls: 5410, paise: 2100, capped: 1210, paying: false, limit: g.limits["u-k0n4l9"] ?? null }] };
  }
  async pauseFreeAi(pause: boolean, reason: string) {
    await wait(); if (!reason.trim()) throw new Error("Reason required.");
    this.gEdit((g) => { if (pause && g.freePaused) throw new Error("Already paused."); g.freePaused = pause ? ["saathi", "daily_kick"] : null; this.log(g, pause ? "free_ai_paused" : "free_ai_resumed", "ai", reason); });
  }
  async setAiUserLimit(user: string, daily: number | null, monthly: number | null, blocked: boolean, reason: string) {
    await wait(); if (!reason.trim()) throw new Error("Reason required.");
    this.gEdit((g) => { g.limits[user] = { daily, monthly, blocked, reason }; this.log(g, "ai_user_limit", user, reason, { daily, monthly, blocked }); });
  }
  async aiCalls() { await wait(); return [{ at: new Date().toISOString(), feature: "saathi", model: "claude-haiku-5-5", user: "#K4RAN0", status: "ok", input_tokens: 820, output_tokens: 140, cost_paise: 2, latency_ms: 940, error: null }]; }
  async fraud(): Promise<Fraud> {
    await wait(120); const g = this.g(); const open = g.fraud.filter((c) => c.status === "open");
    return { kpis: { open: open.length, high: open.filter((c) => c.risk === "high").length, bonuses_held: 7, linked_groups: 3, banned_today: 2 }, cases: g.fraud,
      rules: { auto_suspend: { reports: 3, days: 7 }, scam_hold_score: 0.8, block_links_first_messages: 10, invite_rewards: g.settings.invite_rewards.value, refunds: { max_per_user_month: 3 } } };
  }
  async scanFraud() { await wait(500); return 0; }
  async decideFraud(id: string, action: "ban_all" | "keep_oldest" | "remove_bonuses" | "not_fraud", reason: string) {
    await wait(); if (!reason.trim()) throw new Error("Reason required.");
    this.gEdit((g) => { const c = g.fraud.find((x) => x.id === id)!; if (c.status !== "open") throw new Error("Case is closed.");
      const oldest = [...c.accounts].sort((a, b) => a.joined.localeCompare(b.joined))[0];
      for (const a of c.accounts) { if (action === "ban_all" || (action === "keep_oldest" && a.id !== oldest.id)) a.status = "banned"; if (action === "remove_bonuses" && a.id !== oldest.id) a.bonus = false; }
      c.status = action === "not_fraud" ? "dismissed" : "resolved"; c.decision = `${action}: ${reason}`; c.decided_by = "You"; this.log(g, `fraud_${action}`, id, reason); });
  }
  async health(): Promise<Health> {
    await wait(120); const g = this.g();
    return { ai_cap_paise: 400000, incidents: g.incidents, jobs: [
      { job: "kick-submit", schedule: "0 19 * * *", last_start: new Date(Date.now() - 6 * H).toISOString(), last_status: "succeeded", message: null, failed_24h: 0 },
      { job: "readings", schedule: "* * * * *", last_start: new Date(Date.now() - 40e3).toISOString(), last_status: "succeeded", message: null, failed_24h: 0 },
      { job: "safety", schedule: "*/5 * * * *", last_start: new Date(Date.now() - 2 * 60e3).toISOString(), last_status: "succeeded", message: null, failed_24h: 0 },
      { job: "city-unlocks", schedule: "*/5 * * * *", last_start: new Date(Date.now() - 3 * 60e3).toISOString(), last_status: "failed", message: "statement timeout", failed_24h: 2 }],
      services: [
        { key: "ai", name: "Readings, Saathi and Guru Ji (AI)", status: "up", calls: 18402, success_pct: 99.7, latency_ms: 3100, spend_paise: 128400, note: null },
        { key: "payments", name: "Payments (Razorpay)", status: "up", calls: 226, success_pct: 93.4, note: null, mode: "test" },
        { key: "kundli", name: "Kundli engine", status: "up", calls: 412, success_pct: 100, note: null },
        { key: "kick", name: "Daily Kick (overnight)", status: "up", calls: 4812, success_pct: 100, note: "4812 of 4812 members have today's Kick" },
        { key: "selfie", name: "Selfie check", status: "slow", calls: 398, success_pct: 89, note: "11 waiting for a person" },
        { key: "push", name: "Push notifications", status: "off", note: "Not connected yet (OneSignal). Members see notices in their Inbox." },
        { key: "db", name: "Database and storage", status: "up", size_mb: 412 }] };
  }
  async saveIncident(id: string | null, title: string, impact: string, status: "open" | "watching" | "fixed", note: string) {
    await wait();
    this.gEdit((g) => { if (!id) { if (title.trim().length < 3) throw new Error("Give it a short title.");
        g.incidents.unshift({ id: crypto.randomUUID(), started_at: new Date().toISOString(), title: title.trim(), impact: impact || null, status, fixed_at: status === "fixed" ? new Date().toISOString() : null, notes: [] }); }
      else { const i = g.incidents.find((x) => x.id === id)!; i.status = status; if (status === "fixed") i.fixed_at ??= new Date().toISOString();
        if (note.trim()) i.notes.push({ at: new Date().toISOString(), by: "You", note: note.trim() }); }
      this.log(g, `incident_${status}`, id ?? "new", note || title); });
  }
  async team(): Promise<Team> {
    await wait(120); const g = this.g();
    return { can_manage: true, me: "t-me", members: g.team, roles: ["owner", "admin", "safety", "support", "finance", "viewer"], permissions: PERMISSIONS, matrix: g.matrix };
  }
  async setMember(user: string, role: string, active: boolean, reason: string) {
    await wait(); if (!reason.trim()) throw new Error("Reason required.");
    if (user === "t-me") throw new Error("Ask another owner to change your own access.");
    this.gEdit((g) => { const m = g.team.find((x) => x.user_id === user)!; m.role = role; m.active = active; this.log(g, "team_member", user, reason, { role, active }); });
  }
  async setRolePermission(role: string, perm: string, on: boolean, reason: string) {
    await wait(); if (!reason.trim()) throw new Error("Reason required.");
    if (role === "owner") throw new Error("The owner role always has everything.");
    if (on && (perm === "keys.manage" || perm === "team.manage")) throw new Error(`${perm} stays with owners.`);
    this.gEdit((g) => { const l = new Set(g.matrix[role] ?? []); if (on) l.add(perm); else l.delete(perm); g.matrix[role] = [...l].sort(); this.log(g, "role_permission", role, reason, { permission: perm, on }); });
  }
  async inviteMember(email: string, name: string, role: string) {
    await wait(400);
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email) || name.trim().length < 2) throw new Error("Name and a work email, please.");
    if (role === "owner") throw new Error("Owners are made by another owner after they join.");
    this.gEdit((g) => { g.team.push({ user_id: crypto.randomUUID(), name: name.trim(), role, active: true, since: new Date().toISOString(), invited_by: "You", email, last_sign_in: null, mfa: false });
      this.log(g, "team_invite", email, null, { role }); });
    return { ok: true, note: `Invited ${name.trim()}. They sign in with their email and set up an authenticator app.` };
  }
  async audit(query: string, actor: string | null) {
    await wait(120); const q = query.trim().toLowerCase();
    return this.g().audit.filter((a) => (!actor || a.actor_type === actor) && (!q || a.action.includes(q) || (a.reason ?? "").toLowerCase().includes(q) || (a.target_id ?? "").toLowerCase().startsWith(q)));
  }
}
