import { deepStrictEqual as assertEquals } from "node:assert";
import { otpRequest, signHook, verifyHook } from "../functions/_shared/smshook.ts";

const secret = `v1,whsec_${btoa("a-32-byte-secret-for-the-sms-hook")}`;
const body = JSON.stringify({ user: { phone: "919414055302" }, sms: { otp: "482913" } });

Deno.test("SMS hook accepts Supabase's signature and nothing else", async () => {
  const now = 1_760_000_000_000, ts = now / 1000;
  const sig = await signHook(secret, "msg_1", ts, body);
  const h = (s: string, t = ts, id = "msg_1") => new Headers({ "webhook-id": id, "webhook-timestamp": String(t), "webhook-signature": s });
  assertEquals(await verifyHook(secret, h(sig), body, now), true);
  assertEquals(await verifyHook(secret, h(`v1,bogus ${sig}`), body, now), true);                     // one of several signatures
  assertEquals(await verifyHook(secret, h(sig), body.replace("482913", "000000"), now), false);       // body changed
  assertEquals(await verifyHook(secret, h(sig, ts, "msg_2"), body, now), false);                      // id changed
  assertEquals(await verifyHook(secret, h(sig), body, now + 10 * 60_000), false);                     // too old
  assertEquals(await verifyHook("", h(sig), body, now), false);
  assertEquals(await verifyHook(secret, new Headers(), body, now), false);
});

Deno.test("OTP goes to the DLT template with the code as a variable", () => {
  assertEquals(otpRequest("tpl-1", "919414055302", "482913"), { template_id: "tpl-1", short_url: "0", recipients: [{ mobiles: "919414055302", otp: "482913" }] });
});
