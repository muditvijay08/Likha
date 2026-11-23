// Chat under load (demo mode): 70 quick messages in one chat. Every message must show at once (before the server answers),
// the box must clear straight away, nothing may duplicate, "Seen" must update live, older messages must page in,
// and typing must stay fast with a long chat on screen.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("PASS |", msg); } else { fail++; console.log("FAIL |", msg); } };
const seen = (loc, t = 6000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);

const old = Array.from({ length: 150 }, (_, i) => ({ id: `old-${i}`, mine: i % 2 === 0, kind: "text", body: `Earlier message ${i + 1}`, media_url: null, held: false,
  read_at: new Date(Date.now() - 864e5).toISOString(), created_at: new Date(Date.now() - 2 * 864e5 + i * 60e3).toISOString() }));
const SEED = {
  phone: "+919829041235", signedIn: true, consents: ["terms_privacy", "birth_matching", "selfie"],
  profile: { first_name: "Aarav", gender: "man", onboarding_step: 11, selfie_status: "passed", created: Date.now() - 3 * 864e5, height_cm: 178,
             profession: "Product manager", diet: "vegetarian", drinking: "socially", smoking: "never", goal: "matchmaking" },
  city: { id: "c-jaipur", slug: "jaipur", name: "Jaipur", status: "live" },
  birth: { date: "1997-08-14", time: "21:10", place: { name: "Jaipur", country: "IN", label: "Jaipur", lat: 26.91, lng: 75.79 }, tz: "Asia/Kolkata", offsetMinutes: 330 },
  photos: [{ id: "p1", position: 1, url: "", status: "approved" }, { id: "p2", position: 2, url: "", status: "approved" }],
  prompts: [{ key: "a", answer: "x" }, { key: "b", answer: "y" }], interests: [1], prefs: { age_min: 21, age_max: 35, distance: "same_city", diets: [] },
  bonus: 200, kundliAt: 1, pushTokens: [],
  likes: ["s-sanya"], matches: [{ id: "m-s-sanya", other: "s-sanya", at: Date.now() - 3 * 864e5 }],
  chats: { "m-s-sanya": old },
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${BASE}/offline`);
await page.evaluate((s) => localStorage.setItem("likha-demo-db", JSON.stringify(s)), SEED);

await page.goto(`${BASE}/chat/m-s-sanya`);
ok(await seen(page.getByText("Earlier message 150", { exact: true })), "Long chat opens on the newest message");
ok(!(await page.getByText("Earlier message 50", { exact: true }).count()), "Only the latest 100 load at first");
const box = page.locator("#msg");

// typing speed with 100 messages on screen
let t0 = Date.now();
await box.pressSequentially("Typing should feel instant even in a long chat", { delay: 0 });
const typeMs = Date.now() - t0;
ok(typeMs < 2500, `Typing 46 characters takes ${typeMs} ms`);
await box.fill("");

// 70 messages as fast as Enter can be pressed
t0 = Date.now();
const slow = [];
for (let i = 1; i <= 70; i++) {
  await box.fill(`Quick message ${i}`);
  const t = Date.now();
  await box.press("Enter");
  if (await box.inputValue() !== "") slow.push(`box not cleared at ${i}`);
  await page.getByText(`Quick message ${i}`, { exact: true }).waitFor({ timeout: 2000 }).catch(() => slow.push(`#${i} missing`));
  if (Date.now() - t > 400) slow.push(`#${i} took ${Date.now() - t} ms`);
}
const total = Date.now() - t0;
ok(slow.length === 0, `70 messages each show at once, box clears every time ${slow.slice(0, 5).join(", ")}`);
ok(total < 30000, `70 messages sent in ${(total / 1000).toFixed(1)} s`);
await page.waitForTimeout(1500);
const counts = await page.evaluate(() => {
  const t = [...document.querySelectorAll("div")].filter((d) => d.children.length === 0).map((d) => d.textContent ?? "").filter((x) => /^Quick message \d+$/.test(x));
  return { all: t.length, unique: new Set(t).size };
});
ok(counts.all === 70 && counts.unique === 70, `No duplicates or missing messages (${counts.unique}/70)`);
ok(!(await page.getByText("Sending…").count()), "Every message confirmed by the server");
ok(!(await page.getByText("Not sent · tap to try again").count()), "None failed");

// order is kept: the last message is on screen at the bottom
ok(await page.getByText("Quick message 70", { exact: true }).isVisible(), "Chat follows to the newest message");

// load earlier
await page.evaluate(() => window.scrollTo(0, 0));
await page.getByRole("button", { name: "Load earlier messages" }).click();
ok(await seen(page.getByText("Earlier message 1", { exact: true })), "Load earlier brings back the oldest messages");

// reload: everything persisted, nothing doubled
await page.reload();
ok(await seen(page.getByText("Quick message 70", { exact: true })), "After a reload the last message is there");
const after = await page.evaluate(() => [...document.querySelectorAll("div")].filter((d) => d.children.length === 0).map((d) => d.textContent ?? "").filter((x) => /^Quick message \d+$/.test(x)).length);
ok(after === 70, `After a reload: 70 quick messages, no doubles (${after})`);

// live "Seen": a fresh chat where the sample reads and replies (demo)
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem("likha-demo-db")); d.chats["m-s-sanya"] = []; localStorage.setItem("likha-demo-db", JSON.stringify(d)); });
await page.goto(`${BASE}/chat/m-s-sanya`);
await box.fill("Hello Sanya");
await box.press("Enter");
ok(await seen(page.getByText(/sample reply in demo mode/), 5000), "Reply arrives live");
ok(errors.length === 0, `no page errors ${errors.join(" | ")}`);
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
