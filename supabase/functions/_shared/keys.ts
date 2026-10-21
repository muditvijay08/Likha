// Provider keys come from Admin > Keys (Supabase Vault, read through svc_api_keys) and are cached for a minute.
// A key not set in Admin falls back to the function secret of the same name, so nothing breaks while moving keys over.
// Razorpay names resolve to the test or live key by Admin's payments switch; NAME@test / NAME@live read one explicitly.
type KeyMap = Record<string, string>;
let cache: { at: number; map: KeyMap } = { at: 0, map: {} };
let loader: () => Promise<KeyMap> = async () => (await import("./db.ts")).rpc<KeyMap>("svc_api_keys", {});

/** Call once at the start of each request. Keeps the last good copy if the database is briefly unreachable. */
export async function loadKeys(maxAgeMs = 60_000): Promise<void> {
  if (Date.now() - cache.at < maxAgeMs) return;
  try { cache = { at: Date.now(), map: (await loader()) ?? {} }; }
  catch (e) { console.error("keys: using last copy", (e as Error).message); cache.at = Date.now() - maxAgeMs + 5_000; }
}

export function key(name: string): string | undefined {
  return cache.map[name] || Deno.env.get(name) || undefined;
}

export function mustKey(name: string): string {
  const v = key(name);
  if (!v) throw new Error(`${name} is not set (Admin > Keys)`);
  return v;
}

export function paymentsMode(): "test" | "live" {
  return (cache.map.PAYMENTS_MODE ?? Deno.env.get("PAYMENTS_MODE") ?? "test") === "live" ? "live" : "test";
}

/** Tests only. */
export function _useKeys(map: KeyMap, load?: () => Promise<KeyMap>) {
  cache = { at: load ? 0 : Date.now(), map };
  if (load) loader = load;
}
