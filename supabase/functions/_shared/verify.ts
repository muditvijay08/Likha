// Calls to the selfie and photo check services set in Admin > Settings > Verification.
// The contract is ours, so any provider (or a small adapter in front of AWS / Sightengine) can plug in:
//   Selfie  POST {user_id, selfie_jpeg_base64, profile_photo_url}  ->  {"score": 0..1, "live": true|false}
//   Photo   POST {photo_id, user_id, image_url, position}           ->  {"approved": true|false, "reason"?: string, "labels"?: object}
// Sent with "Authorization: Bearer <key>" (SELFIE_API_KEY / PHOTO_API_KEY from Admin > Keys). 20-second limit.

export type SelfieReply = { score: number; live: boolean };
export type PhotoReply = { approved: boolean; reason: string | null; labels: Record<string, unknown> };

export function parseSelfieReply(v: unknown): SelfieReply {
  const o = v as Record<string, unknown> | null;
  const score = Number(o?.score), live = o?.live;
  if (!o || !Number.isFinite(score) || score < 0 || score > 1 || typeof live !== "boolean") throw new Error('expected {"score": 0..1, "live": true|false}');
  return { score, live };
}

export function parsePhotoReply(v: unknown): PhotoReply {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o.approved !== "boolean") throw new Error('expected {"approved": true|false}');
  return { approved: o.approved, reason: typeof o.reason === "string" ? o.reason.slice(0, 200) : null,
           labels: o.labels && typeof o.labels === "object" ? o.labels as Record<string, unknown> : {} };
}

/** A selfie from the app: a JPEG data URL under 2.5 MB. Returns the bytes. */
export function selfieBytes(dataUrl: unknown): Uint8Array {
  const m = typeof dataUrl === "string" ? /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl) : null;
  if (!m) throw new Error("no selfie picture");
  const bin = atob(m[1]);
  if (bin.length < 2000 || bin.length > 2_500_000) throw new Error("selfie picture size looks wrong");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  if (out[0] !== 0xff || out[1] !== 0xd8) throw new Error("not a JPEG");
  return out;
}

/** Only public https hosts: no IP addresses, localhost or internal names (stops the address being pointed at our own servers). */
export function safeApiUrl(url: string): boolean {
  let u: URL; try { u = new URL(url); } catch { return false; }
  const h = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || u.username || u.password) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":") || h.startsWith("[")) return false;             // IPv4 / IPv6 literals
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local") || !h.includes(".")) return false;
  return true;
}

export async function callVerify(url: string, key: string, body: unknown, timeoutMs = 20_000, f: typeof fetch = fetch): Promise<{ status: number; json: unknown; ms: number }> {
  if (!/^https:\/\//.test(url)) throw new Error("API address must start with https://");
  if (!safeApiUrl(url)) throw new Error("API address must be a public https name (no IP addresses or internal hosts)");
  const ctl = new AbortController(), t0 = Date.now();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await f(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: ctl.signal });
    const text = await r.text();
    let json: unknown = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    if (!r.ok) throw new Error(`API answered ${r.status}`);
    if (json === null) throw new Error("API did not answer with JSON");
    return { status: r.status, json, ms: Date.now() - t0 };
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error(`API took longer than ${timeoutMs / 1000} seconds`);
    throw e;
  } finally { clearTimeout(timer); }
}
