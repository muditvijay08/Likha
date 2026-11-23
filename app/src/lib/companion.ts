// Companion (Saathi) choices shared by the chat, settings and Memory Centre screens.
import type { Romance, SaathiMode } from "./api";

export const MODES: [SaathiMode, string, string][] = [["companion", "Companion", "Talk it through"], ["advisor", "Ask anything", "Straight answers"],
  ["coach", "Coach", "Practise and plan"], ["fun", "Fun", "Games and banter"]];
export const ROMANCE: [Romance, string, string][] = [
  ["off", "Off", "Friendly and platonic. The default."],
  ["warm", "Warm", "Affectionate, like a close friend. No flirting."],
  ["flirty", "Flirty", "Light, playful flirting. Nothing physical."],
  ["romantic", "Romantic", "Sweet and affectionate. Never sexual, never claims real feelings."]];
export const COMPANION_NAME = { chandni: "Chandni", dhruv: "Dhruv" } as const;

/** A sample line so the member can hear the settings before saving. Fixed text, not generated. */
export function previewLine(o: { name: string; mode: SaathiMode; romance: Romance; caring: number; playful: number; expressive: number; detail: "short" | "detailed"; language: string }) {
  const hi = o.language === "hindi";
  const greet = o.romance === "romantic" ? (hi ? "सुप्रभात, जान!" : "Good morning, jaan!") : o.romance === "flirty" ? (hi ? "अरे, आज तो मुस्कान कमाल की है!" : "Well hello, someone's smiling today!")
    : o.romance === "warm" ? (hi ? "आपको देखकर अच्छा लगा।" : "So good to hear from you.") : (hi ? "नमस्ते!" : "Hey!");
  const body = o.mode === "advisor" ? (o.caring > 65 ? "Straight answer: send the message tonight, keep it to two lines." : "Here's a gentle idea: a short, warm message tonight works well.")
    : o.mode === "coach" ? "Let's rehearse: I'll be your date, you start."
    : o.mode === "fun" ? (o.playful < 35 ? "Quick game: two truths and a lie. Go!" : "Want to play a quick question game?")
    : (o.caring < 35 ? "How are you feeling about it, honestly?" : "What's on your mind today?");
  const extra = o.detail === "detailed" ? " Tell me everything, I'll give you a proper plan." : "";
  const emoji = o.expressive > 65 ? " ✨" : "";
  return `${greet} ${body}${extra}${emoji}`;
}
