import { DemoAdmin } from "./demo";
import { SupabaseAdmin } from "./supabase";
import type { AdminApi } from "./types";
export * from "./types";

let instance: AdminApi | null = null;
export function api(): AdminApi {
  if (instance) return instance;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  instance = process.env.NEXT_PUBLIC_DEMO === "1" || !url || !key ? new DemoAdmin() : new SupabaseAdmin(url, key);
  return instance;
}
