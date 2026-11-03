// Admin > Keys > Test: one cheap, read-only call per provider. Never spends money, never sends a message to a member.
export interface KeyTest { ok: boolean; note: string }

const basic = (id: string, secret: string) => `Basic ${btoa(`${id}:${secret}`)}`;

async function probe(fetcher: typeof fetch, url: string, init: RequestInit, label: string, okStatuses = [200]): Promise<KeyTest> {
  try {
    const res = await fetcher(url, { ...init, signal: AbortSignal.timeout(15_000) });
    if (okStatuses.includes(res.status)) return { ok: true, note: `${label} answered ${res.status}` };
    if (res.status === 401 || res.status === 403) return { ok: false, note: `${label} refused the key (${res.status})` };
    return { ok: false, note: `${label} answered ${res.status}` };
  } catch (e) {
    return { ok: false, note: `${label} unreachable: ${(e as Error).message.slice(0, 80)}` };
  }
}

/** `other` holds the paired value a test needs: the key id for a secret, the address for the kundli key. */
export function testKey(name: string, value: string, other: string | undefined, fetcher: typeof fetch = fetch): Promise<KeyTest> {
  switch (name) {
    case "ANTHROPIC_API_KEY":
      return probe(fetcher, "https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": value, "anthropic-version": "2023-06-01" } }, "Anthropic");
    case "GEMINI_API_KEY":
      return probe(fetcher, "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { headers: { "x-goog-api-key": value } }, "Google");
    case "OPENAI_API_KEY":
      return probe(fetcher, "https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${value}` } }, "OpenAI");
    case "RAZORPAY_KEY_SECRET":
      if (!other) return Promise.resolve({ ok: false, note: "Set the key id for this mode first" });
      return probe(fetcher, "https://api.razorpay.com/v1/orders?count=1", { headers: { authorization: basic(other, value) } }, "Razorpay");
    case "RAZORPAYX_KEY_SECRET":
      if (!other) return Promise.resolve({ ok: false, note: "Set the key id for this mode first" });
      return probe(fetcher, "https://api.razorpay.com/v1/contacts?count=1", { headers: { authorization: basic(other, value) } }, "RazorpayX");
    case "KUNDLI_KEY":
      if (!other) return Promise.resolve({ ok: false, note: "Set the kundli service address first" });
      // an empty body is refused as invalid (422) only after the key is accepted
      return probe(fetcher, `${other.replace(/\/$/, "")}/v1/chart`, { method: "POST", headers: { "content-type": "application/json", "x-likha-key": value }, body: "{}" },
        "Kundli service", [200, 400, 422]);
    case "ONESIGNAL_REST_API_KEY":
      if (!other) return Promise.resolve({ ok: false, note: "Set the OneSignal app id first" });
      // reads the app's last notification: proves the key and app id match, sends nothing
      return probe(fetcher, `https://api.onesignal.com/notifications?app_id=${encodeURIComponent(other)}&limit=1`, { headers: { authorization: `Key ${value}` } }, "OneSignal");
    case "TURNSTILE_SECRET_KEY":
      // a dummy token: Cloudflare answers "invalid-input-response" for a good secret, "invalid-input-secret" for a bad one
      return (async (): Promise<KeyTest> => {
        try {
          const r = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: new URLSearchParams({ secret: value, response: "likha-admin-test" }), signal: AbortSignal.timeout(15_000) });
          const j = await r.json().catch(() => ({})) as { "error-codes"?: string[] };
          const codes = j["error-codes"] ?? [];
          if (codes.includes("invalid-input-secret") || codes.includes("missing-input-secret")) return { ok: false, note: "Cloudflare refused the secret key" };
          return r.ok ? { ok: true, note: "Cloudflare accepted the secret key" } : { ok: false, note: `Cloudflare answered ${r.status}` };
        } catch (e) { return { ok: false, note: `Cloudflare unreachable: ${(e as Error).message.slice(0, 80)}` }; }
      })();
    case "LIKHA_ALERT_WEBHOOK":
      return probe(fetcher, value, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Likha admin: test alert. You can ignore this." }) },
        "Webhook", [200, 201, 202, 204]);
    // ---- social (Admin > Social). Read-only checks; LinkedIn's only proof of posting rights is reserving an upload slot.
    case "META_PAGE_TOKEN":
      return probe(fetcher, `https://graph.facebook.com/v23.0/me?fields=id,name&access_token=${encodeURIComponent(value)}`, {}, "Meta");
    case "LINKEDIN_TOKEN":
      if (!other) return Promise.resolve({ ok: false, note: "Set the LinkedIn author (page or person) first" });
      return probe(fetcher, "https://api.linkedin.com/rest/images?action=initializeUpload", { method: "POST",
        headers: { authorization: `Bearer ${value}`, "LinkedIn-Version": "202510", "X-Restli-Protocol-Version": "2.0.0", "content-type": "application/json" },
        body: JSON.stringify({ initializeUploadRequest: { owner: other } }) }, "LinkedIn");
    case "X_ACCESS_SECRET":
      return (async (): Promise<KeyTest> => {
        const o = JSON.parse(other ?? "{}") as Record<string, string>;
        if (!o.X_API_KEY || !o.X_API_SECRET || !o.X_ACCESS_TOKEN) return { ok: false, note: "Set the other three X keys first" };
        const { oauth1 } = await import("./social_publish.ts");
        const url = "https://api.x.com/2/users/me";
        const auth = await oauth1("GET", url, { key: o.X_API_KEY, secret: o.X_API_SECRET, token: o.X_ACCESS_TOKEN, tokenSecret: value });
        return probe(fetcher, url, { headers: { authorization: auth } }, "X");
      })();
    case "YOUTUBE_REFRESH_TOKEN":
      return (async (): Promise<KeyTest> => {
        const o = JSON.parse(other ?? "{}") as Record<string, string>;
        if (!o.YOUTUBE_CLIENT_ID || !o.YOUTUBE_CLIENT_SECRET) return { ok: false, note: "Set the YouTube client id and secret first" };
        const { youtubeToken } = await import("./social_publish.ts");
        const token = await youtubeToken(fetcher, { clientId: o.YOUTUBE_CLIENT_ID, clientSecret: o.YOUTUBE_CLIENT_SECRET, refresh: value }).catch(() => null);
        if (!token) return { ok: false, note: "Google refused the refresh token" };
        return probe(fetcher, "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { authorization: `Bearer ${token}` } }, "YouTube");
      })();
    default:
      return Promise.resolve({ ok: false, note: "No direct test for this key" });
  }
}

/** Which other key a test needs, if any. */
/** A list means the test gets all of them, as a JSON object. */
export const PAIRED: Record<string, string | string[]> = { RAZORPAY_KEY_SECRET: "RAZORPAY_KEY_ID", RAZORPAYX_KEY_SECRET: "RAZORPAYX_KEY_ID", KUNDLI_KEY: "KUNDLI_URL",
  ONESIGNAL_REST_API_KEY: "ONESIGNAL_APP_ID", LINKEDIN_TOKEN: "LINKEDIN_AUTHOR_URN", X_ACCESS_SECRET: ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN"],
  YOUTUBE_REFRESH_TOKEN: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"] };
