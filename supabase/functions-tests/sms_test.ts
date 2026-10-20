import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { alertText, indianMobile, sendSafetySms } from "../functions/_shared/sms.ts";

Deno.test("Indian mobile numbers, however typed", () => {
  assertEquals(indianMobile("+91 94140 55302"), "919414055302");
  assertEquals(indianMobile("09414055302"), "919414055302");
  assertEquals(indianMobile("9414055302"), "919414055302");
  assertEquals(indianMobile("12345"), null);
  assertEquals(indianMobile("+1 415 555 0100"), null);
});

Deno.test("alert text names the member, place and time, and says call 112", () => {
  const t = alertText({ member: "Aarav", place: "Neel Rooftop Cafe", startsAt: "2026-10-24T13:30:00Z", contacts: [] }, "Priya");
  assert(t.includes("Aarav") && t.includes("Neel Rooftop Cafe") && t.includes("7:00") && t.includes("112"));
});

Deno.test("one MSG91 flow call per valid contact; bad numbers skipped", async () => {
  Deno.env.set("MSG91_AUTH_KEY", "k"); Deno.env.set("MSG91_SAFETY_TEMPLATE_ID", "tpl");
  const calls: any[] = [];
  const fake = (async (_u: string, init: RequestInit) => { calls.push(JSON.parse(String(init.body))); return new Response("{}"); }) as unknown as typeof fetch;
  const r = await sendSafetySms({ member: "Aarav", place: "Cafe", startsAt: "2026-10-24T13:30:00Z",
    contacts: [{ name: "Priya", phone: "+91 94140 55302" }, { name: "X", phone: "123" }] }, fake);
  assertEquals(r, { sent: 1, skipped: 1 });
  assertEquals(calls[0].recipients[0].mobiles, "919414055302");
  assertEquals(calls[0].template_id, "tpl");
});
