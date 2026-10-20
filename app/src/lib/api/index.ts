import { DemoApi } from "./demo";
import { SupabaseApi } from "./supabase";
import type { Api } from "./types";

export * from "./types";

let instance: Api | null = null;

export function api(): Api {
  if (instance) return instance;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  instance = process.env.NEXT_PUBLIC_DEMO === "1" || !url || !key ? new DemoApi() : new SupabaseApi(url, key);
  return instance;
}
