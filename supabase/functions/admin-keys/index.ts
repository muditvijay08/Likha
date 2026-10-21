// Admin > Keys and Admin > AI models: the two buttons that need a server.
//   {action:"test_key", key, mode}   keys.manage    reads the stored key, makes one read-only call, records pass/fail
//   {action:"test_model", model}     settings.write one short answer (text) or one labelled picture (image); cost is logged
// Team members only (MFA is enforced by has_perm). Values never leave this function.
import { Jimp } from "npm:jimp@1.6.0";
import { asUser, rpc } from "../_shared/db.ts";
import { loadKeys } from "../_shared/keys.ts";
import { PAIRED, testKey } from "../_shared/keytest.ts";
import { callLLM } from "../_shared/llm.ts";
import { generateImage, stampImagined } from "../_shared/image.ts";

const TEST_PROMPT = "A warm, painterly illustration (clearly artwork) of the two people in the reference pictures sharing chai on a terrace at sunset. No text.";

/** Two plain stand-in portraits, so a test never uses a member's photo. */
async function standIns() {
  const make = async (bg: number, face: number) => {
    const img = new Jimp({ width: 512, height: 512, color: bg });
    img.scan(156, 96, 200, 240, (x, y, idx) => {
      const dx = (x - 256) / 100, dy = (y - 216) / 120;
      if (dx * dx + dy * dy <= 1) { img.bitmap.data.writeUInt32BE(face, idx); }
    });
    return new Uint8Array(await img.getBuffer("image/jpeg", { quality: 85 }));
  };
  return [{ mime: "image/jpeg", data: await make(0x7e5befff, 0xf2c6a0ff) }, { mime: "image/jpeg", data: await make(0xe8456bff, 0x8d5a3bff) }];
}

// The admin app has its own address (LIKHA_ADMIN_SITE, e.g. https://admin.likha.in).
const H = { "access-control-allow-origin": Deno.env.get("LIKHA_ADMIN_SITE") ?? "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS", "content-type": "application/json" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: H });

const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  const u = await asUser(req);
  if (!u) return json({ error: "sign in" }, 401);
  const body = await req.json().catch(() => ({}));
  const allowed = async (perm: string) => (await u.client.rpc("has_perm", { p_perm: perm })).data === true;

  if (body.action === "test_key") {
    if (!(await allowed("keys.manage"))) return json({ error: "not allowed" }, 403);
    const value = await rpc<string | null>("svc_api_key", { p_key: body.key, p_mode: body.mode });
    if (!value) return json({ ok: false, note: "Not set" });
    const pair = PAIRED[body.key];
    const other = pair ? (await rpc<string | null>("svc_api_key", { p_key: pair, p_mode: body.mode })) ?? (await rpc<string | null>("svc_api_key", { p_key: pair, p_mode: "any" })) ?? undefined : undefined;
    const r = await testKey(body.key, value, other);
    await rpc("svc_key_tested", { p_key: body.key, p_mode: body.mode, p_ok: r.ok, p_note: r.note });
    return json(r);
  }

  if (body.action === "test_model") {
    if (!(await allowed("settings.write"))) return json({ error: "not allowed" }, 403);
    await loadKeys(0);                                                    // a key set a moment ago counts
    const { data: m } = await u.client.from("ai_models").select("model,provider,kind").eq("model", body.model).maybeSingle();
    if (!m) return json({ error: "unknown model" }, 404);
    const t0 = Date.now();
    try {
      if (m.kind === "image") {
        const img = await generateImage(m.provider, m.model, TEST_PROMPT, await standIns());
        const jpg = await stampImagined(img.bytes);
        const ms = Date.now() - t0;
        const cost = await rpc<number>("svc_log_test_call", { p_model: m.model, p_in: 0, p_out: 1, p_ok: true, p_latency_ms: ms });
        const note = `1 picture in ${(ms / 1000).toFixed(0)} s, ₹${(cost / 100).toFixed(2)}`;
        await rpc("svc_model_tested", { p_model: m.model, p_ok: true, p_note: note });
        return json({ ok: true, note, preview: `data:image/jpeg;base64,${b64(jpg)}` });
      }
      const r = await callLLM(m.provider, { model: m.model, system: "You are a connection test. Reply with the single word OK.", messages: [{ role: "user", content: "Test" }], maxTokens: 10, temperature: 0 }, 30_000);
      const ms = Date.now() - t0;
      await rpc("svc_log_test_call", { p_model: m.model, p_in: r.inputTokens, p_out: r.outputTokens, p_ok: true, p_latency_ms: ms });
      const note = `Answered "${r.text.trim().slice(0, 20)}" in ${(ms / 1000).toFixed(1)} s`;
      await rpc("svc_model_tested", { p_model: m.model, p_ok: true, p_note: note });
      return json({ ok: true, note });
    } catch (e) {
      const note = (e as Error).message.slice(0, 180);
      await rpc("svc_log_test_call", { p_model: m.model, p_in: 0, p_out: 0, p_ok: false, p_error: note, p_latency_ms: Date.now() - t0 }).catch(() => {});
      await rpc("svc_model_tested", { p_model: m.model, p_ok: false, p_note: note }).catch(() => {});
      return json({ ok: false, note });
    }
  }
  return json({ error: "unknown action" }, 400);
});
