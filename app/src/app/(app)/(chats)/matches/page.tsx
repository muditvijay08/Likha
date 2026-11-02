"use client";
// M2 Matches. On a laptop the list sits in the left pane (see layout), so the right pane asks you to pick a chat.
import { useDesk } from "@/components/app";
import { MatchesList } from "@/components/matches-list";

export default function Matches() {
  const desk = useDesk();
  if (!desk) return <MatchesList />;
  return (
    <div className="app-body" style={{ flex: 1, alignItems: "center", justifyContent: "center", textAlign: "center", gap: 10 }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.6" aria-hidden="true"><path d="M4 5h16v11H8l-4 4z" /></svg>
      <strong style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 600 }}>Pick a conversation</strong>
      <span className="sub">Your matches and chats are on the left.</span>
    </div>
  );
}
