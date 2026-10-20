// Likha AI gateway: the only door to the model.
// Every call: budget hold (svc_ai_reserve) -> Claude, Gemini or GPT (set per feature in admin) -> checks -> log (svc_ai_finish).
// Paid readings that fail the checks twice are refunded automatically.
//
// POST /ai-gateway
//   {action:"reading", reading_id}                 member token (own reading) or internal secret
//   {action:"saathi", character, message}          member token
//   {action:"guru", match_id, question}            member token
//   {action:"opener", match_id}                    member token (charges cupid_opener credits)
import type { ClaudeRequest } from "../_shared/anthropic.ts";
import { callLLM } from "../_shared/llm.ts";
import {
  allowedFrom, CAP_MESSAGES, cleanName, CRISIS_REPLY, estimateTokens, guruSystem, isCrisis, numberCheck, openerPrompt,
  pairFacts, parseJson, personFacts, readableText, readingPrompt, saathiSystem, sevenText, styleCheck, NAKSHATRAS, SIGNS
} from "../_shared/core.ts";
import { admin, asUser, isInternal, json, rpc, preflight } from "../_shared/db.ts";
import { geminiImage, imaginePrompt, stampImagined } from "../_shared/image.ts";

type Hold = { ok: boolean; call_id?: number; model?: string; provider?: string; max_output_tokens?: number; temperature?: number;
  number_check?: boolean; reason?: string; alert?: boolean; spent_today_paise?: number; daily_cap_paise?: number };

async function alertTeam(h: Hold) {
  const hook = Deno.env.get("LIKHA_ALERT_WEBHOOK");                   // Slack / Google Chat incoming webhook
  if (!hook || !h.alert) return;
  await fetch(hook, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: `Likha AI spend today: Rs ${((h.spent_today_paise ?? 0) / 100).toFixed(0)} of Rs ${((h.daily_cap_paise ?? 0) / 100).toFixed(0)} cap` }) })
    .catch(() => {});
}

/** One model call inside a budget hold. Throws {capped} when the budget says no. */
async function run(userId: string | null, feature: string, req: Omit<ClaudeRequest, "model" | "maxTokens" | "temperature">,
  opts: { readingId?: string; attempt?: number; check?: (text: string) => { ok: boolean; problems: string[] } } = {}) {
  const est = estimateTokens(req.system, ...req.messages.map((m) => m.content));
  const hold = await rpc<Hold>("svc_ai_reserve", { p_user: userId, p_feature: feature, p_est_input_tokens: est,
    p_reading: opts.readingId ?? null, p_attempt: opts.attempt ?? 1 });
  if (!hold.ok) throw Object.assign(new Error(hold.reason), { capped: hold.reason });
  alertTeam(hold);
  try {
    const out = await callLLM(hold.provider, { ...req, model: hold.model!, maxTokens: hold.max_output_tokens!, temperature: hold.temperature! });
    const verdict = opts.check && hold.number_check !== false ? opts.check(out.text) : { ok: true, problems: [] };
    await rpc("svc_ai_finish", { p_call: hold.call_id, p_in: out.inputTokens, p_out: out.outputTokens, p_cache: out.cacheReadTokens,
      p_status: verdict.ok ? "ok" : "regenerated", p_number_check: opts.check ? verdict.ok : null, p_latency_ms: out.latencyMs,
      p_error: verdict.ok ? null : verdict.problems.join("; ") });
    return { text: out.text, verdict };
  } catch (e) {
    await rpc("svc_ai_finish", { p_call: hold.call_id, p_in: 0, p_out: 0, p_cache: 0, p_status: "failed",
      p_error: String((e as Error).message) }).catch(() => {});
    throw e;
  }
}

