// likha.in Founding Members waitlist.
//  POST from the website: checks the form, Cloudflare Turnstile (once both Turnstile keys are set in Admin > Keys)
//    and a per-IP limit (svc_waitlist_join, salted IP hash only). Visitors can't call the database for this directly.
//  POST {action:"notify"} with the internal secret (cron, every 5 minutes): sends the "your city is open" SMS
//    to everyone on a newly opened city's waitlist (MSG91, template MSG91_CITY_TEMPLATE_ID).
import { key, loadKeys } from "../_shared/keys.ts";
import { isInternal, json, preflight, rpc } from "../_shared/db.ts";
import { cityOpenRequest, clientIp, hashIp, MESSAGES, parseJoin, verifyTurnstile, type DueSms } from "../_shared/waitlist.ts";

async function notify() {
  const authKey = key("MSG91_AUTH_KEY"), template = key("MSG91_CITY_TEMPLATE_ID");
  if (!authKey || !template) return json({ configured: false });
  const site = Deno.env.get("LIKHA_SITE") ?? "https://likha.in";
  const due = await rpc<DueSms[]>("svc_waitlist_sms_due", { p_limit: 200 });
  const sent: string[] = [], failed: string[] = [], skipped: string[] = [];
  let note: string | null = null;
  for (const d of due) {
    const body = cityOpenRequest(d, template, site);
    if (!body) { skipped.push(d.id); continue; }
    try {
      const r = await fetch("https://control.msg91.com/api/v5/flow", {
        method: "POST", headers: { "content-type": "application/json", authkey: authKey },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
      });
      if (r.ok) sent.push(d.id); else { failed.push(d.id); note = `MSG91 ${r.status}`; }
    } catch (e) { failed.push(d.id); note = (e as Error).message.slice(0, 120); }
  }
  if (due.length) await rpc("svc_waitlist_sms_result", { p_sent: sent, p_failed: failed, p_note: note, p_skipped: skipped });
  return json({ configured: true, sent: sent.length, failed: failed.length, skipped: skipped.length });
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  await loadKeys();
  const body = await req.json().catch(() => null);
  if (isInternal(req) && body?.action === "notify") return notify();

  const p = parseJoin(body);
  if (!p.ok) return json({ error: p.error, message: MESSAGES[p.error] }, 400);
  const ip = clientIp(req);
  const site = key("TURNSTILE_SITE_KEY"), secret = key("TURNSTILE_SECRET_KEY");
  if (site && secret && !(await verifyTurnstile(secret, p.value.token, ip === "0" ? null : ip))) {
    return json({ error: "captcha", message: MESSAGES.captcha }, 400);
  }
  const salt = Deno.env.get("LIKHA_HASH_SALT") ?? "";
  try {
    const r = await rpc<Record<string, unknown>>("svc_waitlist_join", {
      p_ip_hash: await hashIp(ip, salt), p_first_name: p.value.first_name, p_phone_e164: p.value.phone,
      p_city_slug: p.value.city, p_gender: p.value.gender, p_invite_code: p.value.invite,
    });
    if (typeof r.error === "string") return json({ error: r.error, message: MESSAGES[r.error] ?? MESSAGES.bad }, r.error === "too_many" ? 429 : 400);
    return json(r);
  } catch (e) {
    console.error("waitlist", (e as Error).message);
    return json({ error: "bad", message: MESSAGES.bad }, 400);
  }
});
