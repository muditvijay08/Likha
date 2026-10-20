// Daily Kicks, written overnight.
// 1. Facts: today's Moon and each member's Tara bala / Chandrashtama from the kundli service (/v1/day), and the city's
//    sunrise, Rahu Kaal and planetary hours (panchang.ts). Scores and times are never written by the model.
// 2. Words: the model adds a headline, a line, three small fixes and a first-date answer.
// Claude: Message Batches API (half price). Gemini / GPT: live calls, 300 members per run.
// Cron (internal secret):  {"step":"submit"} at 00:30 IST   ->  {"step":"collect"} every 15 min 01:00-05:00 IST
import { batchResults, batchStatus, createBatch, type ClaudeRequest } from "../_shared/anthropic.ts";
import { cleanName, estimateTokens, kickPrompt, parseJson, readableText, styleCheck } from "../_shared/core.ts";
import { admin, isInternal, json, rpc } from "../_shared/db.ts";
import { callLLM } from "../_shared/llm.ts";
import { dayPlan, range } from "../_shared/panchang.ts";

const istToday = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
type Target = { user_id: string; first_name: string; summary: any; dasha: any; city: { name: string; lat: number; lng: number; timezone: string } | null };
type Built = { facts: any; teaser: any; content: any };

async function kickProvider(): Promise<string> {
  const { data: f } = await admin.from("ai_features").select("model").eq("key", "daily_kick").single();
  const { data: m } = await admin.from("ai_models").select("provider").eq("model", f?.model ?? "").single();
  return m?.provider ?? "anthropic";
}

/** Computed facts for everyone in the list, grouped by city (one kundli-service call per city). */
async function buildFacts(targets: Target[], date: string): Promise<Map<string, Built>> {
  const out = new Map<string, Built>();
  const byCity = new Map<string, Target[]>();
  for (const t of targets) if (t.city) byCity.set(t.city.name, [...(byCity.get(t.city.name) ?? []), t]);
  for (const list of byCity.values()) {
    const c = list[0].city!;
    const res = await fetch(`${Deno.env.get("KUNDLI_URL")}/v1/day`, {
      method: "POST", headers: { "content-type": "application/json", "x-likha-key": Deno.env.get("KUNDLI_KEY")! },
      body: JSON.stringify({ date, lat: c.lat, lng: c.lng, tz_name: c.timezone,
        people: list.map((t) => ({ id: t.user_id, nakshatra_index: t.summary.nakshatra_index, moon_sign_index: t.summary.moon_sign_index })) }),
    });
    if (!res.ok) throw new Error(`kundli /v1/day ${res.status}`);
    const day = await res.json();
    const plan = dayPlan(c.lat, c.lng, c.timezone, new Date(`${date}T06:00:00+05:30`));
    const windows = [
      plan.office && { label: "Office and meetings", time: range(plan.office.start, plan.office.end) },
      plan.travel && { label: "Travel", time: range(plan.travel.start, plan.travel.end) },
      plan.love && { label: "Date or chat", time: range(plan.love.start, plan.love.end) },
      { label: "Avoid big money moves (Rahu Kaal)", time: range(plan.rahu[0], plan.rahu[1]) },
    ].filter(Boolean);
    for (const p of day.people) {
      const t = list.find((x) => x.user_id === p.id)!;
      const facts = { first_name: cleanName(t.first_name), moon_sign: t.summary.moon_sign, nakshatra: t.summary.nakshatra,
        dasha_now: t.summary.current_dasha, today_moon: `${day.moon.nakshatra_name} in ${day.moon.sign_name}`,
        tara: p.tara_name, chandrashtama: p.chandrashtama, vibe: `${p.vibe}/10`, date_score: `${p.date_score}/10`, time_windows: windows };
      out.set(p.id, {
        facts,
        teaser: { vibe: p.vibe, date_score: p.date_score, lucky_window: plan.love ? range(plan.love.start, plan.love.end) : null,
                  rahu_kaal: range(plan.rahu[0], plan.rahu[1]) },
        content: { time_windows: windows, tara: p.tara_name, chandrashtama: p.chandrashtama, today_moon: facts.today_moon },
      });
    }
  }
  return out;
}

