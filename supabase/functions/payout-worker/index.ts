// Sends approved Cupid payouts by UPI through RazorpayX, then records the result.
// Cron hourly (internal secret). RazorpayX webhooks (payout.processed / payout.failed) also land here.
// Docs: https://razorpay.com/docs/api/x/payouts/
import { hmacHex, safeEqual } from "../_shared/razorpay.ts";
import { key, loadKeys, mustKey } from "../_shared/keys.ts";
import { admin, isInternal, json, rpc } from "../_shared/db.ts";

const RZP = "https://api.razorpay.com/v1";
const auth = () => "Basic " + btoa(`${key("RAZORPAYX_KEY_ID")}:${key("RAZORPAYX_KEY_SECRET")}`);


async function send() {
  const due = await rpc<any[]>("svc_cupid_payouts_to_send", { p_limit: 50 });
  let sent = 0;
  for (const p of due) {
    try {
      const res = await fetch(`${RZP}/payouts`, {
        method: "POST",
        headers: { authorization: auth(), "content-type": "application/json", "X-Payout-Idempotency": p.payout_id },
        body: JSON.stringify({
          account_number: key("RAZORPAYX_ACCOUNT_NUMBER"), amount: p.net_paise, currency: "INR", mode: "UPI",
          purpose: "payout", queue_if_low_balance: true, reference_id: p.payout_id, narration: "Likha Cupid",
          fund_account: { account_type: "vpa", vpa: { address: p.upi_id },
            contact: { name: p.legal_name, type: "vendor", reference_id: p.payout_id } },
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error?.description ?? `razorpayx ${res.status}`);
      await admin.from("cupid_payouts").update({ provider_payout_id: j.id }).eq("id", p.payout_id);
      if (j.status === "processed") await rpc("svc_cupid_payout_result", { p_payout: p.payout_id, p_ok: true, p_provider_id: j.id, p_utr: j.utr });
      sent++;
    } catch (e) {
      await rpc("svc_cupid_payout_result", { p_payout: p.payout_id, p_ok: false, p_provider_id: null, p_utr: null, p_reason: String((e as Error).message) });
    }
  }
  return { due: due.length, sent };
}

Deno.serve(async (req) => {
  await loadKeys();
  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature");
  if (sig) {                                                         // webhook from RazorpayX
    if (!safeEqual(await hmacHex(mustKey("RAZORPAYX_WEBHOOK_SECRET"), raw), sig)) return json({ error: "bad signature" }, 401);
    const ev = JSON.parse(raw);
    const p = ev.payload?.payout?.entity;
    if (p?.reference_id && ["payout.processed", "payout.failed", "payout.reversed"].includes(ev.event)) {
      await rpc("svc_cupid_payout_result", { p_payout: p.reference_id, p_ok: ev.event === "payout.processed",
        p_provider_id: p.id, p_utr: p.utr ?? null, p_reason: p.failure_reason ?? ev.event });
    }
    return json({ ok: true });
  }
  if (!isInternal(req)) return json({ error: "internal only" }, 401);
  return json(await send());
});
