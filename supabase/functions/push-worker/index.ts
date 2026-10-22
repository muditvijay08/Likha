// Push notifications, every minute. Takes what the database allows right now (svc_push_outbox: quiet hours, opt-ins,
// one offer a day, switched-off types; safety alerts always) and sends each to the member's devices through OneSignal.
// Members with no device are marked so; OneSignal outages are retried up to 3 times; dead devices are removed.
// Keys: ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY in Admin > Keys. Without them nothing is touched.
// Cron (internal secret): * * * * *
import { key, loadKeys } from "../_shared/keys.ts";
import { isInternal, json, rpc } from "../_shared/db.ts";
import { pushRequest, readPushReply, type Outgoing } from "../_shared/push.ts";

Deno.serve(async (req) => {
  await loadKeys();
  if (!isInternal(req)) return json({ error: "internal only" }, 401);
  const appId = key("ONESIGNAL_APP_ID"), restKey = key("ONESIGNAL_REST_API_KEY");
  if (!appId || !restKey) return json({ configured: false });
  const site = Deno.env.get("LIKHA_SITE") ?? "https://likha.in";
  const t0 = Date.now();
  const out = await rpc<Outgoing[]>("svc_push_outbox", { p_limit: 300 });
  if (!out.length) return json({ configured: true, sent: 0 });
  const devices = await rpc<Record<string, string[]>>("svc_push_devices", { p_users: [...new Set(out.map((n) => n.user_id))] });
  const sent: number[] = [], none: number[] = [], failed: number[] = [], dead: string[] = [];
  for (let i = 0; i < out.length; i += 10) {
    await Promise.all(out.slice(i, i + 10).map(async (n) => {
      const ids = devices[n.user_id] ?? [];
      if (!ids.length) { none.push(n.id); return; }
      try {
        const r = await fetch("https://api.onesignal.com/notifications?c=push", {
          method: "POST", headers: { "content-type": "application/json", authorization: `Key ${restKey}` },
          body: JSON.stringify(pushRequest(n, ids, appId, site)), signal: AbortSignal.timeout(15_000),
        });
        const v = readPushReply(r.status, await r.json().catch(() => null), ids);
        dead.push(...v.dead);
        if (!v.ok) failed.push(n.id); else if (v.dead.length === ids.length) none.push(n.id); else sent.push(n.id);
      } catch (e) {
        console.error("push", n.id, (e as Error).message);
        failed.push(n.id);
      }
    }));
  }
  await rpc("svc_push_result", { p_sent: sent, p_no_device: none, p_failed: failed, p_dead_tokens: dead, p_ms: Date.now() - t0 });
  return json({ configured: true, sent: sent.length, no_device: none.length, failed: failed.length, dead_devices: dead.length });
});
