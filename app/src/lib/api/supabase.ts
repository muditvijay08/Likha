import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
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
}
