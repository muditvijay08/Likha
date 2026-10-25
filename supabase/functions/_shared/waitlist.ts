// Website waitlist: checks what the form sent, Cloudflare Turnstile, and the "your city is open" SMS.
import { indianMobile } from "./sms.ts";

export interface Join { first_name: string; phone: string; city: string; gender: "woman" | "man" | "other"; invite: string | null; token: string | null }
export type Parsed = { ok: true; value: Join } | { ok: false; error: string };

export const MESSAGES: Record<string, string> = {
  name: "Enter your first name (letters only).",
  phone: "Enter a valid mobile number.",
  city: "Pick a city from the list.",
  gender: "Pick one option for “I am”.",
  consent: "Tick the box to confirm you're 18+ and agree to the Terms and Privacy Policy.",
  captcha: "Please complete the quick check above the button.",
  too_many: "Too many tries from this network. Please try again in an hour.",
  bad: "Something in the form didn't look right. Please check and try again.",
};

/** "+91 98290 12345", "09829012345", "9829012345" -> "+919829012345"; UAE "+971 50 123 4567" -> "+971501234567". */
export function normalisePhone(raw: string): string | null {
  const s = raw.trim();
  const d = s.replace(/\D/g, "");
  const india = indianMobile(s.startsWith("+") && !s.startsWith("+91") ? "x" : s);
  if (india) return `+${india}`;
  if (s.startsWith("+971") || d.startsWith("971")) {
    const local = d.replace(/^971/, "").replace(/^0/, "");
    return /^5\d{8}$/.test(local) ? `+971${local}` : null;
  }
  return null;
}

export function parseJoin(b: unknown): Parsed {
  if (!b || typeof b !== "object") return { ok: false, error: "bad" };
  const o = b as Record<string, unknown>;
  const name = typeof o.first_name === "string" ? o.first_name.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 40 || /[<>{}\\/@0-9]/.test(name)) return { ok: false, error: "name" };
  const phone = typeof o.phone === "string" ? normalisePhone(o.phone) : null;
  if (!phone) return { ok: false, error: "phone" };
  const city = typeof o.city === "string" ? o.city : "";
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(city)) return { ok: false, error: "city" };
  if (o.gender !== "woman" && o.gender !== "man" && o.gender !== "other") return { ok: false, error: "gender" };
  if (o.consent !== true) return { ok: false, error: "consent" };
  const invite = typeof o.invite === "string" && /^[a-f0-9]{8}$/.test(o.invite.trim().toLowerCase()) ? o.invite.trim().toLowerCase() : null;
  const token = typeof o.token === "string" && o.token.length > 0 && o.token.length < 4096 ? o.token : null;
  return { ok: true, value: { first_name: name, phone, city, gender: o.gender, invite, token } };
}

/** Cloudflare Turnstile server check. Any doubt (network, timeout, odd reply) counts as a fail. */
export async function verifyTurnstile(secret: string, token: string | null, ip: string | null, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!token) return false;
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip) form.set("remoteip", ip);
    const r = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form, signal: AbortSignal.timeout(8_000) });
    const j = await r.json().catch(() => null) as { success?: boolean } | null;
    return r.ok && j?.success === true;
  } catch { return false; }
}

export async function hashIp(ip: string, salt: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}waitlist:${ip}`));
  return Array.from(new Uint8Array(d)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "0";
}

export interface DueSms { id: string; first_name: string; phone: string; city: string; invite_code: string }

/** MSG91 Flow body for the "your city is open" SMS, or null for numbers SMS can't reach (outside India). */
export function cityOpenRequest(d: DueSms, template: string, site: string): Record<string, unknown> | null {
  const mobile = indianMobile(d.phone);
  if (!mobile) return null;
  return { template_id: template, short_url: "0",
    recipients: [{ mobiles: mobile, name: d.first_name.slice(0, 20), city: d.city.slice(0, 20), link: `${site.replace(/\/$/, "")}/start` }] };
}
