"use client";
// Printable GST invoice (prices include 18% GST). Company details come from Admin settings.
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BackButton } from "@/components/ui";
import { api, type Invoice } from "@/lib/api";

const inr = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const [iv, setIv] = useState<Invoice | null | undefined>(undefined);
  useEffect(() => { api().invoice(id).then(setIv).catch(() => setIv(null)); }, [id]);
  if (iv === undefined) return <div className="app-body pad"><div className="skel" style={{ height: 300 }} /></div>;
  if (!iv) return <div className="app-body pad"><BackButton href="/plans" /><div className="empty card"><strong>Invoice not found</strong></div></div>;
  const row = (a: string, b: string, strong?: boolean) => <div className="row" style={{ justifyContent: "space-between", fontWeight: strong ? 700 : 400 }}><span>{a}</span><span>{b}</span></div>;
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="row no-print" style={{ justifyContent: "space-between" }}><BackButton href="/plans" /><button type="button" className="btn ghost" style={{ width: "auto", padding: "0 16px", height: 40 }} onClick={() => print()}>Print or save PDF</button></div>
      <article className="card stack" style={{ gap: 12, borderRadius: 18, fontSize: 13, lineHeight: 1.5 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div className="stack" style={{ gap: 2 }}><strong style={{ fontSize: 15 }}>{iv.company.legal_name}</strong><span>{iv.company.address}</span><span>GSTIN {iv.company.gstin} · CIN {iv.company.cin}</span></div>
          <div className="wordmark" style={{ fontSize: 20 }}>Likha<span>.</span></div>
        </div>
        <strong style={{ fontSize: 16 }}>Tax invoice</strong>
        {row("Invoice no.", iv.invoice_no)}{row("Date", new Date(iv.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }))}
        {row("Billed to", `${iv.customer.name}${iv.customer.phone ? ` · ${iv.customer.phone}` : ""}`)}
        <hr style={{ border: 0, borderTop: "1px solid var(--line)" }} />
        {row(`${iv.item}${iv.sac ? ` (SAC ${iv.sac})` : ""}`, inr(iv.taxable_paise))}
        {row("IGST 18%", inr(iv.gst_paise))}
        {row("Total paid", inr(iv.amount_paise), true)}
        <span className="small">Paid by {iv.method ?? "online payment"}{iv.payment_ref ? ` · ref ${iv.payment_ref}` : ""}. Prices include GST.</span>
      </article>
      <style>{`@media print { .nav, .demo-bar, .no-print { display: none !important } body { background: #fff } }`}</style>
    </div>
  );
}
