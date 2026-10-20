"use client";
// M2 Matches (first version): every match with the last message. Chat itself (M3) comes in the next build.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, ago } from "@/components/app";
import { api, type MatchRow } from "@/lib/api";

export default function Matches() {
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  useEffect(() => { api().matches().then(setRows).catch(() => setRows([])); }, []);
  return (
    <div className="app-body pad" style={{ gap: 14 }}>
      <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 28, fontWeight: 600 }}>Chats</h1>
      {rows === null ? <div className="skel" style={{ height: 200 }} /> : rows.length === 0 ? (
        <div className="empty card"><strong>No matches yet</strong><span className="sub">When someone you like likes you back, they show up here.</span>
          <Link className="btn" href="/likes">See who likes you</Link></div>
      ) : (
        <div className="listcard">
          {rows.map((m) => (
            <Link key={m.match_id} href={m.last_at ? `/chat/${m.match_id}` : `/match/${m.match_id}`} style={{ gap: 12 }}>
              <Avatar name={m.first_name} photo={m.photo} size={48} />
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <strong>{m.first_name}{m.jodi_score != null ? <span style={{ fontWeight: 600, color: "var(--link)", fontSize: 12 }}> · {m.jodi_score}%</span> : null}</strong>
                <span style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {m.last_body ? `${m.last_from_me ? "You: " : ""}${m.last_body}` : "New match. Say hi!"}</span>
              </span>
              <span className="stack" style={{ alignItems: "flex-end", gap: 4 }}>
                <span className="small">{ago(m.last_at ?? m.matched_at)}</span>
                {m.unread > 0 && <span style={{ minWidth: 20, height: 20, padding: "0 6px", borderRadius: 999, background: "var(--rose)", color: "#fff", font: "700 11px/20px var(--sans)", textAlign: "center" }}>{m.unread}</span>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
