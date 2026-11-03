// Social media, end to end. Plans each week, draws the cards, and posts what the team approved in Admin > Social.
//   {action:"plan", week?, force?}  internal secret (cron, Sundays at the time in settings) or a team member with social.manage
//   {action:"render", id}           team: redraw one post's card after an edit
//   {action:"publish"}              internal secret (cron, every 10 minutes): approved posts whose time has come
//   {action:"card", id, token}      the app's /social-card route: one card's data, only with that post's token
// Facts are computed here (panchang, rashi pairs, kootas, real features); the writer model only words them, under the
// same checks as readings; images go through the kundli service's media endpoints (PNG -> JPEG, PNG -> short video).
import { key, loadKeys, mustKey } from "../_shared/keys.ts";
import { admin, asUser, isInternal, json, preflight, rpc } from "../_shared/db.ts";
import { callLLM } from "../_shared/llm.ts";
import { estimateTokens } from "../_shared/core.ts";
import {
  type Bank, type Captions, type City, type Kind, type Planned, type Settings, KIND_BY_DAY, checkWritten, factsFor, finishCaptions,
  parsePosts, platformsFor, templateCaptions, weekIndex, weekSlots, writerPrompt,
} from "../_shared/social.ts";
import { facebook, instagram, linkedin, x, youtube, type Result } from "../_shared/social_publish.ts";

const SITE = () => (Deno.env.get("LIKHA_SITE") ?? "https://likha.in").replace(/\/$/, "");
const PUBLIC = () => (Deno.env.get("SUPABASE_PUBLIC_URL") ?? Deno.env.get("SUPABASE_URL")!).replace(/\/$/, "");

