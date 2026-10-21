// What Admin controls in the member app (demo mode): Home banner, switched-off features, republished Terms, maintenance.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = new URL("./shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("PASS |", msg); } else { fail++; console.log("FAIL |", msg); } };
const seen = (loc, t = 6000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);

const SEED = {
  phone: "+919829041235", signedIn: true, consents: ["terms_privacy", "birth_matching", "selfie"],
  profile: { first_name: "Aarav", gender: "man", onboarding_step: 11, selfie_status: "passed", created: Date.now() - 3 * 864e5, height_cm: 178,
             profession: "Product manager", diet: "vegetarian", drinking: "socially", smoking: "never", goal: "matchmaking" },
  city: { id: "c-jaipur", slug: "jaipur", name: "Jaipur", status: "live" },
  birth: { date: "1997-08-14", time: "21:10", place: { name: "Jaipur", country: "IN", label: "Jaipur, Rajasthan, India", lat: 26.91, lng: 75.79 }, tz: "Asia/Kolkata", offsetMinutes: 330 },
  photos: [{ id: "p1", position: 1, url: "", status: "approved" }, { id: "p2", position: 2, url: "", status: "approved" }],
  prompts: [{ key: "about_you", answer: "Chai first, plans later." }, { key: "fond_of", answer: "Old Hindi songs." }], interests: [1],
  prefs: { age_min: 21, age_max: 35, distance: "same_city", diets: [] }, bonus: 70, kundliAt: 1, pushTokens: [],
  likes: ["s-sanya"], matches: [{ id: "m-s-sanya", other: "s-sanya", at: Date.now() - 36e5 }],
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = (n) => page.screenshot({ path: `${OUT}Gates-${n}.png`, fullPage: true });
const admin = (v) => page.evaluate((x) => localStorage.setItem("likha-demo-admin", JSON.stringify(x)), v);

await page.goto(`${BASE}/offline`);
await page.evaluate((s) => localStorage.setItem("likha-demo-db", JSON.stringify(s)), SEED);
await admin({ announcement: { id: "a1", text: "Diwali: 20% more credits on every pack", link: "/store" }, features: { imagine_us: false, saathi: false } });

await page.goto(`${BASE}/home`);
ok(await seen(page.getByRole("note", { name: "Announcement" }).getByText("Diwali: 20% more credits")), "Home: banner from Admin");
await page.getByRole("button", { name: "Close announcement" }).click();
await page.reload();
ok(await seen(page.getByRole("heading", { name: /Hey Aarav/ })) && (await page.getByRole("note", { name: "Announcement" }).count()) === 0, "Home: closed banner stays closed");
await shot("01-home");

await page.goto(`${BASE}/menu`);
ok(await seen(page.getByRole("link", { name: /Couple Mode/ })) && (await page.getByRole("link", { name: /Saathi/ }).count()) === 0, "Menu: switched-off Saathi hidden");
await page.goto(`${BASE}/saathi`);
ok(await seen(page.getByRole("heading", { name: "Not available right now" })), "Saathi: direct link says not available");
await page.goto(`${BASE}/couple`);
ok((await page.getByRole("heading", { name: "Not available right now" }).count()) === 0, "Couple Mode still opens");

await admin({ consent: { key: "terms_privacy", version: "1.1", title: "Terms and Privacy Policy", body: "I agree to the updated Terms of use and Privacy policy." } });
await page.goto(`${BASE}/home`);
ok(await seen(page.getByRole("heading", { name: "We've updated a few things" })), "Consent: updated Terms shown before the app");
ok(!(await page.getByLabel(/I agree to the Terms/).isChecked()), "Consent: box starts unticked");
await page.getByRole("button", { name: "Agree and continue" }).click();
ok(await seen(page.getByText("Tick each box to continue.")), "Consent: must tick to continue");
await shot("02-consent");
await page.getByLabel(/I agree to the Terms/).check(); await page.getByRole("button", { name: "Agree and continue" }).click();
ok(await seen(page.getByRole("heading", { name: /Hey Aarav/ })), "Consent: accepted, Home opens");
await page.reload();
ok(await seen(page.getByRole("heading", { name: /Hey Aarav/ })), "Consent: not asked again");

await admin({ maintenance: "Back in 30 minutes. The stars are recharging." });
await page.goto(`${BASE}/home`);
ok(await seen(page.getByRole("heading", { name: "Likha is taking a short break" })) && await seen(page.getByText("The stars are recharging")), "Maintenance: message on every screen");
await shot("03-maintenance");
await admin({});
await page.goto(`${BASE}/home`);
ok(await seen(page.getByRole("heading", { name: /Hey Aarav/ })), "Maintenance off: app back");

await admin({ minVersion: "9.0.0" });
await page.goto(`${BASE}/home`);
ok(await seen(page.getByRole("heading", { name: "A new version of Likha is ready" })) && await seen(page.getByRole("button", { name: "Refresh" })), "Old app version asks to refresh");
await admin({});
await page.goto(`${BASE}/profile/s-tanvi`);
ok(await seen(page.getByRole("button", { name: "Cosmic Like · free this week" })), "Cosmic Like: first one this week shown as free");

ok(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
