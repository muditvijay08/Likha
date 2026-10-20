"use client";
// Shared bits for the couple screens: pick which match, and the "you two" header.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, Chevron } from "@/components/app";
import { BackButton } from "@/components/ui";
import { api, type MatchRow } from "@/lib/api";

/** For menu links without a match: lists matches and sends each to `${base}/${match_id}`. */
export function MatchPicker({ base, title, blurb }: { base: string; title: string; blurb: string }) {
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  useEffect(() => { api().matches().then(setRows).catch(() => setRows([])); }, []);
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <div className="titlebar"><BackButton href="/menu" /><h1>{title}</h1></div>
      <p className="sub" style={{ margin: 0 }}>{blurb}</p>
      {rows === null ? <div className="skel" style={{ height: 160 }} /> : rows.length === 0 ? (
        <div className="empty card"><strong>No matches yet</strong><span className="sub">This opens once you match with someone.</span>
          <Link className="btn ghost" href="/discover">Go to Discover</Link></div>
      ) : (
        <div className="stack" style={{ gap: 8 }} aria-label="Choose a match">
          {rows.map((m) => (
            <Link key={m.match_id} href={`${base}/${m.match_id}`} className="rowlink">
              <Avatar name={m.first_name} photo={m.photo} size={44} />
              <span className="t"><strong>{m.first_name}{m.couple ? " · Couple Mode" : ""}</strong><span>{m.jodi_score ?? "–"}% Jodi Score · {m.gunas ?? "–"} Gunas</span></span>
              <Chevron />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Riya & Kabir" header strip used across the couple screens. */
export function Pair({ me, other, line }: { me: string; other: string; line?: string }) {
  return (
    <div className="row" style={{ gap: 12, padding: "14px 16px", borderRadius: 22, background: "linear-gradient(135deg, #EDE6FF, var(--rose-soft))" }}>
      <span className="row" style={{ gap: 0 }}><Avatar name={me} size={42} /><Avatar name={other} size={42} style={{ marginLeft: -12, border: "2px solid #fff" }} /></span>
      <span className="stack" style={{ gap: 2 }}><strong className="serif" style={{ fontSize: 18 }}>{me} &amp; {other}</strong>{line && <span className="small">{line}</span>}</span>
    </div>
  );
}

export const KIND_TITLE: Record<string, string> = { our_stars: "Our Stars", our_alignment: "Our Alignment", imagine_us: "Imagine Us", seven_questions: "Seven Questions" };
