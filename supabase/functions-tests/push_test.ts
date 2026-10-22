import { deepStrictEqual as assertEquals } from "node:assert";
import { pushRequest, readPushReply } from "../functions/_shared/push.ts";
import { testKey } from "../functions/_shared/keytest.ts";

const n = { id: 42, user_id: "u1", title: "Someone likes you", body: "Open Likha to see who.", link: "/likes" };

Deno.test("push request: member's devices, our own screen, one send per notification", () => {
  const r = pushRequest(n, ["d1", "d2"], "app-1", "https://likha.in/");
  assertEquals(r.include_subscription_ids, ["d1", "d2"]);
  assertEquals(r.web_url, "https://likha.in/likes");
  assertEquals(r.idempotency_key, "likha-42");
  assertEquals(pushRequest({ ...n, link: "https://evil.example" }, ["d1"], "a", "https://likha.in").web_url, "https://likha.in/home");
  assertEquals(pushRequest({ ...n, title: null }, ["d1"], "a", "https://likha.in").headings.en, "Likha");
});

Deno.test("push reply: sent, dead devices, outages retried, refused key", () => {
  assertEquals(readPushReply(200, { id: "n1" }, ["d1"]), { ok: true, dead: [], note: "sent" });
  assertEquals(readPushReply(200, { id: "n1", errors: { invalid_player_ids: ["d2"] } }, ["d1", "d2"]).dead, ["d2"]);
  const gone = readPushReply(200, { id: "", errors: ["All included players are not subscribed"] }, ["d1", "d2"]);
  assertEquals([gone.ok, gone.dead, gone.note], [true, ["d1", "d2"], "no live devices"]);
  assertEquals(readPushReply(503, null, ["d1"]).ok, false);
  assertEquals(readPushReply(401, { errors: ["bad key"] }, ["d1"]).note, "OneSignal refused the key");
});

Deno.test("OneSignal key test reads, never sends", async () => {
  let seen = "";
  const f = (async (u: string, init?: RequestInit) => { seen = `${init?.method ?? "GET"} ${u} ${(init?.headers as Record<string, string>).authorization}`; return new Response("{}", { status: 200 }); }) as typeof fetch;
  const r = await testKey("ONESIGNAL_REST_API_KEY", "rk", "app-1", f);
  assertEquals(r.ok, true);
  assertEquals(seen, "GET https://api.onesignal.com/notifications?app_id=app-1&limit=1 Key rk");
  assertEquals((await testKey("ONESIGNAL_REST_API_KEY", "rk", undefined, f)).ok, false);
});
