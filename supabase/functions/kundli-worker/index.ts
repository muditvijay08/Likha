// Builds kundlis: claims queued jobs, calls the Python kundli service, saves results (and every Jodi Score).
// Cron every minute (internal secret). Also safe to call right after a member saves birth details.
import { key, loadKeys, mustKey } from "../_shared/keys.ts";
import { isInternal, json, rpc } from "../_shared/db.ts";

Deno.serve(async (req) => {
  await loadKeys();
  if (!isInternal(req)) return json({ error: "internal only" }, 401);
  const jobs = await rpc<any[]>("svc_kundli_claim", { p_limit: 20 });
  let done = 0, failed = 0;
  await Promise.all(jobs.map(async (j) => {
    try {
      const res = await fetch(`${mustKey("KUNDLI_URL")}/v1/chart`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-likha-key": mustKey("KUNDLI_KEY") },
        body: JSON.stringify({ birth_date: j.birth_date, birth_time: String(j.birth_time).slice(0, 5), lat: Number(j.lat),
          lng: Number(j.lng), tz_name: j.tz_name, borderline_minutes: 5 }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`kundli ${res.status}: ${await res.text()}`);
      const chart = await res.json();
      await rpc("svc_save_kundli", { p_user: j.user_id, p_chart: chart });
      done++;
    } catch (e) {
      failed++;
      await rpc("svc_kundli_failed", { p_user: j.user_id, p_error: String((e as Error).message) });
    }
  }));
  return json({ claimed: jobs.length, done, failed });
});
