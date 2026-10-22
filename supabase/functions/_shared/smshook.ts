// Supabase "Send SMS" auth hook: Supabase hands us the login code, we send it through MSG91 (India, DLT template).
// Requests are signed the Standard Webhooks way: HMAC-SHA256 over "<id>.<timestamp>.<body>" with the hook secret.

const enc = new TextEncoder();

function b64decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s); const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64encode(b: Uint8Array): string { let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s); }
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** secret as Supabase shows it: "v1,whsec_<base64>". Returns false for a bad, missing or older-than-5-minutes signature. */
export async function verifyHook(secret: string, headers: Headers, body: string, nowMs = Date.now()): Promise<boolean> {
  const id = headers.get("webhook-id"), ts = headers.get("webhook-timestamp"), sigs = headers.get("webhook-signature");
  if (!secret || !id || !ts || !sigs) return false;
  if (!/^\d+$/.test(ts) || Math.abs(nowMs / 1000 - Number(ts)) > 300) return false;
  const raw = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  let keyBytes: Uint8Array<ArrayBuffer>; try { keyBytes = b64decode(raw); } catch { return false; }
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = b64encode(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${id}.${ts}.${body}`))));
  return sigs.split(" ").some((s) => same(s.replace(/^v1,/, ""), want));
}

/** For tests and local tools: sign like Supabase does. */
export async function signHook(secret: string, id: string, ts: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", b64decode(secret.replace(/^v1,/, "").replace(/^whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `v1,${b64encode(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${id}.${ts}.${body}`))))}`;
}

/** The MSG91 Flow request for one login code. */
export function otpRequest(templateId: string, mobile: string, otp: string) {
  return { template_id: templateId, short_url: "0", recipients: [{ mobiles: mobile, otp }] };
}
