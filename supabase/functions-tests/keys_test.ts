import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { _useKeys, key, loadKeys, mustKey, paymentsMode } from "../functions/_shared/keys.ts";
import { testKey } from "../functions/_shared/keytest.ts";
import { createOrder } from "../functions/_shared/razorpay.ts";

Deno.test("keys: Admin value wins, function secret is the fallback, missing key says where to set it", async () => {
  Deno.env.set("OPENAI_API_KEY", "from-env");
  _useKeys({ ANTHROPIC_API_KEY: "from-admin", PAYMENTS_MODE: "live" });
  assertEquals(key("ANTHROPIC_API_KEY"), "from-admin");
  assertEquals(key("OPENAI_API_KEY"), "from-env");
  assertEquals(paymentsMode(), "live");
  try { mustKey("FAL_KEY"); assert(false); } catch (e) { assert((e as Error).message.includes("Admin > Keys")); }
  let calls = 0;
  _useKeys({}, async () => { calls++; return { FAL_KEY: "fal-1" }; });
  await loadKeys(); await loadKeys();
  assertEquals([calls, key("FAL_KEY")], [1, "fal-1"]);                   // cached for a minute
  _useKeys({ FAL_KEY: "fal-1" }, async () => { throw new Error("db down"); });
  await loadKeys();
  assertEquals(key("FAL_KEY"), "fal-1");                                   // keeps the last good copy
});

Deno.test("Razorpay orders use the key pair the payments switch picked", async () => {
  _useKeys({ RAZORPAY_KEY_ID: "rzp_live_L1", RAZORPAY_KEY_SECRET: "live-secret" });
  let auth = "";
  await createOrder(9900, "r1", {}, (async (_u: string, init: RequestInit) => {
    auth = (init.headers as Record<string, string>).authorization;
    return new Response(JSON.stringify({ id: "order_1", amount: 9900, currency: "INR" }));
  }) as unknown as typeof fetch);
  assertEquals(auth, `Basic ${btoa("rzp_live_L1:live-secret")}`);
});

Deno.test("key tests: one read-only call each, 401 means the key was refused", async () => {
  const seen: string[] = [];
  const fake = (status: number) => (async (u: string, init: RequestInit) => { seen.push(`${init.method ?? "GET"} ${u}`); return new Response("{}", { status }); }) as unknown as typeof fetch;
  assertEquals((await testKey("ANTHROPIC_API_KEY", "k", undefined, fake(200))).ok, true);
  const bad = await testKey("OPENAI_API_KEY", "k", undefined, fake(401));
  assertEquals([bad.ok, bad.note.includes("refused")], [false, true]);
  assertEquals((await testKey("RAZORPAY_KEY_SECRET", "s", undefined, fake(200))).note, "Set the key id for this mode first");
  assertEquals((await testKey("RAZORPAY_KEY_SECRET", "s", "rzp_test_1", fake(200))).ok, true);
  assertEquals((await testKey("KUNDLI_KEY", "k", "https://kundli.likha.in/", fake(422))).ok, true);    // key accepted, body refused
  assertEquals((await testKey("KUNDLI_KEY", "k", "https://kundli.likha.in", fake(401))).ok, false);
  assertEquals((await testKey("FAL_KEY", "k", undefined, fake(200))).ok, false);
  assert(seen.every((s) => s.startsWith("GET ") || s.includes("/v1/chart")), seen.join(", "));
  assert(seen.includes("POST https://kundli.likha.in/v1/chart"));
});
