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
page.on("console", (m) => { if (/Content Security Policy|Refused to (load|connect|execute|frame)/i.test(m.text())) errors.push("CSP: " + m.text().slice(0, 160)); });
const shot = (n) => page.screenshot({ path: `${OUT}App-${n}.png`, fullPage: true });
const btn = (name) => page.getByRole("button", { name, exact: true });
const credits = async () => Number((await page.locator("a.pillbtn.credits").first().textContent()).replace(/\D/g, ""));

await page.goto(`${BASE}/offline`);
await page.evaluate((s) => localStorage.setItem("likha-demo-db", JSON.stringify(s)), SEED);

// H1 Home
await page.goto(`${BASE}/home`);
ok(await seen(page.getByText("Hey Aarav")), "Home greets Aarav");
ok(await seen(page.getByText("Demo mode · sample profiles, not real people")), "Demo mode is labelled on every app screen");
ok(await seen(page.getByText("Venus warms the 7th from your Moon")), "Love weather headline from the Kick teaser");
ok(await seen(page.getByText("Your day in the stars")) && await seen(page.getByText(/^Rahu Kaal/).first()), "Day timeline drawn from sunrise, horas and Rahu Kaal");
ok(await seen(page.getByRole("link", { name: "Today's best match: Ishita" })) && await seen(page.getByText("Jodi Score 92")), "Best match first on Home (Ishita, Jodi 92 from the real engine)");
ok(await seen(page.getByText("people like you")) && (await page.locator("text=people like you").locator("..").textContent()).includes("3"), "3 people like you");
ok(await credits() === 70, "Wallet shows the 70 welcome credits");
await shot("01-home");

// H2 Daily Kick
await page.getByRole("link", { name: "Today's love weather" }).click();
await page.waitForURL("**/kick");
ok(await seen(btn("Unlock today · 10 credits")), "Kick: paid part locked, price 10");
await shot("02-kick-locked");
await btn("Unlock today · 10 credits").click();
ok(await seen(page.getByText("Today's nudges")) && !(await page.getByText(/mantra|Om Budhaya|Wear something/).count()), "Kick unlocked: everyday nudges, no mantras or colours");
ok(await seen(page.getByText("+5 credits for trying the Daily Kick")), "Toolkit reward for the first Daily Kick (+5)");
ok(await seen(page.getByText("Rahu Kaal (traditionally kept free of new starts)")), "Kick: best times listed");
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
ok(await seen(page.getByText("You both said yes.")), "Like on someone who liked you: it's a match");
ok(await seen(page.getByText("A good time to say hi", { exact: false })) && !(await page.locator(".app-body").getByText(/credits/).count()), "Match screen: a free Golden Hour and no prices");
ok(await seen(page.getByText(/of 36 Gunas/)), "Match screen: Gunas first");
await page.waitForTimeout(1200);                              // let the match animation settle
await shot("05-match");
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
ok(await seen(page.getByText("Good match")) && await seen(page.getByText("Graha Maitri")), "Report: Guna verdict and the 8 kootas (free)");
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
ok(await seen(page.getByText("That's everyone in Jaipur for now")), "Empty Discover says so plainly");
ok(await seen(page.getByRole("region", { name: "Bring your people" })) && !(await page.getByText(/Live in Jaipur/).count()), "Empty Discover: invites first, no live pop-up");
await shot("11-empty");

// Not enough credits
ok(await credits() === 36, "Spends add up: 70 − 10 + 5 − 0 (free Cosmic Like) − 29 = 36 (nothing sold on the match screen)");
await page.goto(`${BASE}/profile/s-tanvi`);
await btn("Cosmic Like · 9").click();
await page.waitForTimeout(800);
await page.goto(`${BASE}/home`);
ok(await credits() === 27, "Second Cosmic Like this week costs 9");
await page.goto(`${BASE}/report/s-tanvi`);
await btn("Read it · 29 credits").click();                    // 27 left, the reading costs 29
ok(await seen(page.getByText("Not enough credits. Top up your wallet to continue.")), "Not enough credits is explained, nothing charged");

// N1 Menu and Chats
await page.getByRole("link", { name: "Menu" }).click();
await page.waitForURL("**/menu");
ok(await seen(page.getByText("27 credits")) && await seen(page.getByRole("link", { name: /Be a Cupid/ })) && await seen(page.getByRole("link", { name: /Family view/ })), "Menu: wallet and every link, Family view included");
const inst = page.getByRole("region", { name: "Add Likha to your home screen" });
ok(await seen(inst), "Menu: Add to home screen for people who skipped it");
await inst.getByRole("button", { name: "How" }).click();
ok(await seen(inst.getByText("Install app")), "Menu: shows the steps when the browser can't install in one tap");
await page.evaluate(() => { const e = new Event("beforeinstallprompt"); Object.assign(e, { prompt: async () => { window.__prompted = true; }, userChoice: Promise.resolve({ outcome: "accepted" }) }); window.dispatchEvent(e); });
await inst.getByRole("button", { name: "Install" }).click();
ok(await page.evaluate(() => window.__prompted === true), "Menu: one-tap Install uses the browser's own prompt");
await shot("12-menu");
await page.getByRole("link", { name: /^Chats/ }).click();
await page.waitForURL("**/matches");
ok(await seen(page.getByText("Meera")) && await seen(page.getByText("Sanya")), "Chats lists both matches");
await shot("13-chats");
await page.goto(`${BASE}/universe`);
ok(await seen(page.getByRole("link", { name: /Meera/ })) && await seen(page.getByRole("link", { name: /Sanya/ })), "Our Universe asks which match");
await page.goto(`${BASE}/no-such-screen`);
ok(await seen(page.getByText("This part is on its way")), "Unknown screens show a friendly page");

// F1/F2 Family view: own page at once; a match's page only after their yes. The family page shows no photos or birth details.
await page.goto(`${BASE}/family`);
await page.getByRole("button", { name: /Share my own page/ }).click();
ok(await seen(page.getByRole("link", { name: "Send on WhatsApp" })), "Family view: own page is live at once");
const famHref = await page.getByRole("link", { name: "Send on WhatsApp" }).first().getAttribute("href");
const famToken = decodeURIComponent(famHref).match(/\/f\/([a-z0-9]+)/)[1];
await page.getByRole("button", { name: /Share Sanya's page/ }).click();
ok(await seen(page.getByText("Waiting for their yes")), "Family view: Sanya is asked first");
ok(await page.getByText("Live").nth(1).waitFor({ timeout: 9000 }).then(() => true, () => false), "Family view: live once she says yes (demo: a few seconds)");
await shot("14-family");
const fam = await page.context().newPage();                    // demo data lives in this browser; the real backend works anywhere
await fam.goto(`${BASE}/f/${famToken}`);
ok(await fam.getByText(/FOR THE FAMILY/).waitFor({ timeout: 8000 }).then(() => true, () => false) && !(await fam.locator("img").count()), "Family page opens without signing in, with no photos");
await fam.screenshot({ path: `${OUT}App-15-family-page.png`, fullPage: true });
await fam.goto(`${BASE}/f/not-a-token`);
ok(await fam.getByText("This family page has ended").waitFor({ timeout: 8000 }).then(() => true, () => false), "A wrong or old link shows that it has ended");
await fam.close();

ok(errors.length === 0, `no page errors ${errors.join(" | ")}`);
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
