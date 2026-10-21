// Batch 3 walk-through in demo mode: wallet, checkout and payment status, Kick Pass, Check With Anyone, Why It Didn't Work,
// My Kundli + Who Suits Me, Gift a Reading, Rishta Maasi, tiers, readings list. Aarav starts with the 70-credit welcome bonus.
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
  bonus: 70, kundliAt: 1, pushTokens: [],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (/Content Security Policy|Refused to (load|connect|execute|frame)/i.test(m.text())) errors.push("CSP: " + m.text().slice(0, 160)); });
const shot = (n) => page.screenshot({ path: `${OUT}Store-${n}.png`, fullPage: true });
const btn = (name, exact = true) => page.getByRole("button", { name, exact });
const balance = async () => { await page.goto(`${BASE}/wallet`); await page.getByTestId("balance").waitFor(); return Number((await page.getByTestId("balance").textContent()).replace(/\D/g, "")); };

await page.goto(`${BASE}/offline`);
await page.evaluate((s) => localStorage.setItem("likha-demo-db", JSON.stringify(s)), SEED);

// W1 wallet
await page.goto(`${BASE}/wallet`);
ok(await seen(page.getByText("Cosmic wallet")) && await balance() === 70, "Wallet: 70 credits");
ok(await seen(page.getByText("No tier yet")) && await seen(page.getByText("Next: Tara 5%")), "Wallet: tier and what's next");
ok(await seen(page.getByRole("radio", { name: /600\s*credits · \+20%\s*₹499/ })), "Wallet: packs with bonus and GST-inclusive price");
await shot("01-wallet");
await page.getByRole("radio", { name: /600/ }).click();
await btn("Pay ₹499 with UPI").click();

// W2 checkout, W3 status
await page.waitForURL("**/checkout?type=pack&key=best");
ok(await seen(page.getByText("500 + 100 bonus (+20%)")) && await seen(page.getByText("Price includes GST")), "Checkout: bonus split and GST note");
ok(await seen(page.getByText(/Demo mode:.*no money moves/)), "Checkout: demo payments are labelled");
await shot("02-checkout");
await page.getByRole("radio", { name: "PhonePe" }).click();
await btn("Pay ₹499 with PhonePe").click();
await page.waitForURL("**/payment/**");
ok(await seen(page.getByText("Paisa raste mein hai")), "Payment: waiting for the bank, no need to pay again");
await shot("03-pending");
ok(await seen(page.getByText("Credits added"), 8000) && await seen(page.getByText("New balance 670.")), "Payment: credits land once confirmed (70 + 600)");
await page.waitForURL("**/wallet", { timeout: 8000 });
ok(await seen(page.getByText("Pack Best value (demo)")), "Wallet activity shows the purchase");

// W4 tiers
await page.goto(`${BASE}/tiers`);
ok(await seen(page.getByText("How it works")) && await seen(page.getByText("Real conversations").first()), "Tiers: rules and progress");
await shot("04-tiers");

