// Copy of app/src/lib/panchang.ts. Keep both identical.
// Sunrise, sunset, Rahu Kaal and planetary hours (hora) for a city and day. Pure maths, no network.
// Used for the Home timeline, Daily Kick time windows and Golden Hours. Same file is copied into the Edge Functions.
// Sun times: NOAA solar calculator equations (accurate to about a minute between ±60° latitude).

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export interface SunDay { sunrise: number; sunset: number; noon: number }   // minutes after local midnight

/** offsetMin: the city's UTC offset on that date, e.g. 330 for IST. */
export function sunTimes(y: number, m: number, d: number, lat: number, lng: number, offsetMin: number): SunDay {
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  const jdn = d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  const jd = jdn - 0.5 + 0.5 - offsetMin / 1440;                       // local noon in JD (approximately)
  const T = (jd - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T) + Math.sin(rad(3 * M)) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const decl = deg(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda))));
  const yv = Math.tan(rad(eps / 2)) ** 2;
  const eqTime = 4 * deg(yv * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M)) + 4 * e * yv * Math.sin(rad(M)) * Math.cos(2 * rad(L0))
    - 0.5 * yv * yv * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M)));
  const cosH = (Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(rad(decl)))) - Math.tan(rad(lat)) * Math.tan(rad(decl));
  const H = deg(Math.acos(Math.max(-1, Math.min(1, cosH))));
  const noon = 720 - 4 * lng - eqTime + offsetMin;
  return { sunrise: noon - 4 * H, sunset: noon + 4 * H, noon };
}

// Rahu Kaal: daytime split into 8 parts; which part depends on the weekday (0 = Sunday).
const RAHU_PART = [8, 2, 7, 5, 6, 4, 3];
export function rahuKaal(sun: SunDay, weekday: number): [number, number] {
  const part = (sun.sunset - sun.sunrise) / 8;
  const start = sun.sunrise + (RAHU_PART[weekday] - 1) * part;
  return [start, start + part];
}

// Horas: 12 day hours from sunrise, 12 night hours from sunset, planets in Chaldean order from the weekday's lord.
export const CHALDEAN = ["Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury", "Moon"] as const;
const DAY_LORD = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
export interface Hora { planet: string; start: number; end: number }       // minutes after local midnight (may exceed 1440)

export function horas(sun: SunDay, nextSunrise: number, weekday: number): Hora[] {
  const out: Hora[] = [];
  let i = CHALDEAN.indexOf(DAY_LORD[weekday] as (typeof CHALDEAN)[number]);
  const dayLen = (sun.sunset - sun.sunrise) / 12, nightLen = (nextSunrise + 1440 - sun.sunset) / 12;
  for (let k = 0; k < 24; k++) {
    const start = k < 12 ? sun.sunrise + k * dayLen : sun.sunset + (k - 12) * nightLen;
    out.push({ planet: CHALDEAN[i % 7], start, end: start + (k < 12 ? dayLen : nightLen) });
    i++;
  }
  return out;
}

export const fmt = (min: number) => {
  const m = Math.round(((min % 1440) + 1440) % 1440);
  const h = Math.floor(m / 60), mm = m % 60, ap = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${ap}`;
};
export const range = (a: number, b: number) => `${fmt(a).replace(/ (AM|PM)$/, fmt(a).slice(-3) === fmt(b).slice(-3) ? "" : " $1")}–${fmt(b)}`;

/** Local date parts and UTC offset (minutes) for a time zone at an instant. */
export function localParts(tz: string, at: Date = new Date()) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short" }).formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const y = Number(g("year")), m = Number(g("month")), d = Number(g("day")), h = Number(g("hour")) % 24, mi = Number(g("minute"));
  const offset = Math.round((Date.UTC(y, m - 1, d, h, mi) - at.getTime()) / 60000);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday"));
  return { y, m, d, minutes: h * 60 + mi, offset, weekday };
}

export interface DayPlan {
  sun: SunDay; rahu: [number, number]; horas: Hora[];
  love: Hora | null; office: Hora | null; travel: Hora | null;
}

const overlaps = (h: Hora, r: [number, number]) => h.start < r[1] && h.end > r[0];

/** Today's (or another day's) plan for a city. */
export function dayPlan(lat: number, lng: number, tz: string, at: Date = new Date()): DayPlan {
  const lp = localParts(tz, at);
  const sun = sunTimes(lp.y, lp.m, lp.d, lat, lng, lp.offset);
  const next = new Date(at.getTime() + 864e5);
  const ln = localParts(tz, next);
  const sunNext = sunTimes(ln.y, ln.m, ln.d, lat, lng, ln.offset);
  const rahu = rahuKaal(sun, lp.weekday);
  const hs = horas(sun, sunNext.sunrise, lp.weekday);
  const pick = (planets: string[], from: number, to: number) =>
    hs.find((h) => planets.includes(h.planet) && h.start >= from && h.start < to && !overlaps(h, rahu)) ?? null;
  return {
    sun, rahu, horas: hs,
    love: pick(["Venus"], 17 * 60, 23 * 60) ?? pick(["Moon"], 17 * 60, 23 * 60) ?? pick(["Venus", "Moon"], 10 * 60, 23 * 60),
    office: pick(["Mercury", "Jupiter"], 9 * 60 + 30, 18 * 60),
    travel: pick(["Moon", "Jupiter", "Venus"], 7 * 60, 19 * 60),
  };
}

export interface Golden { day: string; start: Date; end: Date; best_for: "first_message" | "deep_chat" | "first_date"; planet: string }

/** Golden Hours for a match: the next Venus and Moon horas (evening chats) and Jupiter horas (daytime dates), never in Rahu Kaal. */
export function goldenHours(lat: number, lng: number, tz: string, from: Date = new Date(), days = 7): Golden[] {
  const out: Golden[] = [];
  for (let k = 0; k < days; k++) {
    const at = new Date(from.getTime() + k * 864e5);
    const lp = localParts(tz, at);
    const plan = dayPlan(lat, lng, tz, at);
    const midnight = at.getTime() - lp.minutes * 60000;
    const label = k === 0 ? "Tonight" : new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "long" }).format(at);
    for (const h of plan.horas) {
      if (overlaps(h, plan.rahu)) continue;
      const start = new Date(midnight + h.start * 60000), end = new Date(midnight + h.end * 60000);
      if (end <= from) continue;
      if (h.planet === "Venus" && h.start >= 18 * 60 && h.start < 23 * 60) out.push({ day: label, start, end, best_for: "deep_chat", planet: h.planet });
      else if (h.planet === "Moon" && h.start >= 10 * 60 && h.start < 23 * 60) out.push({ day: label, start, end, best_for: "first_message", planet: h.planet });
      else if (h.planet === "Jupiter" && h.start >= 10 * 60 && h.start < 20 * 60 && [0, 5, 6].includes(lp.weekday))
        out.push({ day: label, start, end, best_for: "first_date", planet: h.planet });
    }
  }
  return out;
}

/** "7:40 PM" for an instant, in the city's time zone. */
export const clock = (at: Date, tz: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(at);
export const clockRange = (a: Date, b: Date, tz: string) => {
  const x = clock(a, tz), y = clock(b, tz);
  return `${x.slice(-2) === y.slice(-2) ? x.slice(0, -3) : x}–${y}`;
};

export const BEST_FOR_LABEL = { first_message: "Best for a first message", deep_chat: "Best for a long chat", first_date: "Best for a first date" } as const;
