// likha.in/c/<code>  ->  logs the click, sets a 30-day first-party cookie, sends the visitor to the deep link.
// The app reads the cookie at sign-up and calls attach_cupid(code, click_id).
// Route likha.in/c/* to this function (Vercel/Cloudflare rewrite).
import { rpc } from "../_shared/db.ts";

async function sha(s: string) {
  const salt = Deno.env.get("LIKHA_HASH_SALT") ?? "";
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = (url.pathname.split("/").filter(Boolean).pop() ?? "").toLowerCase();
  const site = Deno.env.get("LIKHA_SITE") ?? "https://likha.in";
  if (!/^[a-z0-9][a-z0-9-]{2,23}$/.test(code)) return Response.redirect(site, 302);
  // never store raw IPs: a salted hash is enough to spot repeat clicks and click farms
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0";
  const r = await rpc<any>("svc_cupid_click", {
    p_code: code, p_ip_hash: await sha(ip), p_ua_hash: await sha(req.headers.get("user-agent") ?? ""),
    p_country: req.headers.get("cf-ipcountry") ?? null, p_utm: url.searchParams.get("utm_source"),
  }).catch(() => ({ ok: false, target: "/" }));
  const headers = new Headers({ location: `${site}${r.target ?? "/"}`, "cache-control": "no-store" });
  if (r.ok) {
    headers.append("set-cookie", `likha_cupid=${r.code}.${r.click_id}; Max-Age=${30 * 86400}; Path=/; Domain=.likha.in; Secure; SameSite=Lax`);
  }
  return new Response(null, { status: 302, headers });
});
