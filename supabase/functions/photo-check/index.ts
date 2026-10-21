// Photo check, called by the app right after an upload. Member token, own photos only.
// auto and manual are handled in the database (approved at once, or waiting for the team); this function only acts in api mode.
// If the photo service fails, the photo stays waiting for the team (Selfie review > Photos).
import { key, loadKeys } from "../_shared/keys.ts";
import { admin, asUser, json, preflight, rpc } from "../_shared/db.ts";
import { callVerify, parsePhotoReply } from "../_shared/verify.ts";

Deno.serve(async (req) => {
  await loadKeys();
  const pre = preflight(req); if (pre) return pre;
  const u = await asUser(req);
  if (!u) return json({ error: "sign in again" }, 401);
  const { photo_id } = await req.json().catch(() => ({}));
  const ph = await rpc<{ id: string; path: string; position: number; status: string } | null>("svc_photo_for_check", { p_photo: photo_id, p_user: u.userId });
  if (!ph) return json({ error: "photo not found" }, 404);
  const cfg = await rpc<{ photos: { mode: string; url: string | null } }>("svc_verification", {});
  const apiKey = key("PHOTO_API_KEY");
  if (cfg?.photos?.mode !== "api" || ph.status !== "pending" || !cfg.photos.url || !apiKey) return json({ status: ph.status });
  try {
    const { data: link } = await admin.storage.from("photos").createSignedUrl(ph.path, 600);
    const r = await callVerify(cfg.photos.url, apiKey, { photo_id: ph.id, user_id: u.userId, image_url: link?.signedUrl, position: ph.position });
    const v = parsePhotoReply(r.json);
    const status = await rpc<string>("svc_photo_result", { p_photo: ph.id, p_approved: v.approved, p_labels: v.labels, p_reason: v.reason });
    return json({ status, reason: v.approved ? null : v.reason });
  } catch (e) {
    console.error("photo api", (e as Error).message);
    return json({ status: "pending" });                         // the team will look
  }
});
