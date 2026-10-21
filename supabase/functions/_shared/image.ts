// Imagine Us: two painterly pictures of a couple (both agreed), from their main photos. The model is picked in
// Admin > AI models (ai_features.imagine): Google, OpenAI or any fal.ai image-edit endpoint. Every picture gets "Imagined · Likha · not a real photo" burned in before it is stored.
import { Jimp } from "npm:jimp@1.6.0";
import { IMAGINED_LABEL_PNG } from "./imagined_label.ts";
import { mustKey } from "./keys.ts";

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
/** A reference photo. `url` (a short-lived signed link) is used by hosts that fetch images themselves (fal.ai). */
export interface Ref { mime: string; data: Uint8Array; url?: string }

const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const TIMEOUT = 120_000;

/** One picture from whichever provider Admin picked for the feature (ai_models.provider). */
export function generateImage(provider: string, model: string, prompt: string, refs: Ref[], fetcher: typeof fetch = fetch): Promise<GenImage> {
  if (provider === "gemini") return geminiImage(model, prompt, refs, fetcher);
  if (provider === "openai") return openaiImage(model, prompt, refs, fetcher);
  if (provider === "fal") return falImage(model, prompt, refs, fetcher);
  return Promise.reject(new Error(`${provider} can't make pictures`));
}

/** Google Nano Banana family: generateContent with responseModalities IMAGE. */
export async function geminiImage(model: string, prompt: string, refs: Ref[], fetcher: typeof fetch = fetch): Promise<GenImage> {
  const res = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": mustKey("GEMINI_API_KEY") }, signal: AbortSignal.timeout(TIMEOUT),
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }, ...refs.map((r) => ({ inline_data: { mime_type: r.mime, data: b64(r.data) } }))] }],
      generationConfig: { responseModalities: ["IMAGE"] } }),
  });
  if (!res.ok) throw new Error(`gemini image ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const part = (j.candidates?.[0]?.content?.parts ?? []).find((p: any) => p.inlineData ?? p.inline_data);
  const inline = part?.inlineData ?? part?.inline_data;
  if (!inline?.data) throw new Error(`no image returned (${j.candidates?.[0]?.finishReason ?? "unknown"})`);
  return { bytes: unb64(inline.data), mime: inline.mimeType ?? inline.mime_type ?? "image/png",
           outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0, inputTokens: j.usageMetadata?.promptTokenCount ?? 0 };
}

/** OpenAI GPT Image: /v1/images/edits with every reference photo as image[]. */
export async function openaiImage(model: string, prompt: string, refs: Ref[], fetcher: typeof fetch = fetch): Promise<GenImage> {
  const form = new FormData();
  form.append("model", model); form.append("prompt", prompt); form.append("n", "1"); form.append("size", "1024x1024"); form.append("quality", "medium");
  refs.forEach((r, i) => form.append("image[]", new Blob([r.data as Uint8Array<ArrayBuffer>], { type: r.mime }), `ref-${i + 1}.${r.mime === "image/png" ? "png" : "jpg"}`));
  const res = await fetcher("https://api.openai.com/v1/images/edits", {
    method: "POST", headers: { authorization: `Bearer ${mustKey("OPENAI_API_KEY")}` }, body: form, signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`openai image ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const data = j.data?.[0]?.b64_json;
  if (!data) throw new Error("no image returned");
  return { bytes: unb64(data), mime: `image/${j.output_format ?? "png"}`, outputTokens: j.usage?.output_tokens ?? 0, inputTokens: j.usage?.input_tokens ?? 0 };
}

/** fal.ai: any image-edit endpoint id (FLUX.2, Seedream, GPT Image via fal…) taking prompt + image_urls. */
export async function falImage(model: string, prompt: string, refs: Ref[], fetcher: typeof fetch = fetch): Promise<GenImage> {
  const res = await fetcher(`https://fal.run/${model.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Key ${mustKey("FAL_KEY")}` }, signal: AbortSignal.timeout(TIMEOUT),
    body: JSON.stringify({ prompt, image_urls: refs.map((r) => r.url ?? `data:${r.mime};base64,${b64(r.data)}`), num_images: 1, output_format: "jpeg" }),
  });
  if (!res.ok) throw new Error(`fal ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const url: string | undefined = j.images?.[0]?.url;
  if (!url) throw new Error("no image returned");
  if (url.startsWith("data:")) { const [head, data] = url.split(","); return { bytes: unb64(data), mime: head.slice(5).split(";")[0], outputTokens: 0, inputTokens: 0 }; }
  const img = await fetcher(url, { signal: AbortSignal.timeout(30_000) });
  if (!img.ok) throw new Error(`fal download ${img.status}`);
  return { bytes: new Uint8Array(await img.arrayBuffer()), mime: img.headers.get("content-type") ?? "image/jpeg", outputTokens: 0, inputTokens: 0 };
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
