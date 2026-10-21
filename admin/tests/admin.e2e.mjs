// Admin in demo mode: sign-in with authenticator setup, Keys (write-only, test, go live), AI models (pictures, features, model list).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = new URL("./shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("PASS |", msg); } else { fail++; console.log("FAIL |", msg); } };
const seen = (loc, t = 6000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = (n) => page.screenshot({ path: `${OUT}Admin-${n}.png`, fullPage: true });
const btn = (name, scope = page) => scope.getByRole("button", { name, exact: true });
const row = (k) => page.locator(`tr[data-key="${k}"]`);
const setKey = async (k, v) => { await btn(/^(Set|Replace)$/, row(k)).click(); await row(k).locator("input").fill(v); await btn("Save", row(k)).click(); };

// sign-in
await page.goto(`${BASE}/keys`);
ok(await page.waitForURL("**/login").then(() => true, () => false), "Keys needs sign-in");
await page.getByLabel("Work email").fill("mudit@likha.in");
await btn("Send code").click();
await page.getByLabel("Code", { exact: true }).fill("123456");
await btn("Continue").click();
ok(await seen(page.getByText("Set up your authenticator app")) && await seen(page.getByRole("img", { name: /QR code/ })), "First sign-in sets up the authenticator app");
await shot("01-mfa");
await page.getByLabel("Code from the app").fill("123456");
await btn("Turn on and sign in").click();
ok(await page.waitForURL("**/dashboard").then(() => true, () => false), "Signed in with MFA lands on the dashboard");
await page.getByRole("link", { name: "Keys and integrations" }).click();
await page.waitForURL("**/keys");

// keys
ok(await seen(page.getByText("Payments are in test mode: no real money moves")), "Payments start in test");
await setKey("ANTHROPIC_API_KEY:any", "sk-ant-api03-REALSECRET-abcd");
ok(await seen(row("ANTHROPIC_API_KEY:any").getByText("••••abcd")), "Saved key shows last 4 only");
ok(!(await page.content()).includes("REALSECRET"), "Full key never appears on the page");
await btn("Test", row("ANTHROPIC_API_KEY:any")).click();
ok(await seen(row("ANTHROPIC_API_KEY:any").getByText(/✓ Provider answered 200/)), "Test shows a pass");
await setKey("OPENAI_API_KEY:any", "sk-bad-key-9999");
await btn("Test", row("OPENAI_API_KEY:any")).click();
ok(await seen(row("OPENAI_API_KEY:any").getByText(/✗ Provider refused the key/)), "Test shows a refused key");
await setKey("OPENAI_API_KEY:any", "sk-proj-good-7777");
ok(await seen(row("OPENAI_API_KEY:any").getByText("••••7777")) && !(await seen(row("OPENAI_API_KEY:any").getByText(/refused/), 1000)), "Replacing a key clears the old test result");
await setKey("RAZORPAY_KEY_ID:live", "rzp_test_oops");
ok(await seen(row("RAZORPAY_KEY_ID:live").getByText("A live key id starts with rzp_live_")), "Test key id refused in the live slot");
await btn("Cancel", row("RAZORPAY_KEY_ID:live")).click();
await setKey("GEMINI_API_KEY:any", "AIza-gemini-1111");

// go live
await btn("Go live").click();
ok(await btn("Go live now").isDisabled(), "Going live is blocked while live keys are missing");
await setKey("RAZORPAY_KEY_ID:live", "rzp_live_ABC123");
ok(await seen(row("RAZORPAY_KEY_ID:live").getByText("rzp_live_ABC123")), "Key id (not secret) shown in full");
await setKey("RAZORPAY_KEY_SECRET:live", "live-secret-5555");
await setKey("RAZORPAY_WEBHOOK_SECRET:live", "whsec-live-6666");
await page.getByLabel("Type LIVE to confirm").fill("LIVE");
ok(await btn("Go live now").isDisabled(), "Going live is blocked until the live secret passes a test");
await btn("Test", row("RAZORPAY_KEY_SECRET:live")).click();
ok(await seen(row("RAZORPAY_KEY_SECRET:live").getByText(/✓/)), "Live secret tested");
await page.getByLabel("Type LIVE to confirm").fill("LIVE");
await shot("02-go-live");
await btn("Go live now").click();
ok(await seen(page.getByText("Payments are live: members pay real money")), "Payments are live");
ok(await seen(row("RAZORPAY_KEY_SECRET:live").getByText("in use")) && !(await seen(row("RAZORPAY_KEY_SECRET:test").getByText("in use"), 1000)), "Live keys marked in use");
await row("RAZORPAY_KEY_SECRET:live").getByRole("button", { name: "Remove Razorpay key secret (live)" }).click();
await btn("Remove", row("RAZORPAY_KEY_SECRET:live")).click();
ok(await seen(row("RAZORPAY_KEY_SECRET:live").getByText("Switch payments to test before removing a live key.")), "Live keys can't be removed while live");
await shot("03-keys");
await btn("Switch to test").click();
await page.getByRole("region", { name: "Payments mode" }).getByRole("button", { name: "Switch to test" }).click();
ok(await seen(page.getByText("Payments are in test mode: no real money moves")), "Back to test");

// AI models: pictures
await page.getByRole("link", { name: "AI models" }).click();
const card = (m) => page.locator(`article[data-model="${m}"]`);
ok(await seen(card("gemini-nano-banana-2.1").getByText("In use")), "Imagine Us starts on Nano Banana 2.1");
ok(await page.locator("article[data-model]").count() >= 10, "At least ten picture models to choose from");
ok(await seen(card("gemini-nano-banana-2.1").getByText("₹6 a reading (2) of ₹49", { exact: false })) || await seen(card("gemini-nano-banana-2.1").getByText(/₹6/)), "Cost per reading shown against the price");
ok(await seen(card("fal-ai/flux-2-max/edit").getByText("FAL_KEY not set in Keys")), "Missing provider key flagged on the card");
await btn("Test", card("gpt-image-2")).click();
ok(await seen(card("gpt-image-2").getByRole("img", { name: /Test picture/ }), 8000) && await seen(card("gpt-image-2").getByText(/✓ Tested/)), "Test makes a labelled picture and marks the model tested");
await btn("Use for Imagine Us", card("gpt-image-2")).click();
ok(await seen(card("gpt-image-2").getByText("In use")), "Imagine Us switched to GPT Image 2");
await btn("Make fallback", card("gemini-nano-banana-2.1")).click();
ok(await seen(card("gemini-nano-banana-2.1").getByText("Fallback")), "Nano Banana 2.1 is the fallback");
await btn("Use for Imagine Us", card("gemini-3-pro-image")).click();
ok(await seen(card("gemini-3-pro-image").getByText(/Not tested yet. Members could get errors/)), "Untested model asks before switching");
await btn("Cancel", card("gemini-3-pro-image")).click();
ok(!(await card("bytedance/seedream/v5/pro/edit").getByRole("button", { name: "Use for Imagine Us" }).count()), "Switched-off models can't be picked");
await shot("04-pictures");

// text features
await page.getByRole("tab", { name: "Text features" }).click();
const saathi = page.getByLabel("Model for Saathi chat");
ok(!(await saathi.locator("option").allTextContents()).some((t) => /Nano Banana|GPT Image|FLUX/.test(t)), "Text features only offer text models");
await saathi.selectOption("gemini-3.8-flash");
await page.locator("tr", { has: saathi }).getByRole("button", { name: "Save" }).click();
ok(await seen(page.getByText("Saathi chat updated")), "Saathi moved to Gemini");

// model list
await page.getByRole("tab", { name: "All models" }).click();
await btn("Add a model").click();
await page.getByLabel(/Exact model id/).fill("fal-ai/qwen-image-edit");
await page.getByLabel("Name shown here").fill("Qwen Image Edit (fal.ai)");
await btn("Save model").click();
ok(await seen(page.getByText("Image models need a price per picture.")), "New picture model needs a price");
await page.getByLabel("US$ per picture").fill("0.03");
await btn("Save model").click();
ok(await seen(page.getByRole("cell", { name: /Qwen Image Edit/ })), "New model listed");
await page.getByRole("tab", { name: "Imagine Us pictures" }).click();
ok(await seen(card("fal-ai/qwen-image-edit")), "New model offered for Imagine Us");
await shot("05-models");

// phone width
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/keys`);
ok(await seen(page.getByRole("heading", { name: "Keys & live mode" })), "Keys works at phone width");
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok(overflow <= 0, `no sideways scroll at phone width (${overflow}px)`);
await shot("06-phone");

await page.getByRole("button", { name: "Sign out" }).click();
ok(await page.waitForURL("**/login").then(() => true, () => false), "Sign out");
ok(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
