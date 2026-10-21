import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AdminApi, Ai, Keys, Me, MfaState, Model, TestResult, Overview, UserList, UserDetail, ModAction, TokenInfo, ReportRow, ReportDetail, Appeal,
  SelfieQueue, Payments, ReadingRow, ReadingContent, Tickets, Ticket, Grievances, GrievanceReport, DataRequest, Maasi, Candidate } from "./types";

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
  private async fn<T>(body: Record<string, unknown>, name = "admin-keys"): Promise<T> {
    const { data, error } = await this.sb.functions.invoke(name, { body });
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

  // ---------------------------------------------------------------- daily work
  async overview() { return this.rpc<Overview>("admin_overview"); }
  async users(query: string, filter: string) { return this.rpc<UserList>("admin_users", { p_query: query || null, p_filter: filter }); }
  async user(id: string) { return this.rpc<UserDetail>("admin_user", { p_user: id }); }
  async adjustCredits(user: string, delta: number, reason: string) { return this.rpc<number>("admin_adjust_credits", { p_user: user, p_delta: delta, p_reason: reason }); }
  async setTier(user: string, tier: string, days: number, reason: string) { await this.rpc("admin_set_tier", { p_user: user, p_tier: tier, p_days: days, p_reason: reason }); }
  async moderate(user: string, action: ModAction, reason: string, days: number | null) { await this.rpc("moderate_user", { p_user: user, p_action: action, p_reason: reason, p_days: days }); }
  async revealBirth(user: string, reason: string) { return this.rpc<Record<string, unknown> | null>("reveal_birth_details", { p_user: user, p_reason: reason }); }
  async lookupToken(token: string) { return (await this.rpc<TokenInfo | null>("admin_lookup_token", { p_token: token })) ?? null; }
  async reports(status: "open" | "closed") { return this.rpc<ReportRow[]>("admin_reports", { p_status: status }); }
  async report(id: string) { return this.rpc<ReportDetail>("admin_report", { p_id: id }); }
  async resolveReport(id: string, outcome: "resolved" | "dismissed", note: string, action: ModAction | null, days: number | null) {
    await this.rpc("admin_resolve_report", { p_id: id, p_outcome: outcome, p_note: note, p_action: action, p_days: days });
  }
  async appeals() { return this.rpc<Appeal[]>("admin_appeals"); }
  async decideAppeal(id: string, overturn: boolean, note: string) { await this.rpc("admin_decide_appeal", { p_appeal: id, p_overturn: overturn, p_note: note }); }
  async selfies() { return this.rpc<SelfieQueue>("admin_selfie_queue"); }
  async decideSelfie(id: string, decision: "approve" | "retry" | "reject", reason?: string) { await this.rpc("admin_selfie_decide", { p_check: id, p_decision: decision, p_reason: reason ?? null }); }
  async payments(filter: string, query: string) { return this.rpc<Payments>("admin_payments", { p_filter: filter, p_query: query || null }); }
  async recheckPayment(id: string) { return this.fn<{ ok: boolean; note: string }>({ action: "recheck_payment", payment_id: id }, "admin-ops"); }
  async refund(user: string, method: "credits" | "bank", reason: string, credits: number | null, amountPaise: number | null, payment: string | null) {
    await this.rpc("team_refund", { p_user: user, p_method: method, p_reason: reason, p_credits: credits, p_amount_paise: amountPaise, p_payment: payment });
  }
  async approveRefund(id: string) { await this.rpc("approve_refund", { p_refund: id }); }
  async sendRefund(id: string) { return this.fn<{ ok: boolean; note: string }>({ action: "send_refund", refund_id: id }, "admin-ops"); }
  async readings(filter: "problems" | "all", user?: string) { return this.rpc<ReadingRow[]>("admin_readings", { p_filter: filter, p_user: user ?? null }); }
  async readingContent(id: string) { return this.rpc<ReadingContent>("admin_reading", { p_id: id }); }
  async rewriteReading(id: string, reason: string) { await this.rpc("admin_rewrite_reading", { p_id: id, p_reason: reason }); }
  async refundReading(id: string, reason: string) { await this.rpc("admin_refund_reading", { p_id: id, p_reason: reason }); }
  async tickets(status: "open" | "closed") { return this.rpc<Tickets>("admin_tickets", { p_status: status }); }
  async ticket(id: string) { return this.rpc<Ticket>("admin_ticket", { p_id: id }); }
  async replyTicket(id: string, body: string, status: "in_progress" | "waiting_user" | "resolved", draftId: number | null) {
    await this.rpc("admin_reply_ticket", { p_id: id, p_body: body, p_status: status, p_draft: draftId });
  }
  async grievances() { return this.rpc<Grievances>("admin_grievances"); }
  async ackGrievance(id: string, owner: string | null, message: string) { await this.rpc("admin_grievance_ack", { p_id: id, p_owner: owner, p_message: message }); }
  async resolveGrievance(id: string, resolution: string) { await this.rpc("admin_grievance_resolve", { p_id: id, p_resolution: resolution }); }
  async grievanceReport(month: string) { return this.rpc<GrievanceReport>("admin_grievance_report", { p_month: month }); }
  async dataRequests() { return this.rpc<DataRequest[]>("admin_data_requests"); }
  async exportUser(requestId: string) { return this.rpc<Record<string, unknown>>("admin_export_user", { p_request: requestId }); }
  async eraseUser(user: string, requestId: string) { return this.rpc<Record<string, unknown>>("erase_user", { p_user: user, p_request: requestId }); }
  async closeDataRequest(id: string, note: string) { await this.rpc("admin_close_data_request", { p_id: id, p_note: note }); }
  async maasi() { return this.rpc<Maasi>("admin_maasi"); }
  async maasiCandidates(user: string) { return this.rpc<Candidate[]>("admin_maasi_candidates", { p_user: user }); }
  async addMaasiPick(user: string, pick: string, note: string) { await this.rpc("admin_add_maasi_pick", { p_user: user, p_pick: pick, p_note: note }); }
  async removeMaasiPick(id: string) { await this.rpc("admin_remove_maasi_pick", { p_id: id }); }
  async photoUrl(path: string | null) {
    if (!path) return null;
    const { data } = await this.sb.storage.from("photos").createSignedUrl(path, 600);
    return data?.signedUrl ?? null;
  }
}
