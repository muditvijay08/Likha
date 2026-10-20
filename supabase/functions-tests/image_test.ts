import { ok as assert, deepStrictEqual as assertEquals } from "node:assert";
import { Jimp } from "npm:jimp@1.6.0";
import { geminiImage, imaginePrompt, stampImagined } from "../functions/_shared/image.ts";

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
  Deno.env.set("GEMINI_API_KEY", "g");
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
