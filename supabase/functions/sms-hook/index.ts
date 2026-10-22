// Supabase Auth > Hooks > Send SMS -> this function. Sends the login code by SMS through MSG91 (India only, DLT template
// MSG91_OTP_TEMPLATE_ID with an ##otp## variable). Deploy with --no-verify-jwt; every request is signature-checked
// with SEND_SMS_HOOK_SECRET (the secret Supabase shows when you create the hook).
import { key, loadKeys } from "../_shared/keys.ts";
import { indianMobile } from "../_shared/sms.ts";
import { otpRequest, verifyHook } from "../_shared/smshook.ts";

const fail = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { http_code: status, message } }), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return fail(405, "POST only");
  const body = await req.text();
  if (!(await verifyHook(Deno.env.get("SEND_SMS_HOOK_SECRET") ?? "", req.headers, body))) return fail(401, "bad signature");
  await loadKeys();
  let p: { user?: { phone?: string }; sms?: { otp?: string } };
  try { p = JSON.parse(body); } catch { return fail(400, "bad payload"); }
  const mobile = indianMobile(p.user?.phone ?? ""), otp = String(p.sms?.otp ?? "");
  if (!mobile) return fail(400, "Likha is in India for now: please use an Indian mobile number.");
  if (!/^\d{4,8}$/.test(otp)) return fail(400, "bad code");
  const authKey = key("MSG91_AUTH_KEY"), template = key("MSG91_OTP_TEMPLATE_ID");
  if (!authKey || !template) return fail(500, "SMS is not set up yet. Please try again later.");
  try {
    const r = await fetch("https://control.msg91.com/api/v5/flow", {
      method: "POST", headers: { "content-type": "application/json", authkey: authKey },
      body: JSON.stringify(otpRequest(template, mobile, otp)), signal: AbortSignal.timeout(10_000),
    });
    const j = await r.json().catch(() => ({})) as { type?: string; message?: string };
    if (!r.ok || j.type === "error") { console.error("msg91", r.status, j.message); return fail(502, "We couldn't send the code. Please try again in a minute."); }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("msg91", (e as Error).message);
    return fail(502, "We couldn't send the code. Please try again in a minute.");
  }
});
