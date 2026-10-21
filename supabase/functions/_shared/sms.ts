// SMS through MSG91 (the same account that sends login OTPs). DLT rules in India need a pre-approved template:
// MSG91_SAFETY_TEMPLATE_ID is the Flow template for the date-safety alert, with variables name, place, time, link.
// Secrets: MSG91_AUTH_KEY, MSG91_SAFETY_TEMPLATE_ID.
import { key } from "./keys.ts";

/** "+91 94140 55302" -> "919414055302". Anything that isn't an Indian mobile returns null (we never guess). */
export function indianMobile(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return /^91[6-9]\d{9}$/.test(d) ? d : null;
}

export interface SafetyAlert { member: string; place: string; startsAt: string; contacts: { name: string; phone: string }[] }

/** What the contact reads (also the template text registered on DLT). */
export function alertText(a: SafetyAlert, contactName: string): string {
  const t = new Date(a.startsAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
  return `Hi ${contactName}, ${a.member} shared a date with you on Likha (${a.place}, ${t}) and hasn't checked in. Please call them. If you can't reach them, call 112.`;
}

export async function sendSafetySms(a: SafetyAlert, fetcher: typeof fetch = fetch): Promise<{ sent: number; skipped: number }> {
  const authKey = key("MSG91_AUTH_KEY"), template = key("MSG91_SAFETY_TEMPLATE_ID");
  if (!authKey || !template) throw new Error("MSG91 is not set up");
  let sent = 0, skipped = 0;
  for (const c of a.contacts) {
    const mobile = indianMobile(c.phone);
    if (!mobile) { skipped++; continue; }
    const t = new Date(a.startsAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
    const res = await fetcher("https://control.msg91.com/api/v5/flow", {
      method: "POST", headers: { "content-type": "application/json", authkey: authKey },
      body: JSON.stringify({ template_id: template, short_url: "0", recipients: [{ mobiles: mobile, name: c.name, member: a.member, place: a.place.slice(0, 30), time: t }] }),
    });
    if (res.ok) sent++; else skipped++;
  }
  return { sent, skipped };
}
