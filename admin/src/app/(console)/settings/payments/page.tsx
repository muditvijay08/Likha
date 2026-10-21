"use client";
// I20 Payments and tax. Live/test mode and Razorpay keys live on Keys (owner only); this page holds the rules.
import Link from "next/link";
import { useAdmin } from "@/components/shell";
import { SettingsForm } from "@/components/settings-form";
import { Page, useLoad } from "@/components/ui";
import { api } from "@/lib/api";

export default function PaymentsSettings() {
  const { me } = useAdmin();
  const can = me.perms.includes("settings.write");
  const s = useLoad(() => Promise.all([api().settings(["payments_mode"]), api().consents()]));
  const mode = String(s.data?.[0].payments_mode?.value ?? "test");
  const review = s.data?.[1].policy_review ?? [];
  return (
    <Page title="Payments and tax" sub="Money only moves through Razorpay orders priced from the database. Credits change only through the credit ledger.">
      <div className="row"><span className={`pill ${mode === "live" ? "live" : "test"}`}>{mode === "live" ? "Live payments" : "Test payments"}</span>
        <Link className="small" href="/keys">Change mode and Razorpay keys on Keys and integrations →</Link></div>
      {review.includes("refunds") && <div className="note warn" role="alert">Refund rules changed. Update the Refund policy and publish a new Terms version on <Link href="/settings/general">General and legal</Link> so members see the same rules.</div>}
      <div className="split">
        <SettingsForm title="Invoices and GST" canEdit={can} fields={[
          { key: "invoice", path: "gst_pct", label: "GST", unit: "pct", hint: "Applies to new payments. Past invoices keep their GST." }, { key: "invoice", path: "prices_include_gst", label: "Prices include GST", unit: "bool", locked: true, hint: "Prices shown to members always include GST." },
          { key: "invoice", path: "prefix", label: "Invoice number prefix", unit: "text", hint: "Change at the start of a financial year, e.g. LKH/27-28/" },
          { key: "invoice", path: "sac", label: "SAC code", unit: "text" }]} />
        <SettingsForm title="Refund rules" canEdit={can} onSaved={s.reload} fields={[
          { key: "refunds", path: "auto_credit_after_hours", label: "Paid but no credits: check Razorpay automatically after", unit: "hours" },
          { key: "refunds", path: "pack_refund_days", label: "Unused packs can be refunded within", unit: "days", hint: "Bank refunds of packs. Finance can approve an exception." },
          { key: "refunds", path: "second_approver_above_paise", label: "A second person approves refunds above", unit: "rupees" },
          { key: "refunds", path: "max_per_user_month", label: "Refunds per member a month", unit: "number", hint: "Support stops here; Finance can approve more." }]} />
      </div>
      <SettingsForm title="Plans and renewals" canEdit={can} onSaved={s.reload} fields={[
        { key: "subscriptions", path: "reminder_hours", label: "Remind before a plan ends", unit: "hours", hint: "Plans are paid ahead; there is no automatic charge." },
        { key: "subscriptions", path: "refund_part_month", label: "Refund the unused part of a month", unit: "bool" },
        { key: "subscriptions", path: "outage_refund_hours", label: "Give every plan a free day after outages longer than", unit: "hours", hint: "Applied when an incident is marked fixed on System health." }]} />
    </Page>
  );
}
