import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AdminApi, Ai, Keys, Me, MfaState, Model, TestResult } from "./types";

const FRIENDLY: [RegExp, string][] = [
  [/not allowed/, "You don't have permission for this."],
  [/Signups not allowed|User not found/, "This email isn't on the Likha team."],
  [/Token has expired or is invalid/, "That code didn't work or has expired."],
];
function fail(error: { message: string } | null) {
  if (!error) return;
  const f = FRIENDLY.find(([re]) => re.test(error.message));
  throw new Error(f ? f[1] : error.message.replace(/^.*?ERROR:\s*/, ""));
}

export class SupabaseAdmin implements AdminApi {
  readonly demo = false;
  private sb: SupabaseClient;
  constructor(url: string, key: string) {
    this.sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "likha-admin-auth" } });
  }
  private async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args); fail(error); return data as T;
  }
  private async fn<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.functions.invoke("admin-keys", { body });
    if (error) {
      let msg = "The test didn't run. Try again.";
      try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error; } catch { /* keep */ }
      throw new Error(msg);
    }
    return data as T;
  }

  async sendCode(email: string) { const { error } = await this.sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }); fail(error); }
  async verifyCode(email: string, code: string) { const { error } = await this.sb.auth.verifyOtp({ email, token: code, type: "email" }); fail(error); }
  async mfaState(): Promise<MfaState> {
    const { data: aal } = await this.sb.auth.mfa.getAuthenticatorAssuranceLevel();
    const { data: f } = await this.sb.auth.mfa.listFactors();
    return { level: (aal?.currentLevel as MfaState["level"]) ?? null, factorId: f?.totp?.find((x) => x.status === "verified")?.id ?? null };
  }
  async enrollMfa() {
    const { data, error } = await this.sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `Likha admin ${new Date().toISOString().slice(0, 10)}` });
    fail(error);
    return { factorId: data!.id, qr: data!.totp.qr_code, secret: data!.totp.secret };
  }
  async verifyMfa(factorId: string, code: string) { const { error } = await this.sb.auth.mfa.challengeAndVerify({ factorId, code }); fail(error); }
  async me() { return (await this.rpc<Me | null>("admin_me")) ?? null; }
  async signOut() { await this.sb.auth.signOut(); }

  async keys() { return this.rpc<Keys>("admin_keys"); }
  async setKey(key: string, mode: string, value: string) { await this.rpc("admin_set_key", { p_key: key, p_mode: mode, p_value: value }); }
  async clearKey(key: string, mode: string) { await this.rpc("admin_clear_key", { p_key: key, p_mode: mode }); }
  async setPaymentsMode(mode: "test" | "live", confirm: string) { await this.rpc("admin_set_payments_mode", { p_mode: mode, p_confirm: confirm }); }
  async testKey(key: string, mode: string) { return this.fn<TestResult>({ action: "test_key", key, mode }); }

  async ai() { return this.rpc<Ai>("admin_ai"); }
  async setFeatureModel(feature: string, model: string, fallback: string | null) {
    await this.rpc("admin_set_feature_model", { p_feature: feature, p_model: model, p_fallback: fallback });
  }
  async saveModel(m: Pick<Model, "model" | "provider" | "kind" | "label" | "input" | "output" | "per_image" | "note" | "active">) {
    await this.rpc("admin_upsert_model", { p_model: m.model, p_provider: m.provider, p_kind: m.kind, p_label: m.label, p_input: m.input,
      p_output: m.output, p_per_image: m.per_image, p_note: m.note, p_active: m.active });
  }
  async testModel(model: string) { return this.fn<TestResult>({ action: "test_model", model }); }
}