// ---------------------------------------------------------------- readings
async function reading(readingId: string) {
  // one writer at a time: the app's call right after purchase and the reading worker never both write it
  if (!(await rpc<boolean>("svc_reading_lease", { p_reading: readingId, p_minutes: 3 }))) return { ok: false, busy: true };
  const ctx = await rpc<any>("svc_reading_context", { p_reading: readingId });
  const kind: string = ctx.reading.kind;
  if (kind === "imagine_us") return await imagine(readingId, ctx);
  const subject = ctx.reading.subject ?? {};
  let facts: Record<string, unknown>;

  if (subject.birth && ctx.me?.summary) {
    // someone not on Likha (Check With Anyone, gift, why it didn't work): ask the kundli service, nothing stored there
    const res = await fetch(`${Deno.env.get("KUNDLI_URL")}/v1/pair`, {
      method: "POST", headers: { "content-type": "application/json", "x-likha-key": Deno.env.get("KUNDLI_KEY")! },
      body: JSON.stringify({ a: { label: cleanName(ctx.me.first_name), gender: ctx.me.gender, birth: ctx.me_birth },
                             b: { label: cleanName(subject.name), gender: subject.gender ?? "other", birth: subject.birth } }),
    });
    if (!res.ok) throw new Error(`kundli ${res.status}`);
    facts = (await res.json()).facts;
  } else if (kind === "compat_report") {
    // only what both members can already see on each other's profile: summaries and the pair's Gunas (no full charts, no dashas)
    const pub = (x: any) => x && { ...x, chart: null, summary: { ...x.summary, current_dasha: undefined } };
    facts = { a: personFacts(ctx.me?.first_name, pub(ctx.me)), b: personFacts(ctx.partner?.first_name, pub(ctx.partner)), pair: pairFacts(ctx.compatibility) };
  } else {
    facts = {
      a: personFacts(ctx.me?.first_name, ctx.me),
      b: ctx.partner ? personFacts(ctx.partner.first_name, ctx.partner) : null,
      pair: pairFacts(ctx.compatibility),
    };
  }
  if (kind === "who_suits_me") {
    // computed from the Guna table (best-scoring partner nakshatras and Moon signs); the writer explains, never picks
    const sf = await rpc<{ nakshatras: number[]; moon_signs: number[]; best_score: number }>("svc_suits_facts", { p_user: ctx.reading.user_id });
    facts.suits = { nakshatras: (sf?.nakshatras ?? []).map((i) => NAKSHATRAS[i]), moon_signs: (sf?.moon_signs ?? []).map((i) => SIGNS[i]) };
  }
  if (kind === "why_not") {
    facts.together_for = subject.duration ?? null;
    if (subject.time_known === false) facts.note = "Their birth time is not known; their Moon nakshatra may be off by one. Say so gently.";
  }
  const allowed = allowedFrom(facts);
  const check = (text: string) => {
    const parsed = parseJson(text);
    if (!parsed?.sections) return { ok: false, problems: ["answer was not the JSON shape we asked for"] };
    const t = readableText(parsed);
    const a = numberCheck(t, allowed), b = styleCheck(t);
    return { ok: a.ok && b.ok, problems: [...a.problems, ...b.problems] };
  };

  let userText: string | undefined;
  if (kind === "seven_questions" && subject.answers) {
    // answers are stored by match side (a = user_a); put the right first name on each
    const { data: rm } = await admin.from("readings").select("match_id").eq("id", readingId).single();
    const { data: m } = await admin.from("matches").select("user_a").eq("id", rm!.match_id).single();
    const ownerIsA = m!.user_a === ctx.reading.user_id;
    const me = cleanName(ctx.me?.first_name ?? "A"), them = cleanName(ctx.partner?.first_name ?? "B");
    userText = sevenText(subject.answers, ownerIsA ? me : them, ownerIsA ? them : me);
  }
  const p = readingPrompt(kind, facts, userText);
  const maxTries = 1 + Number(Deno.env.get("AI_MAX_REGENERATIONS") ?? 1);
  let lastProblems: string[] = [];
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const user = attempt === 1 ? p.user
      : `${p.user}\n\nYour last answer had these problems, fix them: ${lastProblems.join("; ")}. Copy scores exactly from the facts.`;
    try {
      const { text, verdict } = await run(ctx.reading.user_id, kind === "check_anyone" ? "check_anyone" : "reading",
        { system: p.system, messages: [{ role: "user", content: user }] }, { readingId, attempt, check });
      if (verdict.ok) {
        await rpc("svc_reading_done", { p_reading: readingId, p_content: { ...(parseJson<Record<string, unknown>>(text) ?? {}), facts_version: "v1" } });
        return { ok: true };
      }
      lastProblems = verdict.problems;
    } catch (e) {
      lastProblems = [String((e as Error).message)];
      if ((e as any).capped) break;
    }
  }
  await rpc("svc_reading_failed", { p_reading: readingId, p_reason: lastProblems.join("; ").slice(0, 120) });
  return { ok: false, refunded: true };
}

