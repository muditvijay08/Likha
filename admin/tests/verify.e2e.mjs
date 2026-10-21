// Verification in demo mode (sample data): auto-approve warnings, API address and key rules, test call, switching modes, photo review and spot checks.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = new URL("./shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("PASS |", msg); } else { fail++; console.log("FAIL |", msg); } };
const gone = (loc, t = 6000) => loc.first().waitFor({ state: "hidden", timeout: t }).then(() => true, () => false);
const seen = (loc, t = 6000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = (n) => page.screenshot({ path: `${OUT}Verify-${n}.png`, fullPage: true });
const btn = (name, scope = page) => scope.getByRole("button", { name, exact: true });
const nav = async (name) => { await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name, exact: true }).click(); await page.waitForLoadState("networkidle"); };
const toast = (t) => seen(page.getByRole("status").filter({ hasText: t }));

await page.goto(`${BASE}/login`);
await page.getByLabel("Work email").fill("mudit@likha.in"); await btn("Send code").click();
await page.getByLabel("Code", { exact: true }).fill("123456"); await btn("Continue").click();
await page.getByLabel("Code from the app").fill("123456"); await btn("Turn on and sign in").click();
await page.waitForURL("**/dashboard");
const row = (k) => page.locator(`tr[data-key="${k}"]`);
const setKey = async (k, v) => { await btn(/^(Set|Replace)$/, row(k)).click(); await row(k).locator("input").fill(v); await btn("Save", row(k)).click(); };

await nav("Verification");
const selfie = page.getByRole("region", { name: "Selfie check", exact: true }), photos = page.getByRole("region", { name: "Photo check", exact: true });
ok(await seen(page.getByText("Let in without a check")) && await seen(selfie.getByText(/members got in without a check\. They don't get the Verified badge/)), "Auto-approve is clearly flagged with the member count");
ok(await seen(photos.getByText(/photos go live without a check/)), "Photo auto-approve flagged");

// API rules
await photos.getByRole("radio", { name: /Call an API/ }).check();
await photos.getByLabel("Photo check note").fill("service ready");
await photos.getByRole("button", { name: "Save" }).click();
ok(await seen(photos.getByRole("alert").filter({ hasText: "Add the API address first" })), "API mode needs an address");
await photos.getByLabel("Address (https)").fill("http://verify.example.com/photo");
await photos.getByRole("button", { name: "Save" }).click();
ok(await seen(photos.getByRole("alert").filter({ hasText: "https://" })), "Address must be https");
await photos.getByLabel("Address (https)").fill("https://verify.example.com/photo");
await photos.getByRole("button", { name: "Save" }).click();
ok(await seen(photos.getByRole("alert").filter({ hasText: "Set the photo key" })), "API mode needs the key first");
ok(await seen(photos.getByText("What Likha sends and expects back")), "Request and reply format shown");
await shot("01-verification");

await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Keys and integrations", exact: true }).click();
await page.waitForURL("**/keys");
ok(await seen(page.getByText(/Only needed when a check is set to "Call an API"/)), "Keys: verification group explained");
await setKey("PHOTO_API_KEY:any", "vk-photo-secret-4242");
ok(await seen(row("PHOTO_API_KEY:any").getByText("••••4242")), "Photo key saved, last 4 only");

await nav("Verification");
await photos.getByRole("radio", { name: /Call an API/ }).check();
await photos.getByLabel("Address (https)").fill("https://verify.example.com/photo");
await photos.getByLabel("Photo check note").fill("service ready");
await photos.getByRole("button", { name: "Save" }).click();
ok(await toast("Photo check saved") && await seen(photos.getByText("Call an API").first()), "Photos now call the API");
ok(await seen(photos.getByText("Key set")), "Key shown as set");
await photos.getByRole("button", { name: "Send a test call" }).click();
ok(await seen(photos.getByRole("status").filter({ hasText: "no calls leave this browser" })), "Test call explains the demo honestly");
await selfie.getByRole("radio", { name: /Team reviews/ }).check();
await selfie.getByLabel("Selfie check note").fill("team checks until AWS");
await selfie.getByRole("button", { name: "Save" }).click();
ok(await toast("Selfie check saved") && await gone(selfie.getByText(/got in without a check/)), "Selfies go to the team; auto warning gone");
await shot("02-modes");

// photo review
await nav("Selfie and photo review");
await page.getByRole("tab", { name: "Photos" }).click();
const waiting = page.getByRole("region", { name: "Photos waiting" });
ok(await seen(waiting.getByLabel(/Photo 3 of #A4R4V1 Aarav/)), "New upload waits for the team");
await waiting.getByRole("button", { name: "Approve" }).click();
ok(await toast("Photo approved") && await seen(waiting.getByText("Nothing waiting.")), "Photo approved");
const autoList = page.getByRole("region", { name: "Auto-approved photos" });
await autoList.getByRole("button", { name: "Take down" }).first().click();
await page.getByLabel("Note").fill("Group photo: we need just you.");
await btn("Confirm").click();
ok(await toast("the member was told"), "Spot check: photo taken down with a reason");
await autoList.getByRole("button", { name: "Looks fine" }).first().click();
ok(await toast("Marked as checked"), "Spot check: marked fine");
await shot("03-photos");

ok(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
