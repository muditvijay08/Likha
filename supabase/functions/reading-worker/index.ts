// Every minute: writes any paid reading still waiting (the app closed, a gift was just opened, a crush just joined,
// both finished Seven Questions). Gives up after 5 tries and refunds. Cron with the internal secret: * * * * *
import { key, loadKeys, mustKey } from "../_shared/keys.ts";
import { json, isInternal, rpc } from "../_shared/db.ts";

Deno.serve(async (req) => {
  await loadKeys();
  if (!isInternal(req)) return json({ error: "internal only" }, 401);
  const ids = await rpc<string[]>("svc_readings_to_write", { p_limit: 20 });
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-gateway`;
  const results = await Promise.allSettled(ids.map((id) => fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-likha-internal": Deno.env.get("LIKHA_INTERNAL_SECRET")!,
               authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
    body: JSON.stringify({ action: "reading", reading_id: id }),
  }).then((r) => r.json())));
  const done = results.filter((r) => r.status === "fulfilled" && (r.value as { ok?: boolean }).ok).length;
  return json({ picked: ids.length, written: done, waiting: ids.length - done });
});
