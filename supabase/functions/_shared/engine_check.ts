// Admin > Engine check: two births in, both charts and the Guna Milan out, straight from the kundli service.
// Nothing is stored. The births are checked here so a typo comes back as a plain message, not a 422.
export type BirthIn = { date: string; time: string; lat: number; lng: number; tz: string; gender: "man" | "woman" };

export function cleanBirth(x: unknown): BirthIn | string {
  const b = (x ?? {}) as Record<string, unknown>;
  const date = String(b.date ?? ""), time = String(b.time ?? ""), tz = String(b.tz ?? "");
  const lat = Number(b.lat), lng = Number(b.lng);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return "Date must look like 1995-03-14.";
  const y = Number(date.slice(0, 4)); if (y < 1900 || y > 2100) return "Year must be between 1900 and 2100.";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return "Time must be 24-hour, like 06:30.";
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return "Latitude must be between -90 and 90.";
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return "Longitude must be between -180 and 180.";
  if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+\-]+)*$/.test(tz)) return "Time zone must be like Asia/Kolkata.";
  if (b.gender !== "man" && b.gender !== "woman") return "Pick boy or girl for each person.";
  return { date, time, lat, lng, tz, gender: b.gender };
}

const PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"];
// deno-lint-ignore no-explicit-any
export function slimChart(c: any) {
  return {
    summary: c.summary, manglik: c.manglik, borderline: !!c.summary?.borderline,
    // deno-lint-ignore no-explicit-any
    planets: (c.planets ?? []).filter((p: any) => PLANETS.includes(p.planet))
      // deno-lint-ignore no-explicit-any
      .map((p: any) => ({ planet: p.planet, lon: p.lon, sign: p.sign_name, deg: p.deg, nakshatra: p.nakshatra_name, pada: p.pada, retro: !!p.retro, house: p.house })),
  };
}

export async function engineCheck(url: string, apiKey: string, boy: BirthIn, girl: BirthIn) {
  const call = async (path: string, body: unknown) => {
    const r = await fetch(`${url.replace(/\/$/, "")}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-likha-key": apiKey }, body: JSON.stringify(body) });
    if (r.status === 422) throw new Error(((await r.json().catch(() => ({}))) as { detail?: string }).detail ?? "The kundli service couldn't read that birth.");
    if (!r.ok) throw new Error(`kundli service ${r.status}`);
    return r.json();
  };
  const birth = (b: BirthIn) => ({ birth_date: b.date, birth_time: b.time, lat: b.lat, lng: b.lng, tz_name: b.tz });
  const [ca, cb, pair, health] = await Promise.all([
    call("/v1/chart", birth(boy)), call("/v1/chart", birth(girl)),
    call("/v1/pair", { a: { label: "Boy", gender: boy.gender, birth: birth(boy) }, b: { label: "Girl", gender: girl.gender, birth: birth(girl) } }),
    fetch(`${url.replace(/\/$/, "")}/health`).then((r) => r.json()).catch(() => ({})),
  ]);
  return { boy: slimChart(ca), girl: slimChart(cb), milan: pair.milan, jodi_score: pair.jodi_score, borderline: !!pair.borderline,
    engine: health.engine ?? ca.summary?.engine_version ?? null, rules: health.rules ?? pair.milan?.rules_version ?? null };
}
