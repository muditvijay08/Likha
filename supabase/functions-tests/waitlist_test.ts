import { deepStrictEqual as assertEquals } from "node:assert";
import { cityOpenRequest, hashIp, normalisePhone, parseJoin, verifyTurnstile } from "../functions/_shared/waitlist.ts";
import { testKey } from "../functions/_shared/keytest.ts";

const good = { first_name: " Sneha ", phone: "98290 12345", city: "pune", gender: "woman", consent: true, invite: "A1B2C3D4", token: "tok" };

Deno.test("phone numbers: Indian mobiles and UAE, nothing guessed", () => {
  assertEquals(normalisePhone("+91 98290 12345"), "+919829012345");
  assertEquals(normalisePhone("09829012345"), "+919829012345");
  assertEquals(normalisePhone("9829012345"), "+919829012345");
  assertEquals(normalisePhone("+971 50 123 4567"), "+971501234567");
  assertEquals(normalisePhone("12345"), null);
  assertEquals(normalisePhone("+44 7700 900123"), null);
  assertEquals(normalisePhone("5829012345"), null);        // Indian mobiles start 6-9
});

Deno.test("form: valid sign-up, invite lower-cased, name tidied", () => {
  const p = parseJoin(good);
  assertEquals(p.ok, true);
  if (p.ok) assertEquals([p.value.first_name, p.value.phone, p.value.invite], ["Sneha", "+919829012345", "a1b2c3d4"]);
});

Deno.test("form: each problem names its field", () => {
  const err = (o: Record<string, unknown>) => { const p = parseJoin({ ...good, ...o }); return p.ok ? "ok" : p.error; };
  assertEquals(err({ first_name: "" }), "name");
  assertEquals(err({ first_name: "<script>" }), "name");
  assertEquals(err({ first_name: "x".repeat(41) }), "name");
  assertEquals(err({ phone: "123" }), "phone");
  assertEquals(err({ city: "Pune!" }), "city");
  assertEquals(err({ gender: "robot" }), "gender");
  assertEquals(err({ consent: "true" }), "consent");         // only a real tick counts
  assertEquals(err({ consent: undefined }), "consent");
  assertEquals(err({ invite: "nope" }), "ok");                // a bad invite code is just ignored
  assertEquals(parseJoin(null).ok, false);
});

Deno.test("Turnstile: only an explicit success passes", async () => {
  const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  assertEquals(await verifyTurnstile("s", "t", "1.2.3.4", reply(200, { success: true })), true);
  assertEquals(await verifyTurnstile("s", "t", null, reply(200, { success: false, "error-codes": ["timeout-or-duplicate"] })), false);
  assertEquals(await verifyTurnstile("s", null, null, reply(200, { success: true })), false);
  assertEquals(await verifyTurnstile("s", "t", null, (async () => { throw new Error("down"); }) as unknown as typeof fetch), false);
  let sent = "";
  await verifyTurnstile("sec", "tok", "9.9.9.9", (async (_u: string, i: RequestInit) => { sent = String(i.body); return new Response('{"success":true}'); }) as unknown as typeof fetch);
  assertEquals(sent.includes("secret=sec") && sent.includes("response=tok") && sent.includes("remoteip=9.9.9.9"), true);
});

Deno.test("IP is only kept as a salted hash", async () => {
  const h = await hashIp("203.0.113.9", "salt");
  assertEquals(/^[0-9a-f]{64}$/.test(h), true);
  assertEquals(h === await hashIp("203.0.113.9", "other"), false);
});

Deno.test("city-open SMS: Indian mobiles only, link to sign-up", () => {
  const r = cityOpenRequest({ id: "1", first_name: "Sneha", phone: "+919829012345", city: "Pune", invite_code: "a1b2c3d4" }, "tpl", "https://likha.in/") as any;
  assertEquals(r.recipients[0], { mobiles: "919829012345", name: "Sneha", city: "Pune", link: "https://likha.in/start" });
  assertEquals(cityOpenRequest({ id: "2", first_name: "Omar", phone: "+971501234567", city: "Dubai", invite_code: "x" }, "tpl", "https://likha.in"), null);
});

Deno.test("Turnstile secret key test", async () => {
  const reply = (codes: string[]) => (async () => new Response(JSON.stringify({ success: false, "error-codes": codes }))) as unknown as typeof fetch;
  assertEquals((await testKey("TURNSTILE_SECRET_KEY", "k", undefined, reply(["invalid-input-response"]))).ok, true);
  assertEquals((await testKey("TURNSTILE_SECRET_KEY", "k", undefined, reply(["invalid-input-secret"]))).ok, false);
});
