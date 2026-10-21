// Demo admin: everything lives in this browser. Any team email works, codes are 123456. Mirrors the database rules in part 14.
import type { AdminApi, Ai, Feature, KeySlot, Keys, Me, MfaState, Model, TestResult } from "./types";

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
const PROVIDER_KEY: Record<string, string> = { anthropic: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY", openai: "OPENAI_API_KEY", fal: "FAL_KEY" };
const KEY = "likha-admin-demo";
interface Stored { value: string; set_at: string; tested_at: string | null; test_ok: boolean | null; test_note: string | null }
interface Db { email?: string; signedIn: boolean; mfaFactor?: string; aal2: boolean; mode: "test" | "live"; vals: Record<string, Stored>;
  models: Omit<Model, "key_set" | "used_by">[]; features: Feature[]; spent: number }
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
             perms: ["ai.view", "audit.read", "keys.manage", "settings.write", "team.manage"] };
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
}