function finish(b: Built, words: any) {
  const t = readableText(words);
  if (!words?.headline || !Array.isArray(words?.fix) || !styleCheck(t).ok) return null;
  return { teaser: { ...b.teaser, love_weather: words.headline, line: words.line ?? "" },
           content: { ...b.content, fix: words.fix.slice(0, 3), first_date_answer: words.first_date_answer ?? "" } };
}

async function templates(): Promise<string[]> {
  const { data } = await admin.from("kick_templates").select("template").eq("active", true);
  return (data ?? []).map((x: any) => x.template);
}

async function live(date: string, limit = 300) {
  const tpl = await templates();
  if (!tpl.length) return { saved: 0, reason: "no templates" };
  const targets = await rpc<Target[]>("svc_kick_targets", { p_date: date, p_limit: limit });
  const built = await buildFacts(targets, date);
  let saved = 0, failed = 0, stopped = false;
  const list = targets.filter((t) => built.has(t.user_id));
  for (let i = 0; i < list.length && !stopped; i += 5) {
    await Promise.all(list.slice(i, i + 5).map(async (t) => {
      const b = built.get(t.user_id)!;
      const p = kickPrompt(tpl, b.facts, date);
      const hold = await rpc<any>("svc_ai_reserve", { p_user: t.user_id, p_feature: "daily_kick", p_est_input_tokens: estimateTokens(p.system, p.user) });
      if (!hold.ok) { stopped = true; return; }
      try {
        const r = await callLLM(hold.provider, { model: hold.model, system: p.system, messages: [{ role: "user", content: p.user }],
          maxTokens: hold.max_output_tokens, temperature: hold.temperature });
        const done = finish(b, parseJson(r.text));
        await rpc("svc_ai_finish", { p_call: hold.call_id, p_in: r.inputTokens, p_out: r.outputTokens, p_cache: r.cacheReadTokens,
          p_status: done ? "ok" : "failed", p_number_check: !!done, p_latency_ms: r.latencyMs, p_error: done ? null : "kick failed checks" });
        if (done) { await rpc("svc_save_kick", { p_user: t.user_id, p_date: date, p_teaser: done.teaser, p_content: done.content }); saved++; }
        else failed++;
      } catch (e) {
        failed++;
        await rpc("svc_ai_finish", { p_call: hold.call_id, p_in: 0, p_out: 0, p_cache: 0, p_status: "failed", p_error: String((e as Error).message) }).catch(() => {});
      }
    }));
  }
  return { mode: "live", saved, failed, budget_stop: stopped };
}

async function submit(date: string) {
  if (await kickProvider() !== "anthropic") return live(date);
  const tpl = await templates();
  if (!tpl.length) return { submitted: 0, reason: "no templates" };
  const targets = await rpc<Target[]>("svc_kick_targets", { p_date: date, p_limit: 5000 });
  const built = await buildFacts(targets, date);
  const items: { custom_id: string; req: ClaudeRequest }[] = [];
  const map: Record<string, { user_id: string; call_id: number; built: Built }> = {};
  for (const [i, t] of targets.entries()) {
    const b = built.get(t.user_id); if (!b) continue;
    const p = kickPrompt(tpl, b.facts, date);
    const hold = await rpc<any>("svc_ai_reserve", { p_user: t.user_id, p_feature: "daily_kick",
      p_est_input_tokens: estimateTokens(p.system, p.user), p_batch: true });
    if (!hold.ok) break;                                           // budget reached: the rest get tomorrow's
    const id = `k${i}`;
    map[id] = { user_id: t.user_id, call_id: hold.call_id, built: b };
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
      const done = r.ok ? finish(it.built, parseJson(r.text)) : null;
      await rpc("svc_ai_finish", { p_call: it.call_id, p_in: r.inputTokens, p_out: r.outputTokens, p_cache: r.cacheReadTokens,
        p_status: done ? "ok" : "failed", p_number_check: !!done, p_batch: true, p_error: done ? null : "kick failed checks" });
      if (done) { await rpc("svc_save_kick", { p_user: it.user_id, p_date: b.for_date, p_teaser: done.teaser, p_content: done.content }); saved++; }
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
