// The version of this build. Raise it with each release; Admin > General > "Oldest app version allowed" asks older copies to refresh.
export const APP_VERSION = "1.0.0";

/** -1, 0 or 1, comparing "1.2.0"-style versions. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}
