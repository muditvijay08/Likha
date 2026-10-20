import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AccountState, DateShare, History, Invoice, MyProfile, Notice, NotifPrefs, ProfilePatch, ReportReason, Ticket, Toolkit, TrustedContact,
  CrushCheck, GiftItem, MaasiState, PaymentStatus, ReadingFull, ReadingItem, UpiApp, Wallet,
  ChatData, GuruState, Msg, SaathiChar, SaathiReply, SaathiState,
  Api, Basics, Birth, Card, City, CityQueue, Filters, Gender, Goal, HomeData, Interest, Kick, LikeCard, LikeResult, Lifestyle,
  MatchRow, MyChart, OnboardingState, Photo, Place, Prefs, Prices, ProfileFull, PublicSettings, Pulse, Reading, Refresh, SelfieResult,
} from "./types";

/** Errors the database raises on purpose, in member words. */
const FRIENDLY: [string, string][] = [
  ["insufficient_credits", "Not enough credits. Top up your wallet to continue."],
  ["daily_like_limit", "That's all your likes for today. New ones arrive at midnight."],
  ["profile not available", "This profile isn't available any more."],
  ["kick_not_ready", "Today's Kick is still being written. Check back in a little while."],
  ["account not active", "Finish your profile to start liking people."],
  ["chat_closed", "This chat has ended."],
  ["verify_first", "Your selfie is being checked. Likes unlock once you're verified."],
  ["otp_needed", "Please confirm with the code we just sent."],
  ["pick a trusted contact", "Add someone you trust first."],
  ["appeal window closed", "The 30 days to appeal this decision have passed."],
  ["daily_limit", "That's the most for today. Try again tomorrow."],
  ["kundli_not_ready", "Your kundli is still being made. Try again in a minute."],
  ["delivery date is in the past", "Pick today or a later date."],
  ["guru_busy", "Guru Ji is still answering the last question."],
  ["guru_no_questions", "No questions left for you two. Get 20 more to keep asking."],
];

function fail(error: { message: string } | null, what: string): void {
  if (!error) return;
  const f = FRIENDLY.find(([code]) => error.message.includes(code));
  throw new Error(f ? f[1] : `${what}: ${error.message}`);
}

export class SupabaseApi implements Api {
  readonly demo = false;
  private sb: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "likha-auth" } });
  }

  private async uid(): Promise<string> {
    const { data } = await this.sb.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new Error("Please sign in again.");
    return id;
  }

  async sendOtp(phone: string, channel: "sms" | "whatsapp") {
    const { error } = await this.sb.auth.signInWithOtp({ phone, options: { channel } });
    fail(error, "Could not send the code");
  }

  async verifyOtp(phone: string, token: string) {
    const { error } = await this.sb.auth.verifyOtp({ phone, token, type: "sms" });
    fail(error, "That code didn't work");
  }

  async signedIn() {
    const { data } = await this.sb.auth.getSession();
    return !!data.session;
  }

  async signOut() { await this.sb.auth.signOut(); }

  async settings(): Promise<PublicSettings> {
    const { data, error } = await this.sb.rpc("public_settings");
    fail(error, "Settings");
    return data as PublicSettings;
  }

  async state(): Promise<OnboardingState> {
    const { data, error } = await this.sb.rpc("onboarding_state");
    fail(error, "Loading your profile");
    return data as OnboardingState;
  }

  async createProfile(firstName: string, gender: Gender, consents: string[]) {
    const id = await this.uid();
    const { error } = await this.sb.from("profiles").upsert({ id, first_name: firstName, gender, onboarding_step: 1 }, { onConflict: "id" });
    fail(error, "Creating your profile");
    const { data: versions, error: e2 } = await this.sb.from("consent_versions").select("key,version").in("key", consents);
    fail(e2, "Consents");
    const latest = new Map<string, string>();
    for (const v of (versions ?? []) as { key: string; version: string }[]) {
      if (!latest.has(v.key) || v.version > latest.get(v.key)!) latest.set(v.key, v.version);
    }
    const rows = [...latest].map(([key, version]) => ({ user_id: id, consent_key: key, version, granted: true }));
    if (rows.length) {
      const { error: e3 } = await this.sb.from("user_consents").upsert(rows, { onConflict: "user_id,consent_key,version", ignoreDuplicates: true });
      fail(e3, "Saving consents");
    }
  }

  async saveBasics(b: Basics) {
    const id = await this.uid();
    const { error } = await this.sb.from("profiles").update({
      first_name: b.first_name, show_me: b.show_me, height_cm: b.height_cm, mother_tongue: b.mother_tongue || null,
      education: b.education || null, profession: b.profession || null, languages: b.languages ?? [],
      college: b.college || null, company: b.company || null, hometown: b.hometown || null,
    }).eq("id", id);
    fail(error, "Saving your details");
  }

  async setCity(p: Place, tz: string): Promise<City> {
    const { data, error } = await this.sb.rpc("set_my_city", { p_name: p.name, p_state: p.state ?? null, p_country: p.country,
      p_lat: p.lat, p_lng: p.lng, p_tz: tz });
    fail(error, "Saving your city");
    return data as City;
  }

  async saveLifestyle(l: Lifestyle) {
    const id = await this.uid();
    const { error } = await this.sb.from("profiles").update(l).eq("id", id);
    fail(error, "Saving lifestyle");
  }

  async saveBirth(b: Birth) {
    const { error } = await this.sb.rpc("save_birth_details", {
      p_date: b.date, p_time: b.time, p_place: b.place.label, p_place_id: b.place.place_id ?? null,
      p_lat: b.place.lat, p_lng: b.place.lng, p_tz: b.tz, p_offset_min: b.offsetMinutes,
    });
    if (error?.message.includes("birth_details_locked")) return;          // already saved earlier: fine
    if (error?.message.includes("under_age")) throw new Error("Likha is for people 18 and older.");
    fail(error, "Saving birth details");
  }

  async photos(): Promise<Photo[]> {
    const id = await this.uid();
    const { data, error } = await this.sb.from("photos").select("id,position,storage_path,moderation_status").eq("user_id", id).order("position");
    fail(error, "Loading photos");
    const rows = (data ?? []) as { id: string; position: number; storage_path: string; moderation_status: Photo["status"] }[];
    if (!rows.length) return [];
    const { data: signed } = await this.sb.storage.from("photos").createSignedUrls(rows.map((r) => r.storage_path), 3600);
    return rows.map((r, i) => ({ id: r.id, position: r.position, status: r.moderation_status, url: signed?.[i]?.signedUrl ?? "" }));
  }

  async uploadPhoto(file: Blob, position: number): Promise<Photo> {
    const id = await this.uid();
    const path = `${id}/${crypto.randomUUID()}.jpg`;
    const up = await this.sb.storage.from("photos").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
    fail(up.error, "Uploading photo");
    await this.sb.from("photos").delete().eq("user_id", id).eq("position", position);
    const { data, error } = await this.sb.from("photos").insert({ user_id: id, storage_path: path, position }).select("id").single();
    fail(error, "Saving photo");
    const { data: s } = await this.sb.storage.from("photos").createSignedUrl(path, 3600);
    return { id: (data as { id: string }).id, position, status: "pending", url: s?.signedUrl ?? "" };
  }

  async removePhoto(photoId: string) {
    const { error } = await this.sb.from("photos").delete().eq("id", photoId);
    fail(error, "Removing photo");
  }

  // AWS Face Liveness runs in the selfie-check Edge Function (compares with photo 1, deletes the selfie).
  async startSelfie(): Promise<SelfieResult> {
    const { data, error } = await this.sb.functions.invoke("selfie-check", { body: {} });
    if (error) return { status: "failed", message: "The check could not start. Please try again." };
    return data as SelfieResult;
  }

  async interests(): Promise<Interest[]> {
    const { data, error } = await this.sb.from("interests").select("id,slug,label").order("id");
    fail(error, "Interests");
    return (data ?? []) as Interest[];
  }

  async saveVibe(prompts: { key: string; answer: string }[], interestIds: number[]) {
    const id = await this.uid();
    const rows = prompts.filter((p) => p.answer.trim()).map((p, i) => ({ user_id: id, prompt_key: p.key, answer: p.answer.trim(), position: i + 1 }));
    const { error } = await this.sb.from("profile_prompts").upsert(rows, { onConflict: "user_id,prompt_key" });
    fail(error, "Saving answers");
    const del = await this.sb.from("profile_interests").delete().eq("user_id", id);
    fail(del.error, "Interests");
    if (interestIds.length) {
      const { error: e2 } = await this.sb.from("profile_interests").insert(interestIds.map((interest_id) => ({ user_id: id, interest_id })));
      fail(e2, "Saving interests");
    }
  }

  async uploadVoice(audio: Blob) {
    const id = await this.uid();
    const path = `${id}/intro-${Date.now()}.webm`;
    const up = await this.sb.storage.from("voice").upload(path, audio, { contentType: audio.type || "audio/webm" });
    fail(up.error, "Uploading voice intro");
    const { error } = await this.sb.from("profiles").update({ voice_intro_path: path }).eq("id", id);
    fail(error, "Saving voice intro");
  }

  async saveGoal(goal: Goal) {
    const id = await this.uid();
    const { error } = await this.sb.from("profiles").update({ goal }).eq("id", id);
    fail(error, "Saving goal");
  }

  async savePrefs(p: Prefs) {
    const id = await this.uid();
    const { error } = await this.sb.from("preferences").upsert({ user_id: id, ...p }, { onConflict: "user_id" });
    fail(error, "Saving preferences");
  }

  async setStep(step: number) {
    const id = await this.uid();
    await this.sb.from("profiles").update({ onboarding_step: step }).eq("id", id).lt("onboarding_step", step);
  }

  async refresh(): Promise<Refresh> {
    const { data, error } = await this.sb.rpc("refresh_my_profile");
    fail(error, "Updating your profile");
    return data as Refresh;
  }

  async cityQueue(): Promise<CityQueue | null> {
    const { data, error } = await this.sb.rpc("my_city_queue");
    fail(error, "City");
    return (data as CityQueue) ?? null;
  }

  async myChart(): Promise<MyChart | null> {
    const { data, error } = await this.sb.rpc("my_chart");
    fail(error, "Kundli");
    return (data as MyChart) ?? null;
  }

  async savePushToken(token: string) {
    const id = await this.uid();
    await this.sb.from("push_tokens").upsert({ user_id: id, token, platform: "web" }, { onConflict: "token" });
  }

  // ---------------------------------------------------------------- member app
  private async rpc<T>(fn: string, args: Record<string, unknown> = {}, what = "Loading"): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    fail(error, what);
    return data as T;
  }

  /** Turns storage paths into signed URLs for a batch of cards (one request). */
  private async sign<T extends { photos?: string[] }>(rows: T[]): Promise<T[]> {
    const paths = [...new Set(rows.flatMap((r) => r.photos ?? []))];
    if (!paths.length) return rows;
    const { data } = await this.sb.storage.from("photos").createSignedUrls(paths, 3600);
    const url = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
    return rows.map((r) => ({ ...r, photos: (r.photos ?? []).map((x) => url.get(x) ?? "").filter(Boolean) }));
  }

  async home(): Promise<HomeData> {
    const h = await this.rpc<HomeData>("app_home");
    return { ...h, top: await this.sign(h.top ?? []) };
  }
  async prices(): Promise<Prices> { return this.rpc<Prices>("my_prices"); }
  async unlockKick(): Promise<Kick> {
    await this.rpc("unlock_kick", {}, "Unlocking your Kick");
    return this.rpc<Kick>("get_kick");
  }
  async discover(offset = 0): Promise<Card[]> { return this.sign(await this.rpc<Card[]>("discover_cards", { p_limit: 10, p_offset: offset })); }
  async discoverCount(anyCity = false): Promise<number> { return this.rpc<number>("discover_count", { p_any_city: anyCity }); }
  async pulse(): Promise<Pulse | null> { return (await this.rpc<Pulse | null>("city_pulse")) ?? null; }
  async profile(id: string): Promise<ProfileFull> {
    const p = await this.rpc<ProfileFull & { voice_intro_path?: string | null }>("profile_view", { p_user: id }, "Profile");
    const [signed] = await this.sign([p]);
    let voice_url: string | null = null;
    if (p.voice_intro_path) voice_url = (await this.sb.storage.from("voice").createSignedUrl(p.voice_intro_path, 3600)).data?.signedUrl ?? null;
    return { ...signed, voice_url };
  }
  async like(id: string, kind: "like" | "cosmic_like" = "like", note?: string): Promise<LikeResult> {
    return this.rpc<LikeResult>("send_like", { p_target: id, p_kind: kind, p_note: note ?? null }, "Like");
  }
  async pass(id: string) { await this.rpc("pass_profile", { p_target: id }, "Pass"); }
  async likesMe(): Promise<LikeCard[]> { return this.sign(await this.rpc<LikeCard[]>("likes_me")); }
  async markLikesSeen() { await this.rpc("mark_likes_seen"); }
  async matches(): Promise<MatchRow[]> {
    const rows = await this.rpc<MatchRow[]>("my_matches");
    const signed = await this.sign(rows.map((r) => ({ ...r, photos: r.photo ? [r.photo] : [] })));
    return signed.map(({ photos, ...r }) => ({ ...r, photo: photos[0] ?? null }));
  }
  async filters(): Promise<Filters> {
    const id = await this.uid();
    const { data, error } = await this.sb.from("preferences")
      .select("age_min,age_max,distance,diets,goals,languages,height_min_cm,height_max_cm,active_this_week,has_voice_intro").eq("user_id", id).maybeSingle();
    fail(error, "Filters");
    return (data as Filters) ?? { age_min: 21, age_max: 35, distance: "same_city", diets: [], goals: ["dating", "matchmaking"], languages: [],
      height_min_cm: null, height_max_cm: null, active_this_week: true, has_voice_intro: false };
  }
  async saveFilters(f: Filters) {
    const id = await this.uid();
    const { error } = await this.sb.from("preferences").upsert({ user_id: id, ...f }, { onConflict: "user_id" });
    fail(error, "Saving filters");
  }
  async compatReport(otherId: string): Promise<Reading> {
    const id = await this.rpc<string>("request_compat_report", { p_other: otherId }, "Report");
    let r = await this.reading("compat_report", otherId);
    if (r?.status === "generating") {
      await this.sb.functions.invoke("ai-gateway", { body: { action: "reading", reading_id: id } });   // writes it, or refunds
      r = await this.reading("compat_report", otherId);
    }
    return r ?? { id, status: "generating", content: null };
  }
  async reading(kind: string, otherId?: string): Promise<Reading | null> {
    return (await this.rpc<Reading | null>("my_reading", { p_kind: kind, p_other: otherId ?? null })) ?? null;
  }
  async goldenUnlocked(matchId: string) { return this.rpc<boolean>("golden_unlocked", { p_match: matchId }); }
  async unlockGolden(matchId: string) { await this.rpc("unlock_golden_hours", { p_match: matchId }, "Golden Hours"); }

  // ---------------------------------------------------------------- chat
  private async msgs(rows: (Omit<Msg, "media_url"> & { media_path: string | null })[]): Promise<Msg[]> {
    const paths = rows.map((r) => r.media_path).filter(Boolean) as string[];
    const url = new Map<string, string>();
    if (paths.length) {
      const { data } = await this.sb.storage.from("chat").createSignedUrls(paths, 3600);
      for (const d of data ?? []) if (d.path && d.signedUrl) url.set(d.path, d.signedUrl);
    }
    return rows.map(({ media_path, ...r }) => ({ ...r, media_url: media_path ? url.get(media_path) ?? null : null }));
  }
  async chat(matchId: string): Promise<ChatData> {
    const c = await this.rpc<ChatData & { messages: never[]; other: ChatData["other"] }>("chat_open", { p_match: matchId }, "Chat");
    const [o] = await this.sign([{ ...c.other, photos: c.other.photo ? [c.other.photo] : [] }]);
    return { ...c, other: { ...c.other, photo: o.photos[0] ?? null }, messages: await this.msgs(c.messages) };
  }
  private async send(matchId: string, body: string | null, kind: "text" | "voice", media: string | null): Promise<Msg> {
    const r = await this.rpc<{ id: string; held: boolean; created_at: string }>("send_message",
      { p_match: matchId, p_body: body, p_kind: kind, p_media: media }, "Sending");
    const [m] = await this.msgs([{ id: r.id, mine: true, kind, body, media_path: media, held: r.held, read_at: null, created_at: r.created_at }]);
    return m;
  }
  async sendMessage(matchId: string, body: string) { return this.send(matchId, body, "text", null); }
  async sendVoice(matchId: string, audio: Blob) {
    const id = await this.uid();
    const path = `${id}/${matchId}/${crypto.randomUUID()}.webm`;
    const up = await this.sb.storage.from("chat").upload(path, audio, { contentType: audio.type || "audio/webm" });
    fail(up.error, "Uploading voice note");
    return this.send(matchId, null, "voice", path);
  }
  async markRead(matchId: string) { await this.rpc("mark_read", { p_match: matchId }); }
  onMessages(matchId: string, cb: (m: Msg) => void) {
    let me = "";
    this.uid().then((u) => { me = u; }).catch(() => {});
    const ch = this.sb.channel(`chat:${matchId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `match_id=eq.${matchId}` }, async (p) => {
        const r = p.new as { id: string; sender_id: string; kind: Msg["kind"]; body: string | null; media_path: string | null; held: boolean; read_at: string | null; created_at: string };
        if (r.sender_id === me) return;                                    // own messages are already on screen
        const [m] = await this.msgs([{ id: r.id, mine: false, kind: r.kind, body: r.body, media_path: r.media_path, held: r.held, read_at: r.read_at, created_at: r.created_at }]);
        cb(m);
      }).subscribe();
    return () => { this.sb.removeChannel(ch); };
  }
  private async gateway<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.functions.invoke("ai-gateway", { body });
    if (error) {
      let msg = "Something went wrong. Please try again.";
      try { const j = await (error as { context?: Response }).context?.json(); if (j?.message || j?.error) msg = j.message ?? j.error; } catch { /* keep default */ }
      throw new Error(msg);
    }
    return data as T;
  }
  async openers(matchId: string) { return (await this.gateway<{ openers: string[] }>({ action: "opener", match_id: matchId })).openers; }

  // ---------------------------------------------------------------- Guru Ji
  async guru(matchId: string) { return this.rpc<GuruState>("guru_state", { p_match: matchId }, "Guru Ji"); }
  async askGuru(matchId: string, question: string) {
    await this.rpc("ask_guru", { p_match: matchId, p_question: question }, "Guru Ji");
    await this.gateway({ action: "guru", match_id: matchId }).catch(() => {});      // a failed answer gives the question back
    return this.guru(matchId);
  }
  async buyGuru(matchId: string) { await this.rpc("buy_guru_pack", { p_match: matchId }, "Guru Ji"); return this.guru(matchId); }

  // ---------------------------------------------------------------- Saathi
  async saathi() { return this.rpc<SaathiState>("saathi_state", { p_history: 50 }, "Saathi"); }
  async saathiSetup(c: SaathiChar, styles: string[]) { await this.rpc("saathi_setup", { p_char: c, p_styles: styles }, "Saathi"); }
  async saathiSend(c: SaathiChar, text: string): Promise<SaathiReply> {
    const { data, error } = await this.sb.functions.invoke("ai-gateway", { body: { action: "saathi", character: c, message: text } });
    if (error) {
      try { const j = await (error as { context?: Response }).context?.json(); if (j) return j as SaathiReply; } catch { /* fall through */ }
      return { reply: null, message: "Saathi is offline for a moment." };
    }
    return data as SaathiReply;
  }
  async saathiTopup() { return this.rpc<number>("saathi_topup", {}, "Top-up"); }

  // ---------------------------------------------------------------- wallet and payments
  async wallet() { return this.rpc<Wallet>("wallet", {}, "Wallet"); }
  async pay(type: "pack" | "subscription", key: string, upi: UpiApp, email?: string) {
    const o = await this.gateway2<{ order_id: string; amount_paise: number; key_id: string; label: string }>("create-order", { item_type: type, item_key: key });
    await loadScript("https://checkout.razorpay.com/v1/checkout.js");
    const { data } = await this.sb.auth.getSession();
    const phone = data.session?.user.phone;
    return await new Promise<{ order_id: string; paid: boolean }>((resolve) => {
      const Rzp = (window as unknown as { Razorpay: new (o: Record<string, unknown>) => { open(): void } }).Razorpay;
      const flow = upi === "other" ? undefined : { upi: { flows: ["intent", "collect"], apps: [upi === "gpay" ? "google_pay" : upi] } };
      new Rzp({
        key: o.key_id, order_id: o.order_id, amount: o.amount_paise, currency: "INR", name: "Likha", description: o.label,
        prefill: { contact: phone ? `+${phone.replace(/^\+/, "")}` : undefined, email: email || undefined },
        config: { display: { preferences: { show_default_blocks: true }, ...(flow ? { blocks: { upi: { name: "UPI", instruments: [{ method: "upi", ...flow.upi }] } }, sequence: ["block.upi"] } : {}) } },
        theme: { color: "#FFB020" },
        handler: () => resolve({ order_id: o.order_id, paid: true }),            // the webhook credits; the status page waits for it
        modal: { ondismiss: () => resolve({ order_id: o.order_id, paid: false }) },
      }).open();
    });
  }
  private async gateway2<T>(fn: string, body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.functions.invoke(fn, { body });
    if (error) {
      let msg = "Something went wrong. Please try again.";
      try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error; } catch { /* keep default */ }
      throw new Error(msg);
    }
    return data as T;
  }
  async paymentStatus(orderId: string) { return (await this.rpc<PaymentStatus | null>("payment_status", { p_order_id: orderId })) ?? null; }

  // ---------------------------------------------------------------- store readings
  async startReading(kind: "who_suits_me" | "why_not", subject?: Record<string, unknown>) {
    const id = await this.rpc<string>("start_reading", { p_kind: kind, p_subject: subject ?? null }, "Reading");
    this.gateway({ action: "reading", reading_id: id }).catch(() => {});        // writes it, or refunds; the page polls
    return id;
  }
  async readingView(id: string) { return (await this.rpc<ReadingFull | null>("reading_view", { p_id: id })) ?? null; }
  async myReadings() { return this.rpc<ReadingItem[]>("my_readings"); }
  async setSuitsSort(on: boolean) { await this.rpc("set_suits_sort", { p_on: on }, "Discover"); }
  async buyCheckPack() { return this.rpc<number>("buy_check_pack", {}, "5-pack"); }
  async createCrushCheck(name: string, phone: string, relation: string, dob: string | null) {
    return this.rpc<{ token: string; reading_id: string; prepaid: boolean }>("create_crush_check",
      { p_name: name, p_phone: phone, p_relation: relation, p_dob: dob }, "Check With Anyone");
  }
  async myCrushChecks() { return this.rpc<{ prepaid: number; checks: CrushCheck[] }>("my_crush_checks"); }
  async sendGift(name: string, phone: string, kind: string, note: string, deliverOn: string) {
    return this.rpc<string>("send_gift", { p_name: name, p_phone: phone, p_kind: kind, p_note: note || null, p_deliver_on: deliverOn }, "Gift");
  }
  async myGifts() { return this.rpc<GiftItem[]>("my_gifts"); }
  async maasi() { const m = await this.rpc<MaasiState>("maasi_state"); return { ...m, picks: await this.sign(m.picks) }; }
  async answerMaasi(pickId: string, interested: boolean) {
    return this.rpc<LikeResult>("answer_maasi_pick", { p_pick: pickId, p_interested: interested }, "Rishta Maasi");
  }

  // ---------------------------------------------------------------- me, settings, privacy
  async myProfile(): Promise<MyProfile> {
    type Raw = Omit<MyProfile, "photos"> & { photos: { id: string; position: number; path: string; status: Photo["status"] }[] };
    const p = await this.rpc<Raw>("my_profile", {}, "Profile");
    const paths = p.photos.map((x) => x.path);
    const { data } = paths.length ? await this.sb.storage.from("photos").createSignedUrls(paths, 3600) : { data: [] };
    return { ...p, photos: p.photos.map((x, i) => ({ id: x.id, position: x.position, status: x.status, url: data?.[i]?.signedUrl ?? "" })) };
  }
  async saveProfile(patch: ProfilePatch) {
    const id = await this.uid();
    const { error } = await this.sb.from("profiles").update(patch).eq("id", id);
    fail(error, "Saving");
  }
  async notifPrefs() {
    const id = await this.uid();
    const { data, error } = await this.sb.from("notification_prefs").select("kick_time,new_likes,matches,golden_hours,offers,quiet_start,quiet_end").eq("user_id", id).single();
    fail(error, "Notifications");
    const t = (x: string) => x.slice(0, 5);
    const d = data as NotifPrefs;
    return { ...d, kick_time: t(d.kick_time), quiet_start: t(d.quiet_start), quiet_end: t(d.quiet_end) };
  }
  async saveNotifPrefs(p: NotifPrefs) {
    const id = await this.uid();
    const { error } = await this.sb.from("notification_prefs").update(p).eq("user_id", id);
    fail(error, "Notifications");
  }
  async trustedContacts() {
    const { data, error } = await this.sb.from("trusted_contacts").select("id,name,phone,relation").order("created_at");
    fail(error, "Trusted contacts");
    return (data ?? []) as TrustedContact[];
  }
  async addTrustedContact(name: string, phone: string, relation: string) {
    if (!/^(\+?91)?0?[6-9]\d{9}$/.test(phone.replace(/[\s-]/g, ""))) throw new Error("Enter a valid Indian mobile number.");
    const id = await this.uid();
    const { data, error } = await this.sb.from("trusted_contacts").insert({ user_id: id, name: name.trim(), phone: phone.trim(), relation: relation || null })
      .select("id,name,phone,relation").single();
    fail(error, "Trusted contacts");
    return data as TrustedContact;
  }
  async removeTrustedContact(cid: string) { const { error } = await this.sb.from("trusted_contacts").delete().eq("id", cid); fail(error, "Trusted contacts"); }
  async blocks() { return this.rpc<{ id: string; first_name: string; since: string }[]>("my_blocks"); }
  async unblock(uid: string) {
    const me = await this.uid();
    const { error } = await this.sb.from("blocks").delete().eq("blocker", me).eq("blocked", uid);
    fail(error, "Unblock");
  }
  async block(uid: string) { await this.rpc("block_user", { p_target: uid }, "Block"); }
  async unmatch(matchId: string) { await this.rpc("unmatch", { p_match: matchId }, "Unmatch"); }
  async report(uid: string, reason: ReportReason, details: string, alsoBlock: boolean) {
    if (alsoBlock) await this.rpc("block_user", { p_target: uid, p_report_reason: reason, p_details: details || null }, "Report");
    else await this.rpc("report_user", { p_target: uid, p_reason: reason, p_details: details || null }, "Report");
  }
  async sendDeleteOtp() {
    const { data } = await this.sb.auth.getSession();
    const phone = data.session?.user.phone;
    if (!phone) throw new Error("Please sign in again.");
    await this.sendOtp(`+${phone.replace(/^\+/, "")}`, "sms");
  }
  async deleteAccount(code: string, reason: string) {
    const { data } = await this.sb.auth.getSession();
    const phone = data.session?.user.phone;
    if (!phone) throw new Error("Please sign in again.");
    await this.verifyOtp(`+${phone.replace(/^\+/, "")}`, code);                 // fresh sign-in: the database checks it was in the last 10 minutes
    const r = await this.rpc<{ credits_lost: number }>("delete_my_account", { p_reason: reason }, "Delete");
    await this.sb.auth.signOut();
    return r;
  }

  // ---------------------------------------------------------------- safety
  async shareDate(matchId: string | null, place: string, startsAt: Date, checkinAt: Date, contactIds: string[]) {
    return this.rpc<string>("share_date", { p_match: matchId, p_place: place, p_starts_at: startsAt.toISOString(), p_checkin_at: checkinAt.toISOString(), p_contacts: contactIds }, "Share my date");
  }
  async dateShare(sid: string) { return (await this.rpc<DateShare | null>("date_share_view", { p_id: sid })) ?? null; }
  async checkin(sid: string, answer: "ok" | "later" | "help") { return this.rpc<DateShare>("date_checkin", { p_id: sid, p_answer: answer }, "Check-in"); }
  async sosStart(matchId: string | null, lat: number | null, lng: number | null, flag: boolean) {
    return this.rpc<{ id: string; token: string; share_until: string }>("sos_start", { p_match: matchId, p_lat: lat, p_lng: lng, p_flag: flag }, "SOS");
  }
  async sosUpdate(sid: string, lat: number, lng: number) { await this.rpc("sos_update", { p_id: sid, p_lat: lat, p_lng: lng }); }
  async sosStop(sid: string) { await this.rpc("sos_stop", { p_id: sid }); }
  async sosView(token: string) { return (await this.rpc<Awaited<ReturnType<Api["sosView"]>>>("sos_view", { p_token: token })) ?? null; }

  // ---------------------------------------------------------------- inbox, history, help, account
  async notices() { return this.rpc<Notice[]>("my_notifications", { p_limit: 80 }); }
  async markAllRead() { await this.rpc("mark_notifications_read"); }
  async history() { return this.rpc<History>("my_history", { p_limit: 60 }); }
  async invoice(pid: string) { return (await this.rpc<Invoice | null>("my_invoice", { p_payment: pid })) ?? null; }
  async openTicket(subject: string, body: string) { return this.rpc<string>("open_ticket", { p_subject: subject, p_body: body }, "Help"); }
  async tickets() { return this.rpc<Ticket[]>("my_tickets"); }
  async replyTicket(tid: string, body: string) { await this.rpc("reply_ticket", { p_ticket: tid, p_body: body }, "Help"); }
  async fileGrievance(category: string, description: string, file?: Blob | null) {
    const files: string[] = [];
    if (file) {
      const id = await this.uid();
      const path = `${id}/grievance-${crypto.randomUUID()}.${file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg"}`;
      const up = await this.sb.storage.from("support").upload(path, file, { contentType: file.type || "image/jpeg" });
      fail(up.error, "Uploading screenshot");
      files.push(path);
    }
    return this.rpc<{ ticket_no: string; resolve_due_at: string }>("file_grievance", { p_category: category, p_description: description, p_attachments: files }, "Grievance");
  }
  async accountState() { return this.rpc<AccountState>("account_state"); }
  async appeal(actionId: string, text: string) { await this.rpc("file_appeal", { p_action: actionId, p_text: text }, "Appeal"); }
  async toolkit() { return this.rpc<Toolkit>("my_toolkit"); }
  async tried(feature: string) { return this.rpc<boolean>("mark_feature_tried", { p_feature: feature }); }
}

function loadScript(src: string): Promise<void> {
  return new Promise((ok, bad) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement("script"); s.src = src; s.onload = () => ok(); s.onerror = () => bad(new Error("Payments couldn't load. Check your connection."));
    document.head.appendChild(s);
  });
}
