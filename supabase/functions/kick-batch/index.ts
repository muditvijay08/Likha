// Daily Kicks, written overnight.
// Claude: Message Batches API (half the price of live calls). Gemini / GPT: live calls, 300 members per run.
// Cron (internal secret):  {"step":"submit"} at 00:30 IST   ->  {"step":"collect"} every 15 min 01:00-05:00 IST
import { batchResults, batchStatus, createBatch, type ClaudeRequest } from "../_shared/anthropic.ts";
import { callLLM } from "../_shared/llm.ts";
import { allowedFrom, cleanName, estimateTokens, kickPrompt, numberCheck, parseJson, readableText, styleCheck } from "../_shared/core.ts";
import { admin, isInternal, json, rpc } from "../_shared/db.ts";

const istToday = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

async function kickProvider(): Promise<string> {
  const { data: f } = await admin.from("ai_features").select("model").eq("key", "daily_kick").single();
  const { data: m } = await admin.from("ai_models").select("provider").eq("model", f?.model ?? "").single();
  return m?.provider ?? "anthropic";
}

function kickOk(out: any, ks: unknown) {
  const t = out ? readableText(out) : "";
  return !!out?.teaser && !!out?.content && numberCheck(t, allowedFrom(ks), { otherNumbers: false }).ok && styleCheck(t).ok;
}

// Gemini / GPT: no batch discount, so write kicks live, a slice per run, 5 at a time.
async function live(date: string, limit = 300) {
  const { data: templates } = await admin.from("kick_templates").select("key,template").eq("active", true);
  if (!templates?.length) return { saved: 0, reason: "no templates" };
  const targets = await rpc<any[]>("svc_kick_targets", { p_date: date, p_limit: limit });
  let saved = 0, failed = 0, stopped = false;
  for (let i = 0; i < targets.length && !stopped; i += 5) {
    await Promise.all(targets.slice(i, i + 5).map(async (t, j) => {
      const facts = { first_name: cleanName(t.first_name), lagna: t.summary.lagna, moon_sign: t.summary.moon_sign,
        nakshatra: t.summary.nakshatra, dasha_now: t.summary.current_dasha };
      const p = kickPrompt(templates[(i + j) % templates.length].template, facts, date);
      const hold = await rpc<any>("svc_ai_reserve", { p_user: t.user_id, p_feature: "daily_kick",
        p_est_input_tokens: estimateTokens(p.system, p.user) });
      if (!hold.ok) { stopped = true; return; }                   // budget reached
      try {
        const r = await callLLM(hold.provider, { model: hold.model, system: p.system, messages: [{ role: "user", content: p.user }],
          maxTokens: hold.max_output_tokens, temperature: hold.temperature });
        const out = parseJson(r.text);
        const ok = kickOk(out, t.summary);
        await rpc("svc_ai_finish", { p_call: hold.call_id, p_in: r.inputTokens, p_out: r.outputTokens, p_cache: r.cacheReadTokens,
          p_status: ok ? "ok" : "failed", p_number_check: ok, p_latency_ms: r.latencyMs, p_error: ok ? null : "kick failed checks" });
        if (ok) { await rpc("svc_save_kick", { p_user: t.user_id, p_date: date, p_teaser: out.teaser, p_content: out.content }); saved++; }
        else failed++;
      } catch (e) {
        failed++;
        await rpc("svc_ai_finish", { p_call: hold.call_id, p_in: 0, p_out: 0, p_cache: 0, p_status: "failed",
          p_error: String((e as Error).message) }).catch(() => {});
      }
    }));
  }
  return { mode: "live", saved, failed, budget_stop: stopped };
}

async function submit(date: string) {
  if (await kickProvider() !== "anthropic") return live(date);
  const { data: templates } = await admin.from("kick_templates").select("key,template").eq("active", true);
  if (!templates?.length) return { submitted: 0, reason: "no templates" };
  const targets = await rpc<any[]>("svc_kick_targets", { p_date: date, p_limit: 5000 });
  const items: { custom_id: string; req: ClaudeRequest }[] = [];
  const map: Record<string, { user_id: string; call_id: number }> = {};
  for (const [i, t] of targets.entries()) {
    const facts = { first_name: cleanName(t.first_name), lagna: t.summary.lagna, moon_sign: t.summary.moon_sign,
      nakshatra: t.summary.nakshatra, dasha_now: t.summary.current_dasha };
    const tpl = templates[i % templates.length];
    const p = kickPrompt(tpl.template, facts, date);
    const hold = await rpc<any>("svc_ai_reserve", { p_user: t.user_id, p_feature: "daily_kick",
      p_est_input_tokens: estimateTokens(p.system, p.user), p_batch: true });
    if (!hold.ok) break;                                           // budget reached: the rest get tomorrow's
    const id = `k${i}`;
    map[id] = { user_id: t.user_id, call_id: hold.call_id };
    items.push({ custom_id: id, req: { model: hold.model, system: p.system, messages: [{ role: "user", content: p.user }],
      maxTokens: hold.max_output_tokens, temperature: hold.temperature, cacheSystem: true } });
  }
  if (!items.length) return { submitted: 0 };
  let batchId: string;
  try {
    batchId = await createBatch(items);
  } catch (e) {                                                    // release the budget holds
    for (const it of Object.values(map)) {
      await rpc("svc_ai_finish", { p_call: it.call_id, p_in: 0, p_out: 0, p_cache: 0, p_status: "failed", p_error: "batch not created" });
    }
    throw e;
  }
  await admin.from("ai_batches").insert({ id: batchId, feature: "daily_kick", for_date: date, items: map });
  return { submitted: items.length, batch: batchId };
}

async function collect() {
  const { data: open } = await admin.from("ai_batches").select("*").eq("status", "submitted");
  let saved = 0, failed = 0;
  for (const b of open ?? []) {
    const st = await batchStatus(b.id);
    if (!st.done || !st.resultsUrl) continue;
    for await (const r of batchResults(st.resultsUrl)) {
      const it = b.items[r.custom_id];
      if (!it) continue;
      const out = r.ok ? parseJson(r.text) : null;
      const { data: ks } = await admin.from("kundli_summary").select("lagna,moon_sign,nakshatra,current_dasha").eq("user_id", it.user_id).single();
      const ok = kickOk(out, ks);
      await rpc("svc_ai_finish", { p_call: it.call_id, p_in: r.inputTokens, p_out: r.outputTokens, p_cache: r.cacheReadTokens,
        p_status: ok ? "ok" : "failed", p_number_check: ok, p_batch: true, p_error: ok ? null : "kick failed checks" });
      if (ok) { await rpc("svc_save_kick", { p_user: it.user_id, p_date: b.for_date, p_teaser: out.teaser, p_content: out.content }); saved++; }
      else failed++;                                                // no kick today for this member: nothing was charged
    }
    await admin.from("ai_batches").update({ status: "collected", collected_at: new Date().toISOString() }).eq("id", b.id);
  }
  return { saved, failed };
}

Deno.serve(async (req) => {
  if (!isInternal(req)) return json({ error: "internal only" }, 401);
  const { step, date } = await req.json().catch(() => ({}));
  try {
    if (step === "submit") return json(await submit(date ?? istToday()));
    if (step === "collect") {
      const done = await collect();                                 // finish any Claude batches still open
      return json(await kickProvider() === "anthropic" ? done : { ...done, ...(await live(date ?? istToday())) });
    }
    return json({ error: "step must be submit or collect" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message) }, 500);
  }
});
