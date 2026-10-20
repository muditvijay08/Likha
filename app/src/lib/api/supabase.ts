import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Api, Basics, Birth, City, CityQueue, Gender, Goal, Interest, Lifestyle, MyChart, OnboardingState, Photo, Place, Prefs,
  PublicSettings, Refresh, SelfieResult,
} from "./types";

function fail(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`);
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
}