// ---------------------------------------------------------------- imagine us (2 images, both agreed)
async function imagine(readingId: string, ctx: any) {
  const userId: string = ctx.reading.user_id;
  const { data: r } = await admin.from("readings").select("partner_user_id,match_id").eq("id", readingId).single();
  const scene: string = ctx.reading.subject?.scene ?? "travel";
  const refs: { mime: string; data: Uint8Array }[] = [];
  for (const uid of [userId, r!.partner_user_id]) {
    const { data: ph } = await admin.from("photos").select("storage_path").eq("user_id", uid).eq("position", 1).eq("moderation_status", "approved").maybeSingle();
    if (!ph) break;
    const { data: file } = await admin.storage.from("photos").download(ph.storage_path);
    if (file) refs.push({ mime: file.type || "image/jpeg", data: new Uint8Array(await file.arrayBuffer()) });
  }
  if (refs.length < 2) { await rpc("svc_reading_failed", { p_reading: readingId, p_reason: "main photos not available" }); return { ok: false, refunded: true }; }
  const paths: string[] = [];
  try {
    for (let i = 0; i < 2; i++) {
      const hold = await rpc<Hold>("svc_ai_reserve", { p_user: userId, p_feature: "imagine", p_est_input_tokens: 600, p_reading: readingId, p_attempt: i + 1 });
      if (!hold.ok) throw Object.assign(new Error(hold.reason), { capped: hold.reason });
      const t0 = Date.now();
      try {
        const img = await geminiImage(hold.model!, imaginePrompt(scene, i), refs);
        const jpg = await stampImagined(img.bytes);
        const path = `${userId}/${r!.match_id}/imagine-${readingId}-${i + 1}.jpg`;
        const up = await admin.storage.from("stories").upload(path, jpg, { contentType: "image/jpeg", upsert: true });
        if (up.error) throw new Error(up.error.message);
        paths.push(path);
        await rpc("svc_ai_finish", { p_call: hold.call_id, p_in: img.inputTokens, p_out: img.outputTokens, p_cache: 0, p_status: "ok", p_latency_ms: Date.now() - t0 });
      } catch (e) {
        await rpc("svc_ai_finish", { p_call: hold.call_id, p_in: 0, p_out: 0, p_cache: 0, p_status: "failed", p_error: String((e as Error).message) }).catch(() => {});
        throw e;
      }
    }
    const label = ({ travel: "Travel", wedding: "Wedding", old_age: "At 70" } as Record<string, string>)[scene] ?? scene;
    await rpc("svc_reading_done", { p_reading: readingId, p_content: { title: `Imagined: ${label}`, scene, images: paths, imagined: true, sections: [] } });
    return { ok: true };
  } catch (e) {
    if (paths.length) await admin.storage.from("stories").remove(paths).catch(() => {});
    await rpc("svc_reading_failed", { p_reading: readingId, p_reason: String((e as Error).message).slice(0, 120) });
    return { ok: false, refunded: true };
  }
}

