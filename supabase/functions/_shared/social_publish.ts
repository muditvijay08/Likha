// Posting to each platform with its official API. Every function returns a result for svc_social_result:
//   { ok: true, id, url }                 posted
//   { ok: false, pending: {...} }          the platform is still processing a video; try again on the next run
//   { ok: false, error }                   failed (shown in Admin > Social)
// Keys come from Admin > Keys (Vault). Nothing here is called for a post the team hasn't approved.
export type Result = { ok: boolean; id?: string; url?: string; error?: string; pending?: Record<string, unknown> };
export interface Assets { image?: string; tall?: string; video?: string }
export interface PostIn { captions: Record<string, string>; assets: Assets; results: Record<string, any>; video: boolean }
type Fetch = typeof fetch;

const short = (s: string) => s.replace(/\s+/g, " ").slice(0, 300);
async function call(f: Fetch, url: string, init: RequestInit): Promise<{ status: number; body: any; headers: Headers }> {
  const r = await f(url, { ...init, signal: AbortSignal.timeout(60_000) });
  const text = await r.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body, headers: r.headers };
}
const err = (who: string, r: { status: number; body: any }): Result =>
  ({ ok: false, error: `${who} ${r.status}: ${short(typeof r.body === "string" ? r.body : r.body?.error?.message ?? r.body?.detail ?? r.body?.message ?? JSON.stringify(r.body))}` });

// ---------------------------------------------------------------- Meta: Instagram and Facebook Page
export async function instagram(f: Fetch, k: { token: string; igUser: string; version: string }, p: PostIn): Promise<Result> {
  const g = `https://graph.facebook.com/${k.version}`;
  const pending = p.results.instagram?.pending as { container?: string } | undefined;
  let container = pending?.container;
  if (!container) {
    const body: Record<string, string> = p.video && p.assets.video
      ? { media_type: "REELS", video_url: p.assets.video, caption: p.captions.instagram, share_to_feed: "true" }
      : p.assets.image ? { image_url: p.assets.image, caption: p.captions.instagram } : {};
    if (!body.video_url && !body.image_url) return { ok: false, error: "no image to post" };
    const c = await call(f, `${g}/${k.igUser}/media`, { method: "POST", body: new URLSearchParams({ ...body, access_token: k.token }) });
    if (c.status !== 200 || !c.body?.id) return err("Instagram", c);
    container = c.body.id;
  }
  // Videos take a while: check, and come back next run until it's ready.
  const st = await call(f, `${g}/${container}?fields=status_code&access_token=${encodeURIComponent(k.token)}`, { method: "GET" });
  const code = st.body?.status_code;
  if (code === "ERROR" || code === "EXPIRED") return { ok: false, error: `Instagram could not process the media (${code})` };
  if (code && code !== "FINISHED") return { ok: false, pending: { container } };
  const pub = await call(f, `${g}/${k.igUser}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: container!, access_token: k.token }) });
  if (pub.status !== 200 || !pub.body?.id) return err("Instagram", pub);
  const link = await call(f, `${g}/${pub.body.id}?fields=permalink&access_token=${encodeURIComponent(k.token)}`, { method: "GET" }).catch(() => null);
  return { ok: true, id: pub.body.id, url: link?.body?.permalink };
}

export async function facebook(f: Fetch, k: { token: string; page: string; version: string }, p: PostIn): Promise<Result> {
  const g = `https://graph.facebook.com/${k.version}`;
  const r = p.video && p.assets.video
    ? await call(f, `${g}/${k.page}/videos`, { method: "POST", body: new URLSearchParams({ file_url: p.assets.video, description: p.captions.facebook, access_token: k.token }) })
    : await call(f, `${g}/${k.page}/photos`, { method: "POST", body: new URLSearchParams({ url: p.assets.image ?? "", caption: p.captions.facebook, access_token: k.token }) });
  if (r.status !== 200 || !r.body?.id) return err("Facebook", r);
  const id = r.body.post_id ?? r.body.id;
  return { ok: true, id, url: `https://www.facebook.com/${id}` };
}

// ---------------------------------------------------------------- LinkedIn (company page or the founder)
export async function linkedin(f: Fetch, k: { token: string; author: string; version: string }, p: PostIn, image: Uint8Array<ArrayBuffer>): Promise<Result> {
  const h = { authorization: `Bearer ${k.token}`, "LinkedIn-Version": k.version, "X-Restli-Protocol-Version": "2.0.0", "content-type": "application/json" };
  const init = await call(f, "https://api.linkedin.com/rest/images?action=initializeUpload", { method: "POST", headers: h,
    body: JSON.stringify({ initializeUploadRequest: { owner: k.author } }) });
  const up = init.body?.value;
  if (init.status !== 200 || !up?.uploadUrl) return err("LinkedIn", init);
  const put = await f(up.uploadUrl, { method: "PUT", headers: { authorization: `Bearer ${k.token}` }, body: image, signal: AbortSignal.timeout(60_000) });
  if (put.status >= 300) return { ok: false, error: `LinkedIn upload ${put.status}` };
  const post = await call(f, "https://api.linkedin.com/rest/posts", { method: "POST", headers: h, body: JSON.stringify({
    author: k.author, commentary: p.captions.linkedin.replace(/([()[\]{}@#*_~<>|\\])/g, "\\$1").replace(/\\#(\w)/g, "#$1"),
    visibility: "PUBLIC", lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false,
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    content: { media: { id: up.image, altText: "A Likha card" } } }) });
  if (post.status !== 201 && post.status !== 200) return err("LinkedIn", post);
  const id = post.headers.get("x-restli-id") ?? post.headers.get("x-linkedin-id") ?? "";
  return { ok: true, id, url: id ? `https://www.linkedin.com/feed/update/${id}` : undefined };
}

// ---------------------------------------------------------------- X (OAuth 1.0a user context)
const pct = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
export async function oauth1(method: string, url: string, k: { key: string; secret: string; token: string; tokenSecret: string },
  extra: Record<string, string> = {}, nonce = crypto.randomUUID().replace(/-/g, ""), ts = Math.floor(Date.now() / 1000).toString()): Promise<string> {
  const o: Record<string, string> = { oauth_consumer_key: k.key, oauth_nonce: nonce, oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: ts, oauth_token: k.token, oauth_version: "1.0" };
  const all = { ...extra, ...o };
  const base = [method.toUpperCase(), pct(url.split("?")[0]),
    pct(Object.keys(all).sort().map((n) => `${pct(n)}=${pct(all[n])}`).join("&"))].join("&");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`${pct(k.secret)}&${pct(k.tokenSecret)}`), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(base)))));
  return "OAuth " + Object.entries({ ...o, oauth_signature: sig }).map(([n, v]) => `${pct(n)}="${pct(v)}"`).join(", ");
}

