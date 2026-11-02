"use client";
// Chats on a laptop: the matches list stays on the left and the open chat fills the right, like WhatsApp Web.
// On phones this layout adds nothing; Matches and each chat are full screens as before.
import type { ReactNode } from "react";
import { useDesk } from "@/components/app";
import { MatchesList } from "@/components/matches-list";

export default function ChatsLayout({ children }: { children: ReactNode }) {
  const desk = useDesk();
  if (!desk) return <>{children}</>;
  return (
    <div className="split">
      <aside className="split-list" aria-label="Matches and chats"><MatchesList compact /></aside>
      <div className="split-main">{children}</div>
    </div>
  );
}
