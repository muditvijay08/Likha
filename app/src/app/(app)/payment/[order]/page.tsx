"use client";
// W3 Payment status: waits for the bank (via our webhook) and never asks to pay twice.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { rupees, useApp } from "@/components/app";
import { api, type PaymentStatus } from "@/lib/api";

export default function Payment() {
  const { order } = useParams<{ order: string }>();
  const router = useRouter();
  const { reload } = useApp();
  const [s, setS] = useState<PaymentStatus | null>(null);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    let stop = false, n = 0;
    const tick = async () => {
      const x = await api().paymentStatus(order).catch(() => null);
      if (stop) return;
      setS(x);
      if (x?.credited || x?.status === "failed") { if (x.credited) reload().catch(() => {}); return; }
      if (++n > 60) { setSlow(true); return; }                      // about 2 minutes: we'll notify instead
      setTimeout(tick, 2000);
    };
    tick();
    return () => { stop = true; };
  }, [order, reload]);
  useEffect(() => {
    if (!s?.credited) return;
    const t = setTimeout(() => router.push(s.item_type === "pack" ? "/wallet" : s.item_key === "rishta_maasi" ? "/maasi" : s.item_key === "kick_pass" ? "/kick" : "/store"), 2500);
    return () => clearTimeout(t);
  }, [s, router]);

  const what = s?.item_type === "pack" ? `${s.credits} credits` : "your plan";
  const Icon = ({ ok }: { ok: boolean | null }) => (
    <div style={{ width: 88, height: 88, borderRadius: 999, background: ok === null ? "var(--saffron-soft)" : ok ? "var(--green-soft)" : "var(--red-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {ok === null ? <span className="spinner" style={{ width: 36, height: 36, borderWidth: 4 }} aria-hidden="true" />
        : <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={ok ? "#1F5E49" : "#C02660"} strokeWidth="2.4" aria-hidden="true">{ok ? <path d="M5 12l5 5L20 7" /> : <path d="M6 6l12 12M18 6L6 18" />}</svg>}
    </div>
  );

  return (
    <div className="app-body" style={{ padding: "40px 24px 100px", gap: 20 }}>
      <div className="stack" style={{ alignItems: "center", textAlign: "center", gap: 12 }} role="status" aria-live="polite">
        {!s ? <><Icon ok={null} /><h1 className="h1">Checking your payment</h1></>
        : s.credited ? <><Icon ok /><h1 className="h1">{s.item_type === "pack" ? "Credits added" : "You're all set"}</h1>
            <p className="sub">{s.item_type === "pack" ? `New balance ${s.balance.toLocaleString("en-IN")}. Taking you back.` : "Your plan is active. Taking you there."}</p>
            {s.invoice_no && <span className="small">Invoice {s.invoice_no}</span>}</>
        : s.status === "failed" ? <><Icon ok={false} /><h1 className="h1">Payment didn&apos;t go through</h1>
            <p className="sub">No money was taken. If your bank shows a debit, it reverses on its own within 5–7 days.</p></>
        : <><Icon ok={null} /><h1 className="h1">Paisa raste mein hai</h1>
            <p className="sub">Your bank is confirming {rupees(s.amount_paise)}. We&apos;ll add {what} the moment it lands. No need to pay again.</p>
            <span className="small">{s.payment_ref ? `Ref. ${s.payment_ref} · ` : ""}usually under 2 minutes</span>
            {slow && <span className="note">Still waiting on your bank. We&apos;ll notify you when it lands, or contact Help with this screen.</span>}</>}
      </div>
      <div className="grow" />
      {s?.status === "failed" ? <>
        <Link className="btn" href={s.item_type === "pack" ? `/checkout?type=pack&key=${s.item_key}` : `/checkout?type=subscription&key=${s.item_key}`}>Try again</Link>
        <Link className="btn text" href="/help">Contact Help</Link>
      </> : <Link className="btn ghost" href="/discover">Keep exploring, we&apos;ll notify you</Link>}
      <span className="small" style={{ textAlign: "center" }}>If a reading fails after payment, credits come back automatically.</span>
    </div>
  );
}
