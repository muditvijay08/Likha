// Imagine Us: two painterly pictures of a couple (both agreed), from their main photos. Gemini image model, set in Admin
// (ai_features.imagine). Every picture gets "Imagined · Likha · not a real photo" burned in before it is stored.
import { Jimp } from "npm:jimp@1.6.0";
import { IMAGINED_LABEL_PNG } from "./imagined_label.ts";

export const SCENES: Record<string, string> = {
  travel: "on a trip together: a hill-station viewpoint at golden hour, casual travel clothes",
  wedding: "at their Indian wedding: a warm mandap scene with marigolds, traditional wedding clothes",
  old_age: "together at 70: a cosy home, grey hair, laughing over chai",
};

export function imaginePrompt(scene: string, variant: number): string {
  return `Create a warm, tasteful, painterly illustration (clearly an artwork, not a photograph) of the two people in the reference photos, ` +
    `${SCENES[scene] ?? SCENES.travel}. Keep them recognisable but stylised. Fully clothed, respectful, affectionate at most holding hands. ` +
    `No text, no logos, no other people's faces in focus. Composition ${variant === 0 ? "A: both facing the viewer" : "B: candid, side view"}.`;
}

export interface GenImage { bytes: Uint8Array; mime: string; outputTokens: number; inputTokens: number }

/** One image from Gemini's generateContent (responseModalities IMAGE). */
export async function geminiImage(model: string, prompt: string, refs: { mime: string; data: Uint8Array }[], fetcher: typeof fetch = fetch): Promise<GenImage> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
  const res = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }, ...refs.map((r) => ({ inline_data: { mime_type: r.mime, data: b64(r.data) } }))] }],
      generationConfig: { responseModalities: ["IMAGE"] } }),
  });
  if (!res.ok) throw new Error(`gemini image ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const part = (j.candidates?.[0]?.content?.parts ?? []).find((p: any) => p.inlineData ?? p.inline_data);
  const inline = part?.inlineData ?? part?.inline_data;
  if (!inline?.data) throw new Error(`no image returned (${j.candidates?.[0]?.finishReason ?? "unknown"})`);
  return { bytes: Uint8Array.from(atob(inline.data), (c) => c.charCodeAt(0)), mime: inline.mimeType ?? inline.mime_type ?? "image/png",
           outputTokens: j.usageMetadata?.candidatesTokenCount ?? 1290, inputTokens: j.usageMetadata?.promptTokenCount ?? 0 };
}

/** Burns the "Imagined" label into the bottom-left corner and returns a JPEG. */
export async function stampImagined(bytes: Uint8Array): Promise<Uint8Array> {
  const img = await Jimp.read(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const label = await Jimp.read(Uint8Array.from(atob(IMAGINED_LABEL_PNG), (c) => c.charCodeAt(0)).buffer);
  const scale = Math.max(0.5, Math.min(2, img.width / 1024));
  if (scale !== 1) label.resize({ w: Math.round(label.width * scale) });
  const m = Math.round(20 * scale);
  img.composite(label, m, img.height - label.height - m);
  return new Uint8Array(await img.getBuffer("image/jpeg", { quality: 88 }));
}