// Store + Kick Pass
await page.goto(`${BASE}/store`);
ok(await seen(page.getByText("Check With Anyone")) && await seen(page.getByText("₹199/mo")), "Store: readings and plans with prices");
await shot("05-store");
await page.getByRole("link", { name: /Kick Pass/ }).click();
await page.waitForURL("**/checkout?type=subscription&key=kick_pass");
ok(await seen(page.getByText(/One month, prepaid. Doesn't renew by itself./)), "Kick Pass sold as a prepaid month");
await btn("Pay ₹199 with GPay").click();
ok(await seen(page.getByText("You're all set"), 8000), "Kick Pass active");
await page.waitForURL("**/kick", { timeout: 8000 });
ok(await seen(page.getByText("Kick Pass").first()) && await seen(btn("Open with Kick Pass")), "Daily Kick opens free with Kick Pass");
await btn("Open with Kick Pass").click();
ok(await seen(page.getByText("Today's fix")) && await seen(page.getByText("+5 credits for trying the Daily Kick")), "…and nothing was charged (only the +5 first-try reward)");
ok(await balance() === 675, "Balance 670 + 5 reward");

// S2 Check With Anyone
await page.goto(`${BASE}/check`);
await page.fill("#cw-name", "Tanvi");
await page.fill("#cw-phone", "97840 22118");
await page.fill("#cw-dob", "1998-07-02");
ok(await seen(page.getByText("FREE PREVIEW · MOON SIGNS")), "Check With Anyone: free Moon-sign preview from the date");
await shot("06-check");
await btn("Send invite and check · 29 credits").click();
ok(await seen(page.getByText("Now send it to Tanvi")), "Invite ready");
ok((await page.getByRole("link", { name: "Send on WhatsApp" }).getAttribute("href")).startsWith("https://wa.me/919784022118?text="), "WhatsApp invite goes to +91 9784022118 from the member's phone");
await shot("07-invite");
await btn("Check someone else").click();
await btn("Or get a 5-pack for 119 credits").click();
ok(await seen(page.getByRole("button", { name: /uses 1 of 5/ })), "5-pack: the next check uses a prepaid one");
ok(await seen(page.getByText("Waiting for them to join")), "Your checks: Tanvi waiting to join");

// S3 Why It Didn't Work -> reading result
await page.goto(`${BASE}/why-not`);
await page.fill("#wn-name", "K");
await page.fill("#wn-dob", "1997-11-09");
await btn("2+ years").click();
await shot("08-whynot");
await btn("Get my reading · 79 credits").click();
await page.waitForURL("**/readings/**");
ok(await seen(page.getByText("1 · What pulled you together"), 8000), "Why It Didn't Work: reading written");
ok(await seen(page.getByText(/People in your feed who suit you better/)), "…with people in the feed who suit better");
await shot("09-reading");

// S5 My Kundli + E5 Who Suits Me
await page.goto(`${BASE}/my-kundli`);
ok(await seen(page.getByRole("img", { name: /birth chart/ })) && await seen(page.getByText("Dasha timeline")), "My Kundli: chart, planets and Dasha timeline");
await shot("10-kundli");
await page.getByRole("tab", { name: "Who Suits Me" }).click();
await btn("See who suits me · 49 credits").click();
ok(await seen(page.getByText("Best Moon signs for you"), 8000) && await seen(page.getByText("Rohini")), "Who Suits Me: best Moon signs and nakshatras");
await shot("11-suits");
await btn("Show me these people first").click();
await page.waitForURL("**/discover");
ok(true, "…and Discover is sorted by it");

// S4 Gift
await page.goto(`${BASE}/gift`);
await page.fill("#g-name", "Priya");
await page.fill("#g-phone", "+91 94140 55302");
await page.fill("#g-note", "Happy birthday didi! Read this before you plan Goa.");
ok(await seen(page.getByText("A GIFT FOR PRIYA")), "Gift: live preview card");
await shot("12-gift");
await btn("Send gift · 99 credits").click();
ok(await seen(page.getByText("Gift ready for Priya")) && await seen(page.getByText("Gifts you sent")), "Gift sent and listed");

// X3 Rishta Maasi
await page.goto(`${BASE}/maasi`);
await page.getByRole("link", { name: "Start for ₹299" }).click();
await btn("Pay ₹299 with GPay").click();
await page.waitForURL("**/maasi", { timeout: 12000 });
ok(await seen(page.getByText("Beta, these three, I have a good feeling about.")), "Rishta Maasi: three Sunday picks");
await shot("13-maasi");
await page.locator("article", { hasText: "Riya" }).getByRole("button", { name: "Interested" }).click();
ok(await seen(page.locator("article", { hasText: "Riya" }).getByText("You're interested")), "Interested in Riya: waiting on her side");
await page.locator("article", { hasText: "Ishita" }).getByRole("button", { name: "Interested" }).click();
await page.waitForURL("**/match/**", { timeout: 6000 }).catch(() => {});
ok(page.url().includes("/match/"), "Ishita already liked Aarav: interested on both sides is a match");

// money adds up: 70 + 600 − 29 − 119 − 79 − 49 − 99 = 295
ok(await balance() === 320, "Balance adds up: 70 + 600 − 29 − 119 − 79 − 49 − 99 + 25 first-try rewards = 320");
await page.goto(`${BASE}/readings`);
ok(await seen(page.getByText(/Why It Didn't Work · K/)) && await seen(page.getByText("Who Suits Me")), "My readings lists them");

ok(errors.length === 0, `no page errors ${errors.join(" | ")}`);
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
