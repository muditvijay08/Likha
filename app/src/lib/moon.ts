// Approximate sidereal Moon sign from a date of birth alone, for the free preview on Check With Anyone.
// Moon longitude: the 13 largest terms of Meeus, Astronomical Algorithms ch. 47 (about 0.3° accuracy).
// Ayanamsa: Lahiri, linear approximation. The real reading always uses the kundli service, never this.
// Without a birth time the Moon moves about 13° in the day, so we check the start and end of the day (IST).

export const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const r = (d: number) => (d * Math.PI) / 180;
const norm = (x: number) => ((x % 360) + 360) % 360;

export function moonLongitude(at: Date): number {
  const jd = at.getTime() / 864e5 + 2440587.5, T = (jd - 2451545) / 36525;
  const L = 218.3164477 + 481267.88123421 * T, D = 297.8501921 + 445267.1114034 * T, M = 357.5291092 + 35999.0502909 * T;
  const Mp = 134.9633964 + 477198.8675055 * T, F = 93.272095 + 483202.0175233 * T;
  const lon = L + 6.288774 * Math.sin(r(Mp)) + 1.274027 * Math.sin(r(2 * D - Mp)) + 0.658314 * Math.sin(r(2 * D)) + 0.213618 * Math.sin(r(2 * Mp))
    - 0.185116 * Math.sin(r(M)) - 0.114332 * Math.sin(r(2 * F)) + 0.058793 * Math.sin(r(2 * D - 2 * Mp)) + 0.057066 * Math.sin(r(2 * D - M - Mp))
    + 0.053322 * Math.sin(r(2 * D + Mp)) + 0.045758 * Math.sin(r(2 * D - M)) - 0.040923 * Math.sin(r(M - Mp)) - 0.03472 * Math.sin(r(D))
    - 0.030383 * Math.sin(r(M + Mp));
  const ayanamsa = 23.853 + (at.getUTCFullYear() + at.getUTCMonth() / 12 - 2000) * 0.013969;
  return norm(lon - ayanamsa);
}

/** Moon sign(s) possible on a date (IST). One sign when the Moon stayed in it all day, two when it changed sign. */
export function moonSignsOn(isoDate: string): number[] {
  const start = new Date(`${isoDate}T00:00:00+05:30`), end = new Date(`${isoDate}T23:59:00+05:30`);
  const a = Math.floor(moonLongitude(start) / 30), b = Math.floor(moonLongitude(end) / 30);
  return a === b ? [a] : [a, b];
}

const ELEMENT = ["fire", "earth", "air", "water"];
const LINES: Record<string, string> = {
  same: "two {e} Moons. You read each other quickly, and you both need the same kind of care.",
  "fire-air": "fire and air Moons. Lots of spark and big plans; slow down for the small talks.",
  "earth-water": "earth and water Moons. Steady and caring; say the soft things out loud.",
  "fire-earth": "fire and earth Moons. One rushes, one plans. Patience makes this work.",
  "fire-water": "fire and water Moons. Strong feelings both ways; gentle words matter.",
  "air-earth": "air and earth Moons. Ideas meet practicality. Agree on the plan, then the dream.",
  "air-water": "air and water Moons. Head and heart. Listen for what's under the words.",
};
export function previewLine(mine: number, theirs: number): string {
  const a = ELEMENT[mine % 4], b = ELEMENT[theirs % 4];
  const key = a === b ? "same" : [a, b].sort((x, y) => ELEMENT.indexOf(x) - ELEMENT.indexOf(y)).join("-");
  return `${SIGNS[mine]} and ${SIGNS[theirs]}: ${(LINES[key] ?? LINES.same).replace("{e}", a)}`;
}

export const NAKSHATRAS = ["Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha", "Magha",
  "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha", "Mula", "Purva Ashadha",
  "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati"];
