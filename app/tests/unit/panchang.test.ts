// node --experimental-strip-types --test tests/unit/panchang.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { clock, clockRange, dayPlan, fmt, goldenHours, horas, rahuKaal, sunTimes } from "../../src/lib/panchang.ts";

test("Jaipur 18 Aug 2026 (Tuesday) matches the published panchang: sunrise 05:59, sunset 19:01, Rahu Kaal 15:45–17:23", () => {
  const s = sunTimes(2026, 8, 18, 26.9124, 75.7873, 330);
  assert.ok(Math.abs(s.sunrise - (5 * 60 + 59)) <= 2, fmt(s.sunrise));
  assert.ok(Math.abs(s.sunset - (19 * 60 + 1)) <= 2, fmt(s.sunset));
  const r = rahuKaal(s, 2);
  assert.ok(Math.abs(r[0] - (15 * 60 + 45)) <= 3 && Math.abs(r[1] - (17 * 60 + 23)) <= 3, `${fmt(r[0])}–${fmt(r[1])}`);
});

test("Rahu Kaal on a Tuesday is the 7th part of the day", () => {
  const s = { sunrise: 360, sunset: 1080, noon: 720 };                // 6 AM to 6 PM: parts of 90 min
  assert.deepEqual(rahuKaal(s, 2), [360 + 6 * 90, 360 + 7 * 90]);     // 3:00–4:30 PM
  assert.deepEqual(rahuKaal(s, 1), [450, 540]);                       // Monday 7:30–9:00 AM
});

test("First hora of the day belongs to the weekday lord, then Chaldean order", () => {
  const h = horas({ sunrise: 360, sunset: 1080, noon: 720 }, 360, 5);  // Friday
  assert.equal(h[0].planet, "Venus");
  assert.equal(h[1].planet, "Mercury");
  assert.equal(h[2].planet, "Moon");
  assert.equal(h.length, 24);
});

test("Day plan never puts a window inside Rahu Kaal; Golden Hours are in the future", () => {
  const at = new Date("2026-10-20T04:00:00Z");
  const p = dayPlan(26.9124, 75.7873, "Asia/Kolkata", at);
  for (const w of [p.love, p.office, p.travel]) if (w) assert.ok(!(w.start < p.rahu[1] && w.end > p.rahu[0]));
  const g = goldenHours(26.9124, 75.7873, "Asia/Kolkata", at);
  assert.ok(g.length >= 5);
  assert.ok(g.every((x) => x.end > at));
});

test("clock times are shown in the city's time zone", () => {
  const a = new Date("2026-10-20T14:10:00Z"), b = new Date("2026-10-20T15:40:00Z");      // 7:40 PM and 9:10 PM IST
  assert.equal(clock(a, "Asia/Kolkata").replace(/\s/g, " "), "7:40 PM");
  assert.equal(clockRange(a, b, "Asia/Kolkata").replace(/\s/g, " "), "7:40–9:10 PM");
  assert.equal(clock(a, "Asia/Dubai").replace(/\s/g, " "), "6:10 PM");
});

test("approximate Moon sign matches the kundli engine (NASA JPL) to within half a degree", async () => {
  const { moonLongitude, moonSignsOn } = await import("../../src/lib/moon.ts");
  // values from kundli/likha_kundli/astro.py sidereal_positions (Skyfield + DE421, Lahiri)
  const ref: [string, number][] = [["1999-03-14T01:12:00Z", 281.38], ["2000-01-01T00:00:00Z", 193.44], ["1997-11-09T06:30:00Z", 310.85], ["2010-06-15T12:00:00Z", 100.88]];
  for (const [t, lon] of ref) assert.ok(Math.abs(moonLongitude(new Date(t)) - lon) < 0.5, `${t}: ${moonLongitude(new Date(t))} vs ${lon}`);
  assert.deepEqual(moonSignsOn("1999-03-14"), [9]);          // Capricorn all day
  assert.ok(moonSignsOn("1999-03-15").length >= 1);
});
