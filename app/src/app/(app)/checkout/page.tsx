"use client";
// W2 Checkout: a credit pack or one prepaid month of a plan. Razorpay, UPI first. Prices include GST.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BackButton, ErrorNote, Primary, useAction } from "@/components/ui";
import { rupees } from "@/components/app";
import { api, type UpiApp, type Wallet } from "@/lib/api";

const UPI: [UpiApp, string][] = [["gpay", "GPay"], ["phonepe", "PhonePe"], ["paytm", "Paytm"], ["other", "Other UPI"]];

function Checkout() {
  const q = useSearchParams();
  const router = useRouter();
  const type = (q.get("type") === "subscription" ? "subscription" : "pack") as "pack" | "subscription";
  const key = q.get("key") ?? "best";
  const [w, setW] = useState<Wallet | null>(null);
  const [upi, setUpi] = useState<UpiApp>("gpay");
  const [email, setEmail] = useState("");
  const { busy, error, run } = useAction();
  useEffect(() => { api().wallet().then(setW).catch(() => {}); }, []);

  const pack = type === "pack" ? w?.packs.find((p) => p.id === key) : null;
  const plan = type === "subscription" ? w?.plans.find((p) => p.key === key) : null;
  const price = pack?.price_paise ?? plan?.price_paise ?? 0;
  const pay = () => run(async () => {
    const r = await api().pay(type, key, upi, email.trim() || undefined);
    if (r.paid) router.push(`/payment/${r.order_id}`);
    else throw new Error("Payment not completed. You weren't charged. Try again whenever you like.");
  });

  if (w && !pack && !plan) return <div className="app-body pad"><BackButton href="/wallet" /><div className="empty card"><strong>That item isn&apos;t on sale</strong></div></div>;
  const base = pack ? Math.round(pack.credits / (1 + pack.bonus_pct / 100)) : 0;
  return (
    <div className="app-body pad" style={{ gap: 16 }}>
      <div className="titlebar"><BackButton href={type === "pack" ? "/wallet" : "/store"} /><h1>Checkout</h1></div>
      {!w ? <div className="skel" style={{ height: 120 }} /> : (
        <section style={{ padding: "16px 18px", borderRadius: 20, background: "#fff", border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="row" style={{ justifyContent: "space-between" }}><strong style={{ fontSize: 17 }}>{pack ? `${pack.credits.toLocaleString("en-IN")} credits` : plan!.label}</strong><strong style={{ fontSize: 17 }}>{rupees(price)}</strong></div>
          <div className="row" style={{ justifyContent: "space-between", fontSize: 12, color: "var(--muted)" }}>
            <span>{pack ? (pack.bonus_pct ? `${base} + ${pack.credits - base} bonus (+${pack.bonus_pct}%)` : "Never expire") : `One ${plan!.interval}, prepaid. Doesn't renew by itself.`}</span><span>Price includes GST</span></div>
          {plan?.active_until && <span className="small" style={{ color: "#1F5E49" }}>Active until {new Date(plan.active_until).toLocaleDateString("en-IN")}. This adds one more {plan.interval}.</span>}
        </section>
      )}
      <div className="stack">
        <span className="label">Pay with UPI</span>
        <div role="radiogroup" aria-label="UPI app" className="grid2" style={{ gap: 8 }}>
          {UPI.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={upi === v} className="chip" onClick={() => setUpi(v)}
            style={{ borderRadius: 14, height: 48, background: upi === v ? "var(--saffron-soft)" : "#fff", border: upi === v ? "1.5px solid var(--saffron)" : "1px solid var(--line)" }}>{l}</button>)}
        </div>
        <span className="small">Cards and netbanking are also available in the next step.</span>
      </div>
      <div className="field">
        <label htmlFor="co-email" className="label">Email for GST invoice <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span></label>
        <input id="co-email" className="input" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {api().demo && <div className="note"><span><strong>Demo mode:</strong> no money moves. The payment &quot;lands&quot; after two seconds.</span></div>}
      <ErrorNote error={error} />
      <div className="grow" />
      <Primary onClick={pay} busy={busy} disabled={!w}>Pay {rupees(price)} with {UPI.find((u) => u[0] === upi)![1]}</Primary>
      <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", lineHeight: 1.5 }}>
        Secure payment via Razorpay. Purchased credits never expire. <Link href="/legal/refunds">Refund policy</Link></div>
    </div>
  );
}
export default function CheckoutPage() { return <Suspense><Checkout /></Suspense>; }
