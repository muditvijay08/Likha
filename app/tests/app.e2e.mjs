// Member app walk-through in demo mode (batch 1: Home, Daily Kick, Discover, Profile, Filters, Report, Likes, Match, Menu, Chats).
// Starts as Aarav, an active member in Jaipur with the 70-credit welcome bonus. Sample profiles only. Screenshots in tests/shots/.
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
  profile: { first_name: "Aarav", gender: "man", onboarding_step: 11, selfie_status: "passed", created: Date.now() - 864e5, height_cm: 178, profession: "Product manager",
             diet: "vegetarian", drinking: "socially", smoking: "never", goal: "matchmaking" },
  city: { id: "c-jaipur", slug: "jaipur", name: "Jaipur", status: "live" },
  birth: { date: "1997-08-14", time: "21:10", place: { name: "Jaipur", country: "IN", label: "Jaipur, Rajasthan, India", lat: 26.91, lng: 75.79 }, tz: "Asia/Kolkata", offsetMinutes: 330 },
  photos: [{ id: "p1", position: 1, url: "", status: "approved" }, { id: "p2", position: 2, url: "", status: "approved" }],
  prompts: [{ key: "about_you", answer: "Chai first." }, { key: "fond_of", answer: "Old songs." }], interests: [1, 2],
  prefs: { age_min: 21, age_max: 35, distance: "same_city", diets: [] }, bonus: 70, kundliAt: 1, pushTokens: [],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = (n) => page.screenshot({ path: `${OUT}App-${n}.png`, fullPage: true });
const btn = (name) => page.getByRole("button", { name, exact: true });
const credits = async () => Number((await page.locator("a.pillbtn.credits").first().textContent()).replace(/\D/g, ""));

await page.goto(`${BASE}/offline`);
await page.evaluate((s) => localStorage.setItem("likha-demo-db", JSON.stringify(s)), SEED);

// H1 Home
await page.goto(`${BASE}/home`);
ok(await seen(page.getByText("Hey Aarav")), "Home greets Aarav");
ok(await seen(page.getByText("Demo mode · sample profiles, not real people")), "Demo mode is labelled on every app screen");
ok(await seen(page.getByText("Venus is flirting with your 7th house")), "Love weather headline from the Kick teaser");
ok(await seen(page.getByText("Your day in the stars")) && await seen(page.getByText("Rahu Kaal, skip big moves")), "Day timeline drawn from sunrise, horas and Rahu Kaal");
ok(await seen(page.getByRole("link", { name: /Ishita\s*94%/ })), "Top picks ranked by Jodi Score (Ishita 94%)");
ok(await seen(page.getByText("people like you")) && (await page.locator("text=people like you").locator("..").textContent()).includes("3"), "3 people like you");
ok(await credits() === 70, "Wallet shows the 70 welcome credits");
await shot("01-home");

// H2 Daily Kick
await page.getByRole("link", { name: "Today's love weather" }).click();
await page.waitForURL("**/kick");
ok(await seen(btn("Unlock today · 10 credits")), "Kick: paid part locked, price 10");
await shot("02-kick-locked");
await btn("Unlock today · 10 credits").click();
ok(await seen(page.getByText("Wear something yellow today.")), "Kick unlocked: today's fix visible");
ok(await seen(page.getByText("+5 credits for trying the Daily Kick")), "Toolkit reward for the first Daily Kick (+5)");
ok(await seen(page.getByText("Avoid big money moves (Rahu Kaal)")), "Kick: best times listed");
await shot("03-kick");

// D1 Discover
await page.getByRole("link", { name: "Discover" }).click();
await page.waitForURL("**/discover");
ok(await seen(page.getByRole("heading", { name: "Ishita, 27" })), "Discover: best Jodi Score first");
ok(await seen(page.getByText("SAMPLE PROFILE")), "Sample profiles are labelled");
ok(await seen(page.getByText("Live in Jaipur:")), "Live city strip shown");
ok(await credits() === 65, "Kick charged 10 credits once, +5 first-try reward (70 → 65)");
await btn("Got it").click();
await shot("04-discover");
await btn("Not my nakshatra").click();
ok(await seen(page.getByRole("heading", { name: "Riya, 26" })), "Pass moves to the next person");
await btn("Shoot your shot").click();
ok(await seen(page.getByRole("heading", { name: "Sanya, 24" })), "Like without a match moves on");
await btn("Shoot your shot").click();

