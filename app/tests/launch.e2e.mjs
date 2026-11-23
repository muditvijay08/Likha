// Launch features in demo mode: Plan a date (invite, share, check-in, reflection), Mutual Intent Check, Events
// (browse, RSVP, report, post for review), Be a Cupid rewards as credits, and Why It Didn't Work with its safeguards.
// Aarav (verified) has matched with Sanya, a labelled sample profile. The page clock is moved forward for the date itself.
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
  birth: { date: "1997-08-14", time: "21:10", place: { name: "Jaipur", country: "IN", label: "Jaipur", lat: 26.91, lng: 75.79 }, tz: "Asia/Kolkata", offsetMinutes: 330 },
  photos: [{ id: "p1", position: 1, url: "", status: "approved" }, { id: "p2", position: 2, url: "", status: "approved" }],
  prompts: [{ key: "a", answer: "x" }, { key: "b", answer: "y" }], interests: [1], prefs: { age_min: 21, age_max: 35, distance: "same_city", diets: [] },
  bonus: 200, kundliAt: 1, pushTokens: [], likes: ["s-sanya"], matches: [{ id: "m-s-sanya", other: "s-sanya", at: Date.now() - 36e5 }],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = (n) => page.screenshot({ path: `${OUT}Launch-${n}.png`, fullPage: false });
const btn = (name) => page.getByRole("button", { name, exact: true });
await page.clock.install({ time: new Date() });

await page.goto(`${BASE}/offline`);
await page.evaluate((s) => localStorage.setItem("likha-demo-db", JSON.stringify(s)), SEED);

// C6 Plan a date: from the chat shortcut
await page.goto(`${BASE}/chat/m-s-sanya`);
await page.getByRole("link", { name: "Plan a date" }).click();
await page.waitForURL("**/date/m-s-sanya");
ok(await seen(page.getByText("Ask Sanya out")), "Plan a date opens from the chat");
ok(!(await page.locator("#d-public").isChecked()), "Public-place box starts unticked");
await page.fill("#d-place", "Tapri Central, C-Scheme");
ok(await btn("Send invitation").isDisabled(), "Can't send until the member confirms a public place");
await page.locator("#d-public").check();
await page.fill("#d-note", "Call me on 9829012345");
await btn("Send invitation").click();
ok(await seen(page.getByText("No phone numbers, links or handles in invitations.")), "Phone numbers are refused in invitations");
await page.fill("#d-note", "Their masala chai is the best");
await page.locator("#d-public").check();
await btn("Send invitation").click();
ok(await seen(page.getByText("Waiting for Sanya to say yes or no.")), "Invitation sent, waiting for an answer");
await page.clock.runFor(3500);
ok(await seen(page.getByText("Confirmed"), 8000), "Sanya said yes (demo sample)");
await shot("01-date");
await page.getByRole("link", { name: "Share my plan with someone I trust" }).click();
await page.waitForURL("**/share-date**");
ok((await page.inputValue("#sd-place")) === "Tapri Central, C-Scheme", "Share my plan is pre-filled with the place");

