import { ok as assert, deepStrictEqual as assertEquals } from "node:assert";
import { Jimp } from "npm:jimp@1.6.0";
import { generateImage, geminiImage, imaginePrompt, stampImagined } from "../functions/_shared/image.ts";
import { _useKeys } from "../functions/_shared/keys.ts";

Deno.test("prompts are painterly, respectful and per scene", () => {
  const p = imaginePrompt("wedding", 0);
  assert(p.includes("illustration") && p.includes("not a photograph") && p.includes("mandap") && p.includes("Fully clothed"));
  assert(imaginePrompt("old_age", 1).includes("at 70"));
});

Deno.test("the Imagined label is burned into the picture", async () => {
  const src = new Jimp({ width: 1024, height: 1024, color: 0x7e5befff });
  const out = await stampImagined(new Uint8Array(await src.getBuffer("image/png")));
  const img = await Jimp.read(out.buffer as ArrayBuffer);
  assertEquals([img.width, img.height], [1024, 1024]);
  // the label is a dark band in the bottom-left corner; the top-right stays the original purple
  const rgba = (c: number) => ({ r: (c >>> 24) & 255, g: (c >>> 16) & 255, b: (c >>> 8) & 255 });
  const dark = rgba(img.getPixelColor(30, 1024 - 30)), plain = rgba(img.getPixelColor(1000, 20));
  assert(dark.r < 90 && dark.g < 90, `label pixel ${JSON.stringify(dark)}`);
  assert(plain.r > 100 && plain.b > 200, `plain pixel ${JSON.stringify(plain)}`);
});

Deno.test("Gemini image call: both reference photos sent, image read back", async () => {
  _useKeys({ GEMINI_API_KEY: "g" });
  let body: any = null;
  const png = new Uint8Array(await new Jimp({ width: 8, height: 8, color: 0xffffffff }).getBuffer("image/png"));
  const fake = (async (_u: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    let s = ""; for (const b of png) s += String.fromCharCode(b);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: btoa(s) } }] } }], usageMetadata: { candidatesTokenCount: 1290 } }));
  }) as unknown as typeof fetch;
  const r = await geminiImage("gemini-2.5-flash-image", "p", [{ mime: "image/jpeg", data: new Uint8Array([1]) }, { mime: "image/jpeg", data: new Uint8Array([2]) }], fake);
  assertEquals(body.contents[0].parts.length, 3);
  assertEquals(body.generationConfig.responseModalities, ["IMAGE"]);
  assertEquals(r.outputTokens, 1290);
  assertEquals(r.bytes.length, png.length);
});

const tinyPng = async () => new Uint8Array(await new Jimp({ width: 8, height: 8, color: 0xffffffff }).getBuffer("image/png"));
const b64 = (u: Uint8Array) => { let s = ""; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
const refs = [{ mime: "image/jpeg", data: new Uint8Array([1, 2]), url: "https://x.supabase.co/a.jpg?token=1" }, { mime: "image/jpeg", data: new Uint8Array([3]) }];

Deno.test("OpenAI GPT Image: both photos sent as image[], picture read from b64_json", async () => {
  _useKeys({ OPENAI_API_KEY: "o" });
  const png = await tinyPng();
  let form: FormData | null = null, url = "", auth = "";
  const fake = (async (u: string, init: RequestInit) => { url = u; form = init.body as FormData; auth = (init.headers as Record<string, string>).authorization;
    return new Response(JSON.stringify({ data: [{ b64_json: b64(png) }], output_format: "png" })); }) as unknown as typeof fetch;
  const r = await generateImage("openai", "gpt-image-2", "p", refs, fake);
  assertEquals([url, auth, form!.getAll("image[]").length, form!.get("model")], ["https://api.openai.com/v1/images/edits", "Bearer o", 2, "gpt-image-2"]);
  assertEquals(r.bytes.length, png.length);
});

Deno.test("fal.ai: any edit endpoint, signed links preferred, picture downloaded", async () => {
  _useKeys({ FAL_KEY: "f" });
  const png = await tinyPng();
  const calls: string[] = []; let body: any = null; let auth = "";
  const fake = (async (u: string, init?: RequestInit) => {
    calls.push(u);
    if (u.startsWith("https://fal.run/")) { body = JSON.parse(String(init!.body)); auth = (init!.headers as Record<string, string>).authorization;
      return new Response(JSON.stringify({ images: [{ url: "https://v3.fal.media/out.jpg" }] })); }
    return new Response(png, { headers: { "content-type": "image/jpeg" } });
  }) as unknown as typeof fetch;
  const r = await generateImage("fal", "fal-ai/flux-2-max/edit", "p", refs, fake);
  assertEquals(calls, ["https://fal.run/fal-ai/flux-2-max/edit", "https://v3.fal.media/out.jpg"]);
  assertEquals(auth, "Key f");
  assertEquals(body.image_urls[0], refs[0].url);
  assert(body.image_urls[1].startsWith("data:image/jpeg;base64,"));
  assertEquals([r.bytes.length, r.mime], [png.length, "image/jpeg"]);
});

Deno.test("unknown providers and missing keys fail clearly", async () => {
  _useKeys({});
  await generateImage("anthropic", "x", "p", refs).then(() => assert(false), (e) => assert(e.message.includes("can't make pictures")));
  await generateImage("fal", "x", "p", refs).then(() => assert(false), (e) => assert(e.message.includes("FAL_KEY is not set")));
});