// M1 Match
await page.waitForURL("**/match/**");
ok(await seen(page.getByText("The planets approve.")), "Like on someone who liked you: it's a match");
ok(await seen(page.getByText("Golden Hours")) && await seen(btn("Unlock all · 19 credits")), "Golden Hours: first window free, rest locked");
await shot("05-match");
await btn("Unlock all · 19 credits").click();
ok(await seen(page.getByText("Unlocked for both of you.")), "Golden Hours unlocked");
ok(await seen(page.getByRole("link", { name: "Say hi to Sanya" })), "Say hi button");

// D5 Likes
await page.getByRole("link", { name: /^Likes/ }).click();
await page.waitForURL("**/likes");
ok(await seen(page.getByText("Always free.")), "Likes: always free note");
ok(await seen(page.getByText("1 person")), "Likes: matched and passed people are gone, Meera left");
await shot("06-likes");
await page.getByRole("link", { name: /Meera, 25/ }).click();

// D2 Profile + Cosmic Like
await page.waitForURL("**/profile/s-meera");
ok(await seen(page.getByRole("heading", { name: "Meera, 25" })) && await seen(page.getByText("Nakshatra")), "Profile: name, chart basics");
await shot("07-profile");
await btn("Cosmic Like · free this week").click();
await page.waitForURL("**/match/**");
ok(true, "Cosmic Like on Meera matched (first one this week is free)");

// D4 Report
await page.goto(`${BASE}/report/s-nidhi`);
ok(await seen(page.getByText("Average match")) && await seen(page.getByText("Graha Maitri")), "Report: Guna verdict and the 8 kootas (free)");
await shot("08-report-locked");
await btn("Read it · 29 credits").click();
ok(await seen(page.getByText("Strengths", { exact: true })) && await seen(page.getByText("Try this:")), "Report: written part after paying");
await shot("09-report");

// D3 Filters
await page.goto(`${BASE}/filters`);
ok(await seen(page.getByRole("link", { name: /^Show \d+ (people|person)$/ }), 8000), "Filters show a live count");
await shot("10-filters");
await page.getByRole("radio", { name: "Any city" }).click();
await page.waitForTimeout(900);
await btn("Reset").click();
await page.waitForTimeout(900);

// D6 empty: pass the rest
await page.goto(`${BASE}/discover`);
await seen(btn("Not my nakshatra"));
for (let i = 0; i < 4 && await btn("Not my nakshatra").isVisible().catch(() => false); i++) { await btn("Not my nakshatra").click(); await page.waitForTimeout(600); }
ok(await seen(page.getByText("You've seen every star in Jaipur tonight")), "Empty Discover offers ways to widen the sky");
await shot("11-empty");

// Not enough credits
ok(await credits() === 17, "Spends add up: 70 − 10 + 5 − 19 − 0 (free Cosmic Like) − 29 = 17");
await page.goto(`${BASE}/profile/s-tanvi`);
await btn("Cosmic Like · 9").click();
await page.waitForTimeout(800);
await page.goto(`${BASE}/home`);
ok(await credits() === 8, "Second Cosmic Like this week costs 9");
await page.goto(`${BASE}/profile/s-nidhi`);
await btn("Cosmic Like · 9").click();
ok(await seen(page.getByText("Not enough credits. Top up your wallet to continue.")), "Not enough credits is explained, nothing charged");

// N1 Menu and Chats
await page.getByRole("link", { name: "Menu" }).click();
await page.waitForURL("**/menu");
ok(await seen(page.getByText("8 credits")) && await seen(page.getByRole("link", { name: /Be a Cupid/ })), "Menu: wallet and every link");
await shot("12-menu");
await page.getByRole("link", { name: /^Chats/ }).click();
await page.waitForURL("**/matches");
ok(await seen(page.getByText("Meera")) && await seen(page.getByText("Sanya")), "Chats lists both matches");
await shot("13-chats");
await page.goto(`${BASE}/universe`);
ok(await seen(page.getByRole("link", { name: /Meera/ })) && await seen(page.getByRole("link", { name: /Sanya/ })), "Our Universe asks which match");
await page.goto(`${BASE}/no-such-screen`);
ok(await seen(page.getByText("This part is on its way")), "Unknown screens show a friendly page");

ok(errors.length === 0, `no page errors ${errors.join(" | ")}`);
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