// ---------------------------------------------------------------- media
async function media(path: "jpeg" | "short", png: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const r = await fetch(`${mustKey("KUNDLI_URL").replace(/\/$/, "")}/v1/media/${path}${path === "short" ? "?seconds=10" : ""}`, {
    method: "POST", headers: { "x-likha-key": mustKey("KUNDLI_KEY"), "content-type": "image/png" }, body: png, signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`media ${path} ${r.status}: ${(await r.text()).slice(0, 120)}`);
  return new Uint8Array(await r.arrayBuffer());
}
async function cardPng(id: string, token: string, f: "post" | "tall"): Promise<Uint8Array<ArrayBuffer>> {
  const r = await fetch(`${SITE()}/social-card/${id}?t=${token}&f=${f}`, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok || !(r.headers.get("content-type") ?? "").includes("image/png")) throw new Error(`card ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}
async function upload(path: string, bytes: Uint8Array<ArrayBuffer>, type: string): Promise<string> {
  const { error } = await admin.storage.from("social").upload(path, bytes, { contentType: type, upsert: true, cacheControl: "31536000" });
  if (error) throw new Error(`upload: ${error.message}`);
  return `${PUBLIC()}/storage/v1/object/public/social/${path}`;
}
/** Draws the card (and the video when asked) and stores them in the public social bucket. */
async function render(p: { id: string; card_token: string; video: boolean }, withVideo: boolean) {
  const stamp = Date.now().toString(36);
  const assets: Record<string, string> = {};
  assets.image = await upload(`${p.id}/${p.card_token}-${stamp}.jpg`, await media("jpeg", await cardPng(p.id, p.card_token, "post")), "image/jpeg");
  if (withVideo && p.video) {
    const tall = await cardPng(p.id, p.card_token, "tall");
    assets.tall = await upload(`${p.id}/${p.card_token}-${stamp}-tall.png`, tall, "image/png");
    assets.video = await upload(`${p.id}/${p.card_token}-${stamp}.mp4`, await media("short", tall), "video/mp4");
  }
  await rpc("svc_social_assets", { p_id: p.id, p_assets: assets });
  return assets;
}

// ---------------------------------------------------------------- plan
async function writeWords(briefs: { i: number; kind: Kind; facts: unknown; card: any }[]): Promise<{ writer: string; posts: any[]; note?: string }> {
  const { system, user } = writerPrompt(briefs);
  const hold = await rpc<any>("svc_ai_reserve", { p_user: null, p_feature: "social", p_est_input_tokens: estimateTokens(system, user) }).catch(() => null);
  if (!hold?.ok) return { writer: "template", posts: [], note: hold?.reason ?? "writer off" };
  try {
    const out = await callLLM(hold.provider, { model: hold.model, system, messages: [{ role: "user", content: user }],
      maxTokens: Math.max(hold.max_output_tokens ?? 0, 4000), temperature: hold.temperature ?? 0.8 }, 90_000);
    const posts = parsePosts(out.text);
    await rpc("svc_ai_finish", { p_call: hold.call_id, p_in: out.inputTokens, p_out: out.outputTokens, p_cache: out.cacheReadTokens,
      p_status: posts.length ? "ok" : "failed", p_number_check: null, p_latency_ms: out.latencyMs, p_error: posts.length ? null : "no posts in reply" });
    return { writer: hold.model, posts };
  } catch (e) {
    await rpc("svc_ai_finish", { p_call: hold.call_id, p_in: 0, p_out: 0, p_cache: 0, p_status: "failed", p_error: String((e as Error).message) }).catch(() => {});
    return { writer: "template", posts: [], note: (e as Error).message };
  }
}

async function plan(weekOf: string, s: Settings & { city?: string }) {
  const site = SITE();
  const bank = await (await fetch(`${site}/social/bank.json`, { signal: AbortSignal.timeout(30_000) })).json() as Bank;
  const { data: city } = await admin.from("cities").select("name,lat,lng,timezone").eq("slug", s.city ?? "jaipur").single();
  if (!city) throw new Error(`city ${s.city} not found`);
  const w = weekIndex(weekOf);
  const slots = weekSlots(weekOf, s.post_time_ist ?? "19:30");
  const briefs = slots.map((slot, i) => ({ i, kind: KIND_BY_DAY[i], ...factsFor(KIND_BY_DAY[i], slot.date, w, bank, city as City) }));
  const written = await writeWords(briefs.map(({ i, kind, facts, card }) => ({ i, kind, facts, card })));
  const posts: Planned[] = briefs.map((b) => {
    const slot = slots[b.i];
    const m = written.posts.find((p) => Number(p?.i) === b.i);
    const problems = m ? checkWritten(m, b.facts, b.card) : [];
    const useModel = m && problems.length === 0;
    const base: Captions = useModel
      ? { instagram: m.instagram, facebook: m.facebook, linkedin: m.linkedin, x: m.x, youtube_title: m.youtube_title, youtube_description: m.youtube_description }
      : templateCaptions(b.kind, b.facts, b.card, site);
    const card = useModel ? { ...b.card, headline: m.headline || b.card.headline, sub: m.sub || b.card.sub } : b.card;
    const { platforms, video } = platformsFor(b.kind, s);
    return { post_date: slot.date, scheduled_at: slot.at, kind: b.kind, facts: b.facts as Record<string, unknown>, card,
      captions: finishCaptions(base, s, site, (b.facts as any).url), platforms, video,
      writer: useModel ? written.writer : m ? `template (model words failed: ${problems.slice(0, 2).join("; ")})` : `template${written.note ? ` (${written.note})` : ""}`,
      problems: [] };
  });
  const saved = await rpc<number>("svc_social_save_plan", { p_week: weekOf, p_posts: posts });
  // Previews for Admin: the post card for every new draft (videos are made at posting time).
  const { data: drafts } = await admin.from("social_posts").select("id,card_token,video").eq("week_of", weekOf).eq("status", "draft");
  const failed: string[] = [];
  for (const d of drafts ?? []) await render(d, false).catch((e) => failed.push((e as Error).message));
  return { week_of: weekOf, saved, writer: written.writer, previews_failed: failed.slice(0, 3) };
}

// ---------------------------------------------------------------- publish
async function bytes(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`asset ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function postTo(platform: string, p: any, s: any): Promise<Result> {
  const v = s.graph_version ?? "v23.0";
  const has = (...names: string[]) => names.every((n) => !!key(n));
  switch (platform) {
    case "instagram":
      if (!has("META_PAGE_TOKEN", "META_IG_USER_ID")) return { ok: false, error: "Instagram is not connected (Admin > Keys > Social)" };
      return instagram(fetch, { token: key("META_PAGE_TOKEN")!, igUser: key("META_IG_USER_ID")!, version: v }, p);
    case "facebook":
      if (!has("META_PAGE_TOKEN", "META_PAGE_ID")) return { ok: false, error: "Facebook is not connected (Admin > Keys > Social)" };
      return facebook(fetch, { token: key("META_PAGE_TOKEN")!, page: key("META_PAGE_ID")!, version: v }, p);
    case "linkedin":
      if (!has("LINKEDIN_TOKEN", "LINKEDIN_AUTHOR_URN")) return { ok: false, error: "LinkedIn is not connected (Admin > Keys > Social)" };
      return linkedin(fetch, { token: key("LINKEDIN_TOKEN")!, author: key("LINKEDIN_AUTHOR_URN")!, version: s.linkedin_version ?? "202510" }, p, await bytes(p.assets.image));
    case "x":
      if (!has("X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET")) return { ok: false, error: "X is not connected (Admin > Keys > Social)" };
      return x(fetch, { key: key("X_API_KEY")!, secret: key("X_API_SECRET")!, token: key("X_ACCESS_TOKEN")!, tokenSecret: key("X_ACCESS_SECRET")! }, p, await bytes(p.assets.image));
    case "youtube":
      if (!p.assets.video) return { ok: false, error: "no video for this post" };
      if (!has("YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN")) return { ok: false, error: "YouTube is not connected (Admin > Keys > Social)" };
      return youtube(fetch, { clientId: key("YOUTUBE_CLIENT_ID")!, clientSecret: key("YOUTUBE_CLIENT_SECRET")!, refresh: key("YOUTUBE_REFRESH_TOKEN")!,
        privacy: s.youtube_privacy ?? "private" }, p, await bytes(p.assets.video));
    default:
      return { ok: false, error: `unknown platform ${platform}` };
  }
}

async function publish() {
  const due = await rpc<any[]>("svc_social_due", { p_limit: 3 });
  const s = (await admin.from("app_settings").select("value").eq("key", "social").single()).data?.value ?? {};
  const out: Record<string, string> = {};
  for (const p of due) {
    try {
      if (!p.assets?.image || (p.video && !p.assets?.video)) p.assets = { ...p.assets, ...(await render(p, true)) };
    } catch (e) {
      for (const pl of p.platforms) if (!p.results?.[pl]?.ok) await rpc("svc_social_result", { p_id: p.id, p_platform: pl, p_result: { ok: false, error: `card: ${(e as Error).message}` } });
      out[p.id] = "failed"; continue;
    }
    let status = "posting";
    for (const pl of p.platforms as string[]) {
      const prev = p.results?.[pl];
      if (prev?.ok || (prev && !prev.pending)) continue;          // done, or failed once: never post twice
      const r = await postTo(pl, p, s).catch((e) => ({ ok: false, error: String((e as Error).message).slice(0, 300) }) as Result);
      status = await rpc<string>("svc_social_result", { p_id: p.id, p_platform: pl, p_result: r });
    }
    out[p.id] = status;
  }
  return { posted: out };
}

// ---------------------------------------------------------------- router
Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "card") {                                    // public, but only with the post's own token
      if (!/^[0-9a-f-]{36}$/.test(body.id ?? "") || !/^[0-9a-f]{32}$/.test(body.token ?? "")) return json({ error: "not found" }, 404);
      const c = await rpc<any>("svc_social_card", { p_id: body.id, p_token: body.token });
      return c ? json(c) : json({ error: "not found" }, 404);
    }
    await loadKeys();
    const internal = isInternal(req);
    if (!internal) {
      const u = await asUser(req);
      const { data: can } = u ? await u.client.rpc("admin_social_can") : { data: false };
      if (!can) return json({ error: "not allowed" }, 403);
      if (body.action === "publish") return json({ error: "publishing runs on its own schedule" }, 403);
    }
    if (body.action === "plan") {
      const due = await rpc<any>("svc_social_plan_due", { p_force: !!body.force || !internal });
      if (!due.due) return json({ skipped: due.reason });
      const week = typeof body.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.week) ? body.week : due.week_of;
      return json(await plan(week, due.settings ?? {}));
    }
    if (body.action === "render") {
      const p = await rpc<any>("svc_social_post", { p_id: body.id });
      if (!p) return json({ error: "not found" }, 404);
      return json(await render(p, false));
    }
    if (body.action === "publish") return json(await publish());
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message).slice(0, 200) }, 500);
  }
});
