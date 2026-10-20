import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { createOrder, hmacHex, paymentFromEvent, safeEqual, verifyWebhook } from "../functions/_shared/razorpay.ts";

Deno.test("webhook signature: HMAC-SHA256 of the raw body", async () => {
  // Known vector: HMAC_SHA256("secret", "hello") 
  assertEquals(await hmacHex("secret", "hello"), "88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b");
  const body = '{"event":"payment.captured"}';
  const sig = await hmacHex("whsec", body);
  assert(await verifyWebhook(body, sig, "whsec"));
  assert(!(await verifyWebhook(body + " ", sig, "whsec")), "changed body is refused");
  assert(!(await verifyWebhook(body, sig, "other")), "wrong secret is refused");
  assert(!(await verifyWebhook(body, null, "whsec")), "missing signature is refused");
  assert(!safeEqual("abc", "abd") && safeEqual("abc", "abc"));
});

Deno.test("events map to payment states", () => {
  const ent = { id: "pay_1", order_id: "order_1", method: "upi", amount: 49900, amount_refunded: 0 };
  assertEquals(paymentFromEvent({ event: "payment.captured", payload: { payment: { entity: ent } } })?.status, "captured");
  assertEquals(paymentFromEvent({ event: "payment.failed", payload: { payment: { entity: ent } } })?.status, "failed");
  assertEquals(paymentFromEvent({ event: "refund.processed", payload: { payment: { entity: { ...ent, amount_refunded: 49900 } } } })?.status, "refunded");
  assertEquals(paymentFromEvent({ event: "refund.processed", payload: { payment: { entity: { ...ent, amount_refunded: 100 } } } })?.status, "partially_refunded");
  assertEquals(paymentFromEvent({ event: "subscription.charged", payload: {} }), null);
});

Deno.test("order is created with our amount and basic auth", async () => {
  Deno.env.set("RAZORPAY_KEY_ID", "rzp_test_x"); Deno.env.set("RAZORPAY_KEY_SECRET", "s3cret");
  let seen: any = null;
  const fake = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify({ id: "order_9", amount: 49900, currency: "INR" })); }) as unknown as typeof fetch;
  const o = await createOrder(49900, "pack:best:abcd", { item_key: "best" }, fake);
  assertEquals(o.id, "order_9");
  assertEquals(seen.url, "https://api.razorpay.com/v1/orders");
  assertEquals((seen.init.headers as Record<string, string>).authorization, `Basic ${btoa("rzp_test_x:s3cret")}`);
  assertEquals(JSON.parse(seen.init.body).amount, 49900);
});
