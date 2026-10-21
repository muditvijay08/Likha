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
    case "LIKHA_ALERT_WEBHOOK":
      return probe(fetcher, value, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Likha admin: test alert. You can ignore this." }) },
        "Webhook", [200, 201, 202, 204]);
    default:
      return Promise.resolve({ ok: false, note: "No direct test for this key" });
  }
}

/** Which other key a test needs, if any. */
export const PAIRED: Record<string, string> = { RAZORPAY_KEY_SECRET: "RAZORPAY_KEY_ID", RAZORPAYX_KEY_SECRET: "RAZORPAYX_KEY_ID", KUNDLI_KEY: "KUNDLI_URL" };
