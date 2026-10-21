// Admin money buttons that need Razorpay. Team only (MFA via has_perm), from the admin site (LIKHA_ADMIN_SITE).
//   {action:"recheck_payment", payment_id}  payments.read   ask Razorpay what happened; credits land if it was captured
//   {action:"send_refund", refund_id}        refunds.large   send an approved bank refund to Razorpay
import { admin, asUser, rpc } from "../_shared/db.ts";
import { loadKeys } from "../_shared/keys.ts";
import { orderPayments, refundPayment } from "../_shared/razorpay.ts";

const H = { "access-control-allow-origin": Deno.env.get("LIKHA_ADMIN_SITE") ?? "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS", "content-type": "application/json" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: H });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  await loadKeys();
  const u = await asUser(req);
  if (!u) return json({ error: "sign in" }, 401);
  const body = await req.json().catch(() => ({}));
  const allowed = async (perm: string) => (await u.client.rpc("has_perm", { p_perm: perm })).data === true;
  try {
    if (body.action === "recheck_payment") {
      if (!(await allowed("payments.read"))) return json({ error: "not allowed" }, 403);
      const { data: p } = await admin.from("payments").select("id,razorpay_order_id,status,credited").eq("id", body.payment_id).maybeSingle();
      if (!p?.razorpay_order_id) return json({ error: "payment not found" }, 404);
      const r = await orderPayments(p.razorpay_order_id);
      if (!r) return json({ ok: true, note: "Razorpay has no payment for this order. The member didn't finish paying." });
      if (!["captured", "failed", "authorized", "refunded"].includes(r.status)) return json({ ok: true, note: `Razorpay says ${r.status}. Nothing to change.` });
      await rpc("svc_record_payment", { p_order_id: p.razorpay_order_id, p_payment_id: r.id, p_status: r.status, p_method: r.method, p_amount_paise: r.amount, p_raw: r.raw });
      const { data: after } = await admin.from("payments").select("status,credited").eq("id", p.id).single();
      await admin.rpc("svc_audit_admin", { p_action: "payment_recheck", p_target: p.id, p_actor: u.userId, p_note: `${p.status} -> ${after!.status}` }).then(() => {}, () => {});
      return json({ ok: true, note: after!.credited ? `Captured by Razorpay (${r.id}). Credited now.` : `Razorpay says ${r.status} (${r.id}).`, status: after!.status, credited: after!.credited });
    }
    if (body.action === "send_refund") {
      if (!(await allowed("refunds.large"))) return json({ error: "not allowed" }, 403);
      const r = await rpc<{ id: string; amount_paise: number; payment_ref: string; status: string } | null>("svc_refund_to_send", { p_refund: body.refund_id });
      if (!r) return json({ error: "refund not found" }, 404);
      if (r.status !== "approved") return json({ error: r.status === "processed" ? "already sent" : "needs a second approval first" }, 409);
      if (!r.payment_ref || !r.amount_paise) return json({ error: "no Razorpay payment to refund" }, 409);
      const id = await refundPayment(r.payment_ref, r.amount_paise, `refund-${r.id}`);
      await rpc("svc_refund_sent", { p_refund: r.id, p_razorpay_refund_id: id });
      return json({ ok: true, note: `Sent to Razorpay (${id}). Money reaches the member in 5 to 7 working days.` });
    }
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message.slice(0, 200) }, 502);
  }
});
