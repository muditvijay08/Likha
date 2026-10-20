// One door to three writers: Claude, Gemini, GPT.
// Which one a feature uses is an admin setting (ai_features.model -> ai_models.provider). Nothing else changes:
// prompts, number check, style check, crisis handling, caps and cost logging are the same for all three.
import { callClaude, type ClaudeRequest, type ClaudeResult } from "./anthropic.ts";

export type Provider = "anthropic" | "gemini" | "openai";
export type LLMRequest = ClaudeRequest;
export type LLMResult = ClaudeResult;

function key(name: string) {
  const k = Deno.env.get(name);
  if (!k) throw new Error(`${name} missing`);
  return k;
}

async function post(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 429 || res.status >= 500) {                    // busy: back off and retry
      await new Promise((ok) => setTimeout(ok, 800 * 2 ** attempt + Math.random() * 300));
      continue;
    }
    const j = await res.json();
    if (!res.ok) throw Object.assign(new Error(`${new URL(url).host} ${res.status}: ${j?.error?.message ?? "error"}`), { status: res.status, body: j });
    return j;
  }
  throw new Error(`${new URL(url).host} busy after 3 tries`);
}

// ---- Gemini: https://ai.google.dev/api/generate-content
async function callGemini(r: LLMRequest, timeoutMs: number): Promise<LLMResult> {
  const started = Date.now();
  const j = await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(r.model)}:generateContent`,
    { "x-goog-api-key": key("GEMINI_API_KEY") },
    {
      systemInstruction: { parts: [{ text: r.system }] },
      contents: r.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { temperature: r.temperature, maxOutputTokens: r.maxTokens },
    },
    timeoutMs,
  );
  const cand = j.candidates?.[0];
  const text = (cand?.content?.parts ?? []).filter((p: any) => typeof p.text === "string" && !p.thought).map((p: any) => p.text).join("");
  const u = j.usageMetadata ?? {};
  const cached = u.cachedContentTokenCount ?? 0;
  return {
    text,
    inputTokens: (u.promptTokenCount ?? 0) - cached,
    outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),   // thinking is billed as output
    cacheReadTokens: cached,
    latencyMs: Date.now() - started,
    stopReason: cand?.finishReason ?? "unknown",
  };
}

// ---- OpenAI: https://platform.openai.com/docs/api-reference/chat
async function callOpenAI(r: LLMRequest, timeoutMs: number): Promise<LLMResult> {
  const started = Date.now();
  const body: Record<string, unknown> = {
    model: r.model,
    messages: [{ role: "system", content: r.system }, ...r.messages],
    max_completion_tokens: r.maxTokens,
    temperature: r.temperature,
  };
  let j: any;
  try {
    j = await post("https://api.openai.com/v1/chat/completions", { authorization: `Bearer ${key("OPENAI_API_KEY")}` }, body, timeoutMs);
  } catch (e) {
    // some reasoning models accept only the default temperature: retry once without it
    if ((e as any).status === 400 && /temperature/i.test(String((e as Error).message))) {
      delete body.temperature;
      j = await post("https://api.openai.com/v1/chat/completions", { authorization: `Bearer ${key("OPENAI_API_KEY")}` }, body, timeoutMs);
    } else throw e;
  }
  const u = j.usage ?? {};
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    text: j.choices?.[0]?.message?.content ?? "",
    inputTokens: (u.prompt_tokens ?? 0) - cached,
    outputTokens: u.completion_tokens ?? 0,                            // includes reasoning tokens
    cacheReadTokens: cached,
    latencyMs: Date.now() - started,
    stopReason: j.choices?.[0]?.finish_reason ?? "unknown",
  };
}

export async function callLLM(provider: Provider | string | undefined, r: LLMRequest, timeoutMs = 45_000): Promise<LLMResult> {
  switch (provider ?? "anthropic") {
    case "anthropic": return await callClaude(r, timeoutMs);
    case "gemini": return await callGemini(r, timeoutMs);
    case "openai": return await callOpenAI(r, timeoutMs);
    default: throw new Error(`unknown provider ${provider}`);
  }
}
