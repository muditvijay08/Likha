"use client";
// Every reading the member has bought.
import Link from "next/link";
import { useEffect, useState } from "react";
import { BackButton } from "@/components/ui";
import { Chevron } from "@/components/app";
import { api, type ReadingItem } from "@/lib/api";

const NAME: Record<string, string> = { why_not: "Why It Didn't Work", who_suits_me: "Who Suits Me", check_anyone: "Check With Anyone", compat_report: "Compatibility report",
  gift: "Birthday year ahead", next_12_months: "Love forecast", our_stars: "Our Stars", our_alignment: "Our Alignment", seven_questions: "Seven Questions" };
const STATUS: Record<string, string> = { generating: "Writing…", pending_consent: "Waiting for them", refunded: "Refunded", failed: "Refunded", declined: "Declined", ready: "" };

export default function Readings() {
  const [rows, setRows] = useState<ReadingItem[] | null>(null);
  useEffect(() => { api().myReadings().then(setRows).catch(() => setRows([])); }, []);
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/store" /><h1>My readings</h1></div>
      {rows === null ? <div className="skel" style={{ height: 200 }} /> : rows.length === 0 ? (
        <div className="empty card"><strong>No readings yet</strong><Link className="btn" href="/store">Visit the Astro Store</Link></div>
      ) : (
        <div className="listcard">{rows.map((r) => (
          <Link key={r.id} href={r.kind === "who_suits_me" ? "/my-kundli?tab=suits" : `/readings/${r.id}`}>
            <span className="stack" style={{ gap: 1 }}><span>{NAME[r.kind] ?? r.kind}{r.name ? ` · ${r.name}` : ""}</span>
              <span className="small">{new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}{STATUS[r.status] ? ` · ${STATUS[r.status]}` : ""}</span></span>
            <Chevron /></Link>))}</div>
      )}
    </div>
  );
}
