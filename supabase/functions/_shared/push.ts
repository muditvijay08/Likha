// OneSignal web push. One request per notification, to every device the member has (subscription ids saved by the app).
// API: POST https://api.onesignal.com/notifications?c=push   Authorization: Key <REST API key>

export type Outgoing = { id: number; user_id: string; title: string | null; body: string; link: string | null };

export function pushRequest(n: Outgoing, devices: string[], appId: string, site: string) {
  const link = n.link && /^\/[A-Za-z0-9/_?=&.-]*$/.test(n.link) ? n.link : "/home";       // only our own screens
  return {
    app_id: appId, target_channel: "push", include_subscription_ids: devices,
    headings: { en: (n.title || "Likha").slice(0, 60) }, contents: { en: n.body.slice(0, 180) },
    web_url: `${site.replace(/\/$/, "")}${link}`, ttl: 86_400, idempotency_key: `likha-${n.id}`,
  };
}

/** What OneSignal said: sent or not, and which device ids are dead (unsubscribed or unknown). */
export function readPushReply(status: number, body: unknown, devices: string[]): { ok: boolean; dead: string[]; note: string } {
  const b = (body ?? {}) as { id?: string; errors?: unknown };
  const errs = b.errors;
  let dead: string[] = [];
  if (errs && !Array.isArray(errs) && typeof errs === "object") {
    const o = errs as Record<string, unknown>;
    dead = [...((o.invalid_player_ids as string[]) ?? []), ...((o.invalid_subscription_ids as string[]) ?? [])].filter((x) => devices.includes(x));
  } else if (Array.isArray(errs) && errs.some((e) => /not subscribed/i.test(String(e)))) {
    dead = [...devices];                                                     // every device for this member is gone
  }
  if (status >= 500 || status === 429) return { ok: false, dead: [], note: `OneSignal ${status}: will retry` };
  if (status === 401 || status === 403) return { ok: false, dead: [], note: "OneSignal refused the key" };
  if (status >= 400) return { ok: false, dead, note: `OneSignal ${status}` };
  const sent = !!b.id && dead.length < devices.length;
  return { ok: sent || dead.length === devices.length, dead, note: sent ? "sent" : "no live devices" };
}
