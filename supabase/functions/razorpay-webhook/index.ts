// Razorpay webhook (payment.captured, payment.failed, order.paid, refund.processed). Signature checked on the raw body.
// Idempotent: Razorpay retries, and every event can safely arrive twice. Credits land only on "captured".
// In the Razorpay dashboard: Webhooks -> https://<project>.supabase.co/functions/v1/razorpay-webhook, secret = the webhook secret in Admin > Keys (test and live each have their own; the one in use follows the payments switch).
// Deploy with --no-verify-jwt (Razorpay sends no Supabase token).
import { key, loadKeys, mustKey } from "../_shared/keys.ts";
import { json, rpc } from "../_shared/db.ts";
import { paymentFromEvent, verifyWebhook } from "../_shared/razorpay.ts";

Deno.serve(async (req) => {
  await loadKeys();
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const raw = await req.text();
  if (!(await verifyWebhook(raw, req.headers.get("x-razorpay-signature"), key("RAZORPAY_WEBHOOK_SECRET") ?? ""))) {
    return json({ error: "bad signature" }, 401);
  }
  let ev: unknown;
  try { ev = JSON.parse(raw); } catch { return json({ error: "bad json" }, 400); }
  const p = paymentFromEvent(ev);
  if (!p) return json({ ok: true, ignored: true });
  try {
    await rpc("svc_record_payment", { p_order_id: p.orderId, p_payment_id: p.paymentId, p_status: p.status, p_method: p.method,
      p_amount_paise: p.amount, p_raw: ev });
    return json({ ok: true });
  } catch (e) {
    const msg = String((e as Error).message);
    console.error(msg);
    // unknown order = not ours (another app on the same Razorpay account): acknowledge so Razorpay stops retrying
    if (msg.includes("unknown order")) return json({ ok: true, ignored: true });
    return json({ error: "retry later" }, 500);                     // Razorpay retries with backoff
  }
});
