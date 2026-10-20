import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export const admin: SupabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

/** A client that acts as the signed-in member (RLS applies), plus their id. */
export async function asUser(req: Request): Promise<{ client: SupabaseClient; userId: string } | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { client, userId: data.user.id };
}

/** Cron and database webhooks send the shared secret instead of a member token. */
export function isInternal(req: Request): boolean {
  const s = Deno.env.get("LIKHA_INTERNAL_SECRET");
  return !!s && req.headers.get("x-likha-internal") === s;
}

export async function rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/** Browsers call member-facing functions from the app's own site (LIKHA_SITE, e.g. https://likha.in). */
export const CORS = {
  "access-control-allow-origin": Deno.env.get("LIKHA_SITE") ?? "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
export const preflight = (req: Request) => req.method === "OPTIONS" ? new Response("ok", { headers: CORS }) : null;

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });
