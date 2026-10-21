import { deepStrictEqual as assertEquals, ok as assert, rejects, throws } from "node:assert";
import { callVerify, parsePhotoReply, parseSelfieReply, selfieBytes } from "../functions/_shared/verify.ts";

Deno.test("selfie replies must have a 0..1 score and a liveness answer", () => {
  assertEquals(parseSelfieReply({ score: 0.91, live: true }), { score: 0.91, live: true });
  throws(() => parseSelfieReply({ score: 91, live: true }));
  throws(() => parseSelfieReply({ score: 0.9 }));
  throws(() => parseSelfieReply(null));
});

Deno.test("photo replies: approved true/false, reason trimmed, labels kept", () => {
  assertEquals(parsePhotoReply({ approved: false, reason: "group photo", labels: { faces: 3 } }), { approved: false, reason: "group photo", labels: { faces: 3 } });
  assertEquals(parsePhotoReply({ approved: true }).reason, null);
  throws(() => parsePhotoReply({ ok: true }));
});

Deno.test("selfie picture must be a real JPEG of sensible size", () => {
  const jpg = new Uint8Array(5000); jpg[0] = 0xff; jpg[1] = 0xd8;
  const b64 = btoa(String.fromCharCode(...jpg));
  assertEquals(selfieBytes(`data:image/jpeg;base64,${b64}`).length, 5000);
  throws(() => selfieBytes("data:image/png;base64,AAAA"));
  throws(() => selfieBytes(`data:image/jpeg;base64,${btoa("x".repeat(5000))}`));
  throws(() => selfieBytes(undefined));
});

Deno.test("verification calls send the key, need https, and fail clearly", async () => {
  let seen: RequestInit | undefined;
  const ok = (async (_u: string, init?: RequestInit) => { seen = init; return new Response('{"approved":true}', { status: 200 }); }) as typeof fetch;
  const r = await callVerify("https://v.example.com/photo", "k-123", { a: 1 }, 1000, ok);
  assertEquals(r.json, { approved: true });
  assertEquals((seen!.headers as Record<string, string>).authorization, "Bearer k-123");
  await rejects(callVerify("http://v.example.com", "k", {}, 1000, ok), /https/);
  const bad = (async () => new Response("oops", { status: 502 })) as typeof fetch;
  await rejects(callVerify("https://v.example.com", "k", {}, 1000, bad), /502/);
  const slow = ((_u: string, init?: RequestInit) => new Promise((_, rej) => init!.signal!.addEventListener("abort", () => rej(Object.assign(new Error("a"), { name: "AbortError" }))))) as typeof fetch;
  await rejects(callVerify("https://v.example.com", "k", {}, 50, slow), /longer than/);
  assert(true);
});
