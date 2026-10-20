import { deepStrictEqual as assertEquals, ok as assert, rejects } from "node:assert";
import { callLLM } from "../functions/_shared/llm.ts";

Deno.env.set("ANTHROPIC_API_KEY", "a"); Deno.env.set("GEMINI_API_KEY", "g"); Deno.env.set("OPENAI_API_KEY", "o");
const REQ = { model: "m-1", system: "SYS", messages: [{ role: "user" as const, content: "hi" }, { role: "assistant" as const, content: "yo" },
  { role: "user" as const, content: "again" }], maxTokens: 300, temperature: 0.7 };

type Seen = { url: string; headers: Headers; body: any };
function mock(responses: { status: number; body: unknown }[]) {
  const seen: Seen[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen.push({ url, headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
    const r = responses[Math.min(seen.length - 1, responses.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
  return { seen, restore: () => { globalThis.fetch = real; } };
}

Deno.test("Claude: messages API shape and usage", async () => {
  const m = mock([{ status: 200, body: { content: [{ type: "text", text: "hello" }], stop_reason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 8 } } }]);
  try {
    const r = await callLLM("anthropic", REQ);
    assertEquals(m.seen[0].url, "https://api.anthropic.com/v1/messages");
    assertEquals(m.seen[0].headers.get("x-api-key"), "a");
    assertEquals(m.seen[0].body.system, "SYS");
    assertEquals([r.text, r.inputTokens, r.outputTokens, r.cacheReadTokens], ["hello", 110, 20, 50]);
  } finally { m.restore(); }
});

Deno.test("Gemini: generateContent shape, roles, thinking billed as output, cache not double counted", async () => {
  const m = mock([{ status: 200, body: { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "plan", thought: true }, { text: "namaste" }] } }],
    usageMetadata: { promptTokenCount: 120, cachedContentTokenCount: 40, candidatesTokenCount: 30, thoughtsTokenCount: 15 } } }]);
  try {
    const r = await callLLM("gemini", REQ);
    assert(m.seen[0].url.endsWith("/v1beta/models/m-1:generateContent"));
    assertEquals(m.seen[0].headers.get("x-goog-api-key"), "g");
    assertEquals(m.seen[0].body.systemInstruction.parts[0].text, "SYS");
    assertEquals(m.seen[0].body.contents.map((c: any) => c.role), ["user", "model", "user"]);
    assertEquals(m.seen[0].body.generationConfig, { temperature: 0.7, maxOutputTokens: 300 });
    assertEquals([r.text, r.inputTokens, r.outputTokens, r.cacheReadTokens], ["namaste", 80, 45, 40]);
  } finally { m.restore(); }
});

Deno.test("GPT: chat completions shape and usage", async () => {
  const m = mock([{ status: 200, body: { choices: [{ message: { content: "hey" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 90, completion_tokens: 12, prompt_tokens_details: { cached_tokens: 30 } } } }]);
  try {
    const r = await callLLM("openai", REQ);
    assertEquals(m.seen[0].url, "https://api.openai.com/v1/chat/completions");
    assertEquals(m.seen[0].headers.get("authorization"), "Bearer o");
    assertEquals(m.seen[0].body.messages[0], { role: "system", content: "SYS" });
    assertEquals(m.seen[0].body.max_completion_tokens, 300);
    assertEquals([r.text, r.inputTokens, r.outputTokens, r.cacheReadTokens], ["hey", 60, 12, 30]);
  } finally { m.restore(); }
});

Deno.test("GPT: model that refuses custom temperature is retried without it", async () => {
  const m = mock([{ status: 400, body: { error: { message: "Unsupported value: 'temperature' does not support 0.7" } } },
                  { status: 200, body: { choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 5, completion_tokens: 1 } } }]);
  try {
    const r = await callLLM("openai", REQ);
    assertEquals(r.text, "ok");
    assert(!("temperature" in m.seen[1].body));
  } finally { m.restore(); }
});

Deno.test("Busy provider is retried, then succeeds", async () => {
  const m = mock([{ status: 429, body: {} }, { status: 200, body: { candidates: [{ content: { parts: [{ text: "x" }] } }], usageMetadata: {} } }]);
  try {
    assertEquals((await callLLM("gemini", REQ)).text, "x");
    assertEquals(m.seen.length, 2);
  } finally { m.restore(); }
});

Deno.test("Unknown provider and missing key fail clearly", async () => {
  await rejects(() => callLLM("mistral", REQ), /unknown provider/);
  Deno.env.delete("GEMINI_API_KEY");
  await rejects(() => callLLM("gemini", REQ), /GEMINI_API_KEY missing/);
});
