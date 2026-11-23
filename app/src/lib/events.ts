// Events: shared labels and formatting for the event screens.
import type { EventCard, EventCategory } from "./api";

export const CATS: [EventCategory, string][] = [["music", "Music"], ["food", "Food"], ["fitness", "Fitness"], ["culture", "Culture"], ["festival", "Festival"],
  ["workshop", "Workshop"], ["social", "Social"], ["spiritual", "Spiritual"], ["outdoors", "Outdoors"], ["other", "Other"]];
export const catLabel = (c: string) => CATS.find(([k]) => k === c)?.[1] ?? c;
export const whenLine = (e: Pick<EventCard, "starts_at" | "ends_at">) => {
  const s = new Date(e.starts_at), en = new Date(e.ends_at);
  const t = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return `${s.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} · ${t(s)}–${t(en)}`;
};
