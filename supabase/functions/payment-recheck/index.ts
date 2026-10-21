// Paid but no credits? Orders still "created" after the hours set in Admin (refunds.auto_credit_after_hours) get one
// automatic look at Razorpay. Captured payments are credited by the same code as the webhook (svc_record_payment).
// Cron (internal secret): */15 * * * *
import { loadKeys } from "../_shared/keys.ts";
import { isInternal, json, rpc } from "../_shared/db.ts";
import { orderPayments } from "../_shared/razorpay.ts";

Deno.serve(async (req) => {
  await loadKeys();
  if (!isInternal(req)) return json({ error: "internal only" }, 401);
  const due = await rpc<{ id: string; order_id: string }[]>("svc_payments_to_recheck", { p_limit: 50 });
  let credited = 0, unpaid = 0, failed = 0;
  for (const p of due) {
    try {
      const r = await orderPayments(p.order_id);
      if (!r || !["captured", "failed", "authorized", "refunded"].includes(r.status)) { unpaid++; continue; }
      await rpc("svc_record_payment", { p_order_id: p.order_id, p_payment_id: r.id, p_status: r.status, p_method: r.method, p_amount_paise: r.amount, p_raw: r.raw });
      if (r.status === "captured") credited++;
    } catch (e) {
      failed++;
      console.error("recheck", p.order_id, (e as Error).message);
    }
  }
  return json({ checked: due.length, credited, unpaid, failed });
});