export async function x(f: Fetch, k: { key: string; secret: string; token: string; tokenSecret: string }, p: PostIn, image: Uint8Array<ArrayBuffer>): Promise<Result> {
  const upUrl = "https://api.x.com/2/media/upload";
  const form = new FormData();
  form.append("media", new Blob([image], { type: "image/jpeg" }), "card.jpg");
  form.append("media_category", "tweet_image");
  const up = await call(f, upUrl, { method: "POST", headers: { authorization: await oauth1("POST", upUrl, k) }, body: form });
  const mediaId = up.body?.data?.id ?? up.body?.media_id_string;
  if (up.status >= 300 || !mediaId) return err("X upload", up);
  const tUrl = "https://api.x.com/2/tweets";
  const t = await call(f, tUrl, { method: "POST", headers: { authorization: await oauth1("POST", tUrl, k), "content-type": "application/json" },
    body: JSON.stringify({ text: p.captions.x, media: { media_ids: [String(mediaId)] } }) });
  if (t.status !== 201 || !t.body?.data?.id) return err("X", t);
  return { ok: true, id: t.body.data.id, url: `https://x.com/i/web/status/${t.body.data.id}` };
}

// ---------------------------------------------------------------- YouTube Shorts
export async function youtubeToken(f: Fetch, k: { clientId: string; clientSecret: string; refresh: string }): Promise<string | null> {
  const r = await call(f, "https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({
    client_id: k.clientId, client_secret: k.clientSecret, refresh_token: k.refresh, grant_type: "refresh_token" }) });
  return r.status === 200 ? r.body?.access_token ?? null : null;
}

export async function youtube(f: Fetch, k: { clientId: string; clientSecret: string; refresh: string; privacy: string }, p: PostIn, video: Uint8Array<ArrayBuffer>): Promise<Result> {
  const token = await youtubeToken(f, k);
  if (!token) return { ok: false, error: "YouTube refused the refresh token (renew it in Admin > Keys)" };
  const start = await f("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST", signal: AbortSignal.timeout(60_000),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(video.byteLength) },
    body: JSON.stringify({ snippet: { title: p.captions.youtube_title, description: p.captions.youtube_description, categoryId: "22", defaultLanguage: "hi" },
      status: { privacyStatus: ["public", "unlisted", "private"].includes(k.privacy) ? k.privacy : "private", selfDeclaredMadeForKids: false } }),
  });
  const loc = start.headers.get("location");
  if (start.status !== 200 || !loc) return { ok: false, error: `YouTube ${start.status}: ${short(await start.text())}` };
  const up = await call(f, loc, { method: "PUT", headers: { "content-type": "video/mp4" }, body: video });
  if ((up.status !== 200 && up.status !== 201) || !up.body?.id) return err("YouTube upload", up);
  return { ok: true, id: up.body.id, url: `https://www.youtube.com/shorts/${up.body.id}` };
}
