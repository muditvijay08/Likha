import assert from "node:assert/strict";
import { cleanBirth, slimChart } from "../functions/_shared/engine_check.ts";

const ok = { date: "1995-03-14", time: "06:30", lat: 26.91, lng: 75.79, tz: "Asia/Kolkata", gender: "man" };
Deno.test("engine check: a good birth passes through", () => assert.deepEqual(cleanBirth(ok), ok));
Deno.test("engine check: bad births give a plain message", () => {
  assert.match(cleanBirth({ ...ok, date: "14/03/1995" }) as string, /Date/);
  assert.match(cleanBirth({ ...ok, time: "6.30pm" }) as string, /24-hour/);
  assert.match(cleanBirth({ ...ok, lat: 95 }) as string, /Latitude/);
  assert.match(cleanBirth({ ...ok, tz: "IST; drop" }) as string, /Time zone/);
  assert.match(cleanBirth({ ...ok, gender: "other" }) as string, /boy or girl/);
  assert.match(cleanBirth(null) as string, /Date/);
});
Deno.test("engine check: only the nine grahas are kept", () => {
  const c = slimChart({ summary: {}, manglik: {}, planets: [{ planet: "Moon", lon: 1, sign_name: "Aries", deg: 1, nakshatra_name: "Ashwini", pada: 1, house: 1 }, { planet: "Uranus", lon: 2 }] });
  assert.equal(c.planets.length, 1); assert.equal(c.planets[0].sign, "Aries");
});
