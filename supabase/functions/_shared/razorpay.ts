// Razorpay: create an order (server side, amount from our own price tables) and check webhook signatures.
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET.
import { key } from "./keys.ts";

const enc = new TextEncoder();

export async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time compare, so the check does not leak how much of a signature was right. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function verifyWebhook(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  return safeEqual(await hmacHex(secret, rawBody), signature);
}

export async function createOrder(amountPaise: number, receipt: string, notes: Record<string, string>,
  fetcher: typeof fetch = fetch): Promise<{ id: string; amount: number; currency: string }> {
  const id = key("RAZORPAY_KEY_ID"), secret = key("RAZORPAY_KEY_SECRET");
  if (!id || !secret) throw new Error("Razorpay keys are not set");
  const res = await fetcher("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${btoa(`${id}:${secret}`)}` },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt: receipt.slice(0, 40), notes }),
  });
  if (!res.ok) throw new Error(`Razorpay order ${res.status}: ${await res.text()}`);
  return await res.json();
}

/** Razorpay webhook event -> what we store. Unknown events return null (acknowledged, ignored). */
export function paymentFromEvent(ev: any): { orderId: string; paymentId: string; status: "authorized" | "captured" | "failed" | "refunded" | "partially_refunded"; method: string; amount: number } | null {
  const p = ev?.payload?.payment?.entity;
  if (!p?.order_id || !p?.id) return null;
  const status = ({ "payment.authorized": "authorized", "payment.captured": "captured", "payment.failed": "failed",
    "order.paid": "captured", "refund.processed": p.amount_refunded >= p.amount ? "refunded" : "partially_refunded" } as const)[ev.event as string];
  if (!status) return null;
  return { orderId: p.order_id, paymentId: p.id, status, method: p.method ?? "unknown", amount: p.amount };
}

const rzpAuth = () => {
  const id = key("RAZORPAY_KEY_ID"), secret = key("RAZORPAY_KEY_SECRET");
  if (!id || !secret) throw new Error("Razorpay keys are not set");
  return `Basic ${btoa(`${id}:${secret}`)}`;
};

/** Admin "Re-check": what Razorpay says happened to an order. The best payment wins: captured > authorized > failed. */
export async function orderPayments(orderId: string, fetcher: typeof fetch = fetch): Promise<{ id: string; status: string; method: string; amount: number; raw: unknown } | null> {
  const res = await fetcher(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}/payments`, { headers: { authorization: rzpAuth() } });
  if (!res.ok) throw new Error(`Razorpay ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const items: any[] = (await res.json()).items ?? [];
  const rank: Record<string, number> = { captured: 3, refunded: 3, authorized: 2, failed: 1 };
  const best = items.sort((a, b) => (rank[b.status] ?? 0) - (rank[a.status] ?? 0))[0];
  return best ? { id: best.id, status: best.status, method: best.method, amount: best.amount, raw: best } : null;
}

/** Bank refund after two people approved it. The receipt makes Razorpay ignore a repeat of the same request. */
export async function refundPayment(paymentId: string, amountPaise: number, receipt: string, fetcher: typeof fetch = fetch): Promise<string> {
  const res = await fetcher(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST", headers: { authorization: rzpAuth(), "content-type": "application/json" },
    body: JSON.stringify({ amount: amountPaise, speed: "normal", receipt: receipt.slice(0, 40), notes: { source: "likha-admin" } }),
  });
  if (!res.ok) throw new Error(`Razorpay refund ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return (await res.json()).id;
}