// ---------------------------------------------------------------- saathi
async function saathi(userId: string, client: any, character: "chandni" | "dhruv", message: string) {
  const msg = String(message ?? "").slice(0, 1000);
  if (!msg.trim()) return json({ error: "empty" }, 400);
  const left = (await client.rpc("saathi_messages_left")).data ?? 0;
  if (left <= 0) return json({ reply: null, topup: true, message: "That's today's free chats. Top up for 50 more." }, 402);

  const crisis = isCrisis(msg);
  await rpc("svc_saathi_save", { p_user: userId, p_char: character, p_role: "user", p_body: msg, p_crisis: crisis });
  if (crisis) {                                              // never to the model: fixed help reply, flagged for Safety
    await rpc("svc_saathi_save", { p_user: userId, p_char: character, p_role: "assistant", p_body: CRISIS_REPLY, p_crisis: true });
    return json({ reply: CRISIS_REPLY, crisis: true });
  }
  const ctx = await rpc<any>("svc_saathi_context", { p_user: userId, p_char: character, p_last: 20 });
  const facts = ctx.summary ? { first_name: cleanName(ctx.first_name), lagna: ctx.summary.lagna, moon_sign: ctx.summary.moon_sign,
    nakshatra: ctx.summary.nakshatra, dasha_now: ctx.summary.current_dasha } : { first_name: cleanName(ctx.first_name) };
  const history = (ctx.history as any[]).map((h) => ({ role: h.role, content: h.role === "user" ? `<user_text>${h.body}</user_text>` : h.body }));
  try {
    const { text } = await run(userId, "saathi", { system: saathiSystem(character, facts, ctx.styles ?? []), messages: history, cacheSystem: true },
      { check: (t) => styleCheck(t) });
    const s = styleCheck(text);
    const reply = s.ok ? text.trim() : "Hmm, let me put that better. Tell me a bit more about what's on your mind?";
    await rpc("svc_saathi_save", { p_user: userId, p_char: character, p_role: "assistant", p_body: reply, p_flagged: !s.ok });
    return json({ reply, left: left - 1 });
  } catch (e) {
    const reason = (e as any).capped as string | undefined;
    return json({ reply: null, capped: reason ?? "error", message: CAP_MESSAGES[reason ?? ""] ?? "Saathi is offline for a moment." }, reason ? 429 : 503);
  }
}

// ---------------------------------------------------------------- guru ji
async function guru(userId: string, client: any, matchId: string) {
  const member = (await client.rpc("is_match_member", { p_match: matchId })).data;
  if (!member) return json({ error: "not your match" }, 403);
  // the member asked through ask_guru (counts the couple's questions); we answer the oldest waiting one
  const q = await rpc<{ id: number; author_id: string; body: string } | null>("svc_guru_pending", { p_match: matchId });
  if (!q) return json({ error: "no question waiting" }, 400);
  const { data: m } = await admin.from("matches").select("user_a,user_b").eq("id", matchId).single();
  if (!m) return json({ error: "no match" }, 404);
  const [a, b] = [m.user_a, m.user_b].sort();
  const { data: c } = await admin.from("compatibility").select("*").eq("user_a", a).eq("user_b", b).maybeSingle();
  const { data: ks } = await admin.from("kundli_summary").select("*").in("user_id", [a, b]);
  const { data: names } = await admin.from("profiles").select("id,first_name").in("id", [a, b]);
  const facts = {
    people: (names ?? []).map((n: any) => ({ name: cleanName(n.first_name), ...(ks ?? []).find((k: any) => k.user_id === n.id), user_id: undefined })),
    pair: pairFacts(c),
  };
  const allowed = allowedFrom(facts);
  const check = (t: string) => { const x = numberCheck(t, allowed), y = styleCheck(t); return { ok: x.ok && y.ok, problems: [...x.problems, ...y.problems] }; };
  const ask = String(q.body).slice(0, 600);
  try {
    let { text, verdict } = await run(q.author_id, "guru", { system: guruSystem(facts), messages: [{ role: "user", content: `<user_text>${ask}</user_text>` }] }, { check });
    if (!verdict.ok) {
      ({ text, verdict } = await run(q.author_id, "guru", { system: guruSystem(facts), messages: [{ role: "user",
        content: `<user_text>${ask}</user_text>\nUse only scores and names from the facts.` }] }, { check, attempt: 2 }));
    }
    const body = verdict.ok ? text.trim() : "Good question! I'd rather not guess. Ask me about your Gunas or Moon signs.";
    await rpc("svc_guru_answer", { p_match: matchId, p_question: q.id, p_body: body });
    return json({ reply: body });
  } catch (e) {
    await rpc("svc_guru_failed", { p_match: matchId, p_question: q.id }).catch(() => {});   // the question is given back
    const reason = (e as any).capped as string | undefined;
    return json({ reply: null, message: CAP_MESSAGES[reason ?? ""] ?? "Guru Ji is meditating. Try again soon." }, reason ? 429 : 503);
  }
}

