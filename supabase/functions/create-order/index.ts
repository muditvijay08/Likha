// W2 Checkout: makes a Razorpay order for a credit pack or a prepaid plan month. The price always comes from our tables.
// Member token required. Returns what Razorpay Checkout needs in the browser.
import { admin, asUser, json, preflight, rpc } from "../_shared/db.ts";
import { createOrder } from "../_shared/razorpay.ts";

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const u = await asUser(req);
  if (!u) return json({ error: "sign in again" }, 401);
  const { item_type, item_key } = await req.json().catch(() => ({}));
  let amount: number | undefined, label = "";
  if (item_type === "pack") {
    const { data } = await admin.from("credit_packs").select("price_paise,label,credits").eq("id", item_key).eq("active", true).maybeSingle();
    amount = data?.price_paise; label = data ? `${data.credits} credits` : "";
  } else if (item_type === "subscription") {
    const { data } = await admin.from("subscription_plans").select("price_paise,label").eq("key", item_key).eq("active", true).maybeSingle();
    amount = data?.price_paise; label = data ? `${data.label}, 1 month` : "";
  }
  if (!amount) return json({ error: "That item isn't on sale." }, 400);
  const { data: me } = await admin.from("profiles").select("status").eq("id", u.userId).single();
  if (me?.status !== "active") return json({ error: "Finish your profile first." }, 403);
  try {
    const order = await createOrder(amount, `${item_type}:${item_key}:${u.userId.slice(0, 8)}`, { user_id: u.userId, item_type, item_key });
    await rpc("svc_create_payment", { p_user: u.userId, p_type: item_type, p_key: item_key, p_amount_paise: amount, p_order_id: order.id });
    return json({ order_id: order.id, amount_paise: amount, currency: "INR", key_id: Deno.env.get("RAZORPAY_KEY_ID"), label });
  } catch (e) {
    console.error(e);
    return json({ error: "Payments are busy. Please try again in a minute." }, 502);
  }
});
