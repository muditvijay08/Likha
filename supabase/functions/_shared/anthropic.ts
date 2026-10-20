// Thin Claude API client: Messages + Message Batches. Docs: https://docs.claude.com/en/api/messages
const API = "https://api.anthropic.com/v1";
const VERSION = "2023-06-01";

export interface ClaudeResult {
  text: string;
  inputTokens: number;       // includes cache writes (billed at 1.25x, rounded up)
  outputTokens: number;
  cacheReadTokens: number;
  latencyMs: number;
  stopReason: string;
}

export interface ClaudeRequest {
  model: string;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens: number;
  temperature: number;
  cacheSystem?: boolean;     // cache long, repeated system prompts (Saathi, Guru)
}

function headers() {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");
  return { "x-api-key": key, "anthropic-version": VERSION, "content-type": "application/json" };
}

function body(r: ClaudeRequest) {
  return {
    model: r.model,
    max_tokens: r.maxTokens,
    temperature: r.temperature,
    system: r.cacheSystem ? [{ type: "text", text: r.system, cache_control: { type: "ephemeral" } }] : r.system,
    messages: r.messages,
  };
}

function usage(u: any) {
  return {
    inputTokens: (u?.input_tokens ?? 0) + Math.ceil((u?.cache_creation_input_tokens ?? 0) * 1.25),
    outputTokens: u?.output_tokens ?? 0,
    cacheReadTokens: u?.cache_read_input_tokens ?? 0,
  };
}

export async function callClaude(r: ClaudeRequest, timeoutMs = 45_000): Promise<ClaudeResult> {
  const started = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(`${API}/messages`, { method: "POST", headers: headers(), body: JSON.stringify(body(r)), signal: ctl.signal });
      if (res.status === 429 || res.status === 529 || res.status >= 500) {          // busy: back off and retry
        await new Promise((ok) => setTimeout(ok, 800 * 2 ** attempt + Math.random() * 300));
        continue;
      }
      const j = await res.json();
      if (!res.ok) throw new Error(`claude ${res.status}: ${j?.error?.message ?? "error"}`);
      const text = (j.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
      return { text, ...usage(j.usage), latencyMs: Date.now() - started, stopReason: j.stop_reason };
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error("claude busy after 3 tries");
}

// ---- Batches (Daily Kicks at half price) ----
export async function createBatch(items: { custom_id: string; req: ClaudeRequest }[]): Promise<string> {
  const res = await fetch(`${API}/messages/batches`, {
    method: "POST", headers: headers(),
    body: JSON.stringify({ requests: items.map((i) => ({ custom_id: i.custom_id, params: body(i.req) })) }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`batch create ${res.status}: ${j?.error?.message}`);
  return j.id;
}

export async function batchStatus(id: string): Promise<{ done: boolean; resultsUrl?: string }> {
  const res = await fetch(`${API}/messages/batches/${id}`, { headers: headers() });
  const j = await res.json();
  return { done: j.processing_status === "ended", resultsUrl: j.results_url };
}

export async function* batchResults(url: string): AsyncGenerator<{ custom_id: string; ok: boolean; text: string; inputTokens: number; outputTokens: number; cacheReadTokens: number }> {
  const res = await fetch(url, { headers: headers() });
  const lines = (await res.text()).split("\n").filter(Boolean);
  for (const line of lines) {
    const r = JSON.parse(line);
    const ok = r.result?.type === "succeeded";
    const m = r.result?.message;
    const text = ok ? (m.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("") : "";
    yield { custom_id: r.custom_id, ok, text, ...usage(m?.usage) };
  }
}