// the date itself: check-in opens an hour before
const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(17, 0, 0, 0);
await page.clock.setSystemTime(new Date(start.getTime() + 30 * 60e3));
await page.goto(`${BASE}/date/m-s-sanya`);
ok(await seen(page.getByText("All okay?")), "Safety check-in during the date");
await btn("I'm okay").click();
ok(await seen(page.getByText(/You told us you're okay/)), "Check-in saved, help still one tap away");
// after: private reflection
await page.clock.setSystemTime(new Date(start.getTime() + 20 * 3600e3));
await page.goto(`${BASE}/date/m-s-sanya`);
ok(await seen(page.getByText(/Would you meet Sanya again/)) && await seen(page.getByText(/never sees your answer/)), "Private reflection after the date");
await page.fill(`input[placeholder="A note for yourself (optional)"]`, "Easy to talk to");
await btn("Yes").click();
ok(await seen(page.getByText("You both want a second date. Plan the next one below.")), "Second date shown only when both said yes");
await shot("02-reflection");
await page.clock.setSystemTime(new Date());

// C7 Mutual Intent Check
await page.goto(`${BASE}/intent/m-s-sanya`);
ok(await seen(page.getByText(/You see Sanya's answers only when you've both answered/)), "Intent check: hidden until both answer");
const save = page.getByRole("button", { name: "Answer and see Sanya's" });
ok(await save.isDisabled(), "All four questions needed");
for (const a of ["Something serious", "Within a year", "Once it's serious", "Soon, after we meet"]) await btn(a).click();
await save.click();
ok(await seen(page.getByText("2 of 4 on the same page")), "Reveal: counted, never a score");
ok(await seen(page.getByText("Close", { exact: true })) && await seen(page.getByText(/You: Within a year · Sanya: 1 to 2 years/)), "Side by side, with what to talk about");
await shot("03-intent");

// V1–V3 Events
await page.goto(`${BASE}/discover`);
await page.getByRole("link", { name: "Events" }).click();
await page.waitForURL("**/events");
ok(await seen(page.getByText("Sunrise walk at Nahargarh")) && await seen(page.getByText(/Sample event/)), "Events: sample events, labelled");
await btn("Music").click();
ok(await seen(page.getByText("Sufi night at the stepwell")) && !(await page.getByText("Sunrise walk at Nahargarh").isVisible()), "Filter by kind");
await btn("All").click();
await page.getByText("Sunrise walk at Nahargarh").click();
ok(await seen(page.getByText("14 going")) && await seen(page.getByText("We never show who is going.")), "Event: counts only, never names");
await btn("I'm going").click();
ok(await seen(page.getByText("15 going")) && await seen(page.getByRole("button", { name: "Going ✓" })), "RSVP going");
ok(await seen(page.getByRole("link", { name: /Tell someone you trust/ })), "Going: tell someone you trust");
await btn("Report this event").click();
await page.fill("#ev-report", "Asked for money on WhatsApp");
await btn("Send report").click();
ok(await seen(page.getByText("Thanks. Our team will look at it.")), "Report an event");
await shot("04-event");

await page.goto(`${BASE}/events/new`);
ok(!(await page.locator("#ev-public").isChecked()), "Post: public-venue box starts unticked");
await page.fill("#ev-title", "Sunday cycling at Central Park");
await page.fill("#ev-desc", "Easy 10 km loop, then chai. Call 9829012345 to join.");
await page.fill("#ev-venue", "Central Park, Gate 2");
await page.fill("#ev-area", "C-Scheme");
ok(await btn("Send for review").isDisabled(), "Post: can't send until public venue is confirmed");
await page.locator("#ev-public").check();
await btn("Send for review").click();
ok(await seen(page.getByText("No phone numbers, links, emails or handles in events.")), "Post: contact details refused");
await page.fill("#ev-desc", "Easy 10 km loop around the park, then chai. Bring a helmet.");
await btn("Send for review").click();
ok(await seen(page.getByText(/Waiting for our team to review/)), "Post: waits for the team before anyone sees it");
await page.goto(`${BASE}/events`);
ok(!(await page.getByText("Sunday cycling at Central Park").isVisible()), "Pending event isn't listed for others");
await page.getByRole("tab", { name: "Mine" }).click();
ok(await seen(page.getByText("Waiting for review")) && await seen(page.getByText("Sunday cycling at Central Park")), "Mine: hosting, waiting for review");
await shot("05-events-mine");

// K1 Be a Cupid: credits first
await page.goto(`${BASE}/cupid`);
ok(await seen(page.getByText("Bring your people to Likha. Earn credits.")) && await seen(page.getByText(/20 credits when someone you bring/)), "Cupid: rewards as credits");
ok(!(await page.getByRole("checkbox").isChecked()), "Cupid terms start unticked");
await page.getByRole("checkbox").check();
await btn("Become a Cupid").click();
ok(await seen(page.getByText("CREDITS EARNED")) && await seen(page.getByText("Rewards as credits")), "Cupid dashboard: credits earned");
ok(await seen(page.getByRole("link", { name: "Add PAN for cash" })) && !(await page.getByRole("button", { name: "Switch to cash" }).isVisible()), "Cash only after PAN and UPI are checked");
await shot("06-cupid");

// S3 Why It Didn't Work: confirm first, first name only
await page.goto(`${BASE}/why-not`);
await page.fill("#wn-name", "Rahul Sharma");
await page.fill("#wn-dob", "1995-03-02");
const buy = page.getByRole("button", { name: /Get my reading/ });
ok(!(await page.locator("#wn-ok").isChecked()) && await buy.isDisabled(), "Why Not: confirmation box starts unticked and is required");
ok(await seen(page.getByText(/We keep only a first name/)), "Why Not: first name only, details deleted");
await page.locator("#wn-ok").check();
await buy.click();
await page.waitForURL("**/readings/**");
await page.clock.runFor(2500);
ok(await seen(page.getByText("You and Rahul"), 8000) && !(await page.getByText("Sharma").isVisible()), "Reading keeps the first name only");
await shot("07-whynot");

ok(errors.length === 0, `no page errors ${errors.join(" | ")}`);
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