// ---------------------------------------------------------------- cupid opener
async function opener(userId: string, client: any, matchId: string) {
  const member = (await client.rpc("is_match_member", { p_match: matchId })).data;
  if (!member) return json({ error: "not your match" }, 403);
  const idem = `opener:${matchId}:${userId}:${new Date().toISOString().slice(0, 10)}`;
  const spend = await client.rpc("spend_on", { p_price_key: "cupid_opener", p_ref_type: "match", p_ref_id: matchId, p_idem: idem });
  if (spend.error) return json({ error: spend.error.message }, 402);
  const { data: m } = await admin.from("matches").select("user_a,user_b").eq("id", matchId).single();
  if (!m) return json({ error: "no match" }, 404);
  const other = m.user_a === userId ? m.user_b : m.user_a;
  const { data: prompts } = await admin.from("profile_prompts").select("answer").eq("user_id", other);
  const { data: o } = await admin.from("profiles").select("first_name").eq("id", other).single();
  const p = openerPrompt({ their_name: cleanName(o?.first_name) }, (prompts ?? []).map((x: any) => x.answer).join("\n"));
  try {
    const { text } = await run(userId, "cupid_opener", { system: p.system, messages: [{ role: "user", content: p.user }] },
      { check: (t) => styleCheck(readableText(parseJson(t) ?? t)) });
    const out = parseJson<{ openers: string[] }>(text);
    if (!out?.openers?.length) throw new Error("bad shape");
    return json({ openers: out.openers.slice(0, 3) });
  } catch {
    await rpc("svc_refund_ledger", { p_ledger: spend.data, p_reason: "Cupid opener failed" });
    return json({ error: "Could not write openers. Your credits are back." }, 503);
  }
}

// ---------------------------------------------------------------- router
Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  try {
    if (body.action === "reading") {
      if (!isInternal(req)) {
        const u = await asUser(req);
        if (!u) return json({ error: "sign in" }, 401);
        const { data: r } = await u.client.from("readings").select("id").eq("id", body.reading_id).maybeSingle();  // RLS: own only
        if (!r) return json({ error: "not your reading" }, 403);
      }
      return json(await reading(body.reading_id));
    }
    const u = await asUser(req);
    if (!u) return json({ error: "sign in" }, 401);
    if (body.action === "saathi") {
      if (!["chandni", "dhruv"].includes(body.character)) return json({ error: "unknown character" }, 400);
      return await saathi(u.userId, u.client, body.character, body.message);
    }
    if (body.action === "guru") return await guru(u.userId, u.client, body.match_id);
    if (body.action === "opener") return await opener(u.userId, u.client, body.match_id);
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "something went wrong" }, 500);
  }
});
