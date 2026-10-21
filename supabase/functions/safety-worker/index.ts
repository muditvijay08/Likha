// Share my date: every 5 minutes. At check-in time the member gets "All good?" (in-app + push).
// 15 minutes later with no answer, each trusted contact gets an SMS, and the safety team sees the alert.
// Also deletes selfies kept for manual review once a person has decided.
// Cron (internal secret): */5 * * * *
import { key, loadKeys, mustKey } from "../_shared/keys.ts";
import { admin, isInternal, json, rpc } from "../_shared/db.ts";
import { sendSafetySms } from "../_shared/sms.ts";

Deno.serve(async (req) => {
  await loadKeys();
  if (!isInternal(req)) return json({ error: "internal only" }, 401);
  const due = await rpc<{ reminded: number; alerts: { share_id: string; member: string; place: string; starts_at: string; contacts: { name: string; phone: string }[] }[] }>("svc_due_checkins", {});
  let sent = 0, failed = 0;
  for (const a of due.alerts) {
    try {
      const r = await sendSafetySms({ member: a.member, place: a.place, startsAt: a.starts_at, contacts: a.contacts ?? [] });
      sent += r.sent; failed += r.skipped;
    } catch (e) {
      failed += (a.contacts ?? []).length;
      console.error("safety sms", a.share_id, (e as Error).message);
    }
  }
  const hook = key("LIKHA_ALERT_WEBHOOK");                     // the safety team's channel
  if (hook && due.alerts.length) {
    await fetch(hook, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `Date check-in missed: ${due.alerts.map((a) => `${a.member} at ${a.place}`).join("; ")}. SMS sent ${sent}, failed ${failed}.` }) }).catch(() => {});
  }
  // selfies kept for a person are deleted once decided
  const gone = await rpc<{ id: string; path: string }[]>("svc_selfies_to_delete", {}).catch(() => []);
  if (gone.length) {
    const { error } = await admin.storage.from("selfies").remove(gone.map((g) => g.path));
    if (!error) await rpc("svc_selfie_deleted", { p_ids: gone.map((g) => g.id) });
  }
  return json({ reminded: due.reminded, alerted: due.alerts.length, sms_sent: sent, sms_failed: failed, selfies_deleted: gone.length });
});
