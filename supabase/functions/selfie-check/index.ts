// Selfie check (onboarding step 5 and later re-checks). Member token. What happens depends on Admin > Settings > Verification:
//   auto    member is let in now; no Verified badge until a real check
//   manual  the selfie is kept privately until a person decides (Selfie review), then deleted by the safety worker
//   api     the selfie service decides (score + liveness; pass score and tries from Admin). Any failure goes to manual review.
// The app sends one JPEG frame: {image: "data:image/jpeg;base64,..."}.
import { key, loadKeys } from "../_shared/keys.ts";
import { admin, asUser, json, preflight, rpc } from "../_shared/db.ts";
import { callVerify, parseSelfieReply, selfieBytes } from "../_shared/verify.ts";

Deno.serve(async (req) => {
  await loadKeys();
  const pre = preflight(req); if (pre) return pre;
  const u = await asUser(req);
  if (!u) return json({ error: "sign in again" }, 401);
  const body = await req.json().catch(() => ({}));
  const cfg = await rpc<{ selfie: { mode: string; url: string | null } }>("svc_verification", {});
  const mode = cfg?.selfie?.mode ?? "auto";
  try {
    if (mode === "auto") return json(await rpc("svc_selfie_auto", { p_user: u.userId }));

    let bytes: Uint8Array;
    try { bytes = selfieBytes(body.image); } catch { return json({ status: "failed", message: "We couldn't see your face. Try again in good light." }); }
    const path = `${u.userId}/${crypto.randomUUID()}.jpg`;
    const { data: me } = await admin.from("profiles").select("selfie_status").eq("id", u.userId).single();
    if (me?.selfie_status === "manual_review") return json({ status: "manual_review" });     // already waiting for a person: don't upload again
    if (me?.selfie_status === "passed") return json({ status: "passed" });
    const keep = async (why: string) => {
      const up = await admin.storage.from("selfies").upload(path, bytes, { contentType: "image/jpeg" });
      if (up.error) throw new Error(up.error.message);
      return rpc("svc_selfie_manual", { p_user: u.userId, p_path: path, p_why: why });
    };
    if (mode === "manual") return json(await keep("Manual review (Settings > Verification)"));

    // api
    const apiKey = key("SELFIE_API_KEY");
    const { data: ph } = await admin.from("photos").select("storage_path").eq("user_id", u.userId).eq("position", 1).maybeSingle();
    if (!cfg.selfie.url || !apiKey || !ph) return json(await keep(!ph ? "No main photo to compare" : "Selfie API not set up"));
    const { data: link } = await admin.storage.from("photos").createSignedUrl(ph.storage_path, 600);
    let reply;
    try {
      const r = await callVerify(cfg.selfie.url, apiKey, { user_id: u.userId, selfie_jpeg_base64: String(body.image).split(",")[1], profile_photo_url: link?.signedUrl });
      reply = parseSelfieReply(r.json);
    } catch (e) {
      console.error("selfie api", (e as Error).message);
      return json(await keep(`Selfie API failed: ${(e as Error).message}`.slice(0, 120)));
    }
    // weak matches use up a try; the last try goes to a person, who needs the picture
    const out = await rpc<{ status: string; tries_left: number }>("svc_selfie_result", { p_user: u.userId, p_score: reply.score, p_live: reply.live, p_selfie_path: path });
    if (out.status === "manual_review") await admin.storage.from("selfies").upload(path, bytes, { contentType: "image/jpeg" });
    if (out.status === "failed") return json({ ...out, message: out.tries_left > 0 ? "That didn't match your main photo. Face the camera in good light and try again." : "We'll have a person look." });
    return json(out);
  } catch (e) {
    console.error(e);
    return json({ status: "failed", message: "The check could not run. Please try again." }, 500);
  }
});
