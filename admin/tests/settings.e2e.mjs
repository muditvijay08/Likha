// Admin batch C in demo mode (sample data): pricing (draft, publish, restore), features (switches, matching locks, report priority, test message),
// notifications and AI stop, onboarding step credits, content, payments, general and legal (maintenance, new Terms), security, AI CEO and rules.
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
const shot = (n) => page.screenshot({ path: `${OUT}Settings-${n}.png`, fullPage: true });
const btn = (name, scope = page) => scope.getByRole("button", { name, exact: true });
const nav = async (name) => { await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name, exact: true }).click(); await page.waitForLoadState("networkidle"); };
const toast = (t) => seen(page.getByRole("status").filter({ hasText: t }));

await page.goto(`${BASE}/login`);
await page.getByLabel("Work email").fill("mudit@likha.in"); await btn("Send code").click();
await page.getByLabel("Code", { exact: true }).fill("123456"); await btn("Continue").click();
await page.getByLabel("Code from the app").fill("123456"); await btn("Turn on and sign in").click();
await page.waitForURL("**/dashboard");

// pricing
await nav("Pricing and credits");
ok(await seen(page.getByRole("region", { name: "Credit packs" }).getByText("Per credit")), "Pricing: packs table");
await page.getByLabel("Starter price").fill("79");
ok(await seen(page.getByText("Unpublished price changes")), "Pricing: draft shown before publishing");
ok(await btn("Publish prices").isDisabled(), "Pricing: publish needs a note");
await page.getByLabel("Price change note").fill("Diwali test price"); await btn("Publish prices").click();
ok(await toast("Prices published") && await seen(page.getByText(/v2 ·/)), "Pricing: published and versioned");
await page.getByLabel("Graha discount").fill("2"); await page.getByLabel("Price change note").fill("try lower"); await btn("Publish prices").click();
ok(await seen(page.getByRole("alert").filter({ hasText: "Higher tiers must not get a smaller discount" })), "Pricing: tier discounts must not go down");
await btn("Discard").click();
await page.getByRole("region", { name: "Price history" }).getByRole("button", { name: "Restore" }).first().click();
const restored = await toast("Restored v1"); await page.waitForTimeout(600);
ok(restored && (await page.getByLabel("Starter price").inputValue()) === "99", `Pricing: restore the earlier version (${await page.getByLabel("Starter price").inputValue()})`);
await shot("01-pricing");

// features
await nav("Features, matching, safety");
const imagine = page.getByRole("row", { name: /Imagine Us/ });
await imagine.getByLabel("Imagine Us on").uncheck(); await imagine.getByLabel("Imagine Us note").fill("Cost check"); await imagine.getByRole("button", { name: "Save" }).click();
ok(await toast("Imagine Us saved") && await seen(imagine.getByText("You ·")), "Features: Imagine Us switched off with a note");
ok(await page.getByRole("textbox", { name: /^Ayanamsa/ }).isDisabled() && await page.getByRole("checkbox", { name: /^Manglik as a filter/ }).isDisabled(), "Matching: chart rules and Manglik filter locked");
ok(await seen(page.getByRole("region", { name: "Safety rules" }).getByText("Not used by the app yet")) && (await page.getByRole("region", { name: "Matching" }).getByText("Not used by the app yet").count()) === 0, "Safety: scam score honestly not used yet; matching all live");
await page.getByLabel("Fake profile priority").selectOption("high");
await page.getByLabel("Priority note").fill("More fakes this week"); await page.getByRole("region", { name: "Report priority" }).getByRole("button", { name: "Publish" }).click();
ok(await toast("Report priorities published"), "Safety: report priority changed");
ok(await page.getByLabel("Under 18 priority").isDisabled(), "Safety: under-18 stays urgent");
await page.getByLabel("Message to test").fill("call me on 9876543210"); await btn("Test").click();
ok(await seen(page.getByText(/Held for review/)), "Safety: phone number early is held");
await page.getByLabel("Message to test").fill("Your chai photo is lovely"); await btn("Test").click();
ok(await seen(page.getByText(/Would be delivered/)), "Safety: ordinary message passes");
await shot("02-features");

// notifications and AI
await nav("Notifications, Saathi, AI");
ok(await seen(page.getByText(/Push notifications aren.t connected yet/)), "Comms: push honestly not connected");
await btn("Stop all AI now").click(); await page.getByLabel("Note").fill("Cost spike drill"); await btn("Confirm").click();
ok(await toast("All AI features stopped") && await seen(page.getByText("All AI features stopped").first()), "Comms: AI emergency stop");
await btn("Turn AI back on").click(); await page.getByLabel("Note").fill("Drill over"); await btn("Confirm").click();
ok(await toast("AI features back on"), "Comms: AI back on");
await shot("03-comms");

// onboarding
await nav("Onboarding");
await page.getByLabel("Welcome bonus woman").fill("160");
ok(await seen(page.getByRole("alert").filter({ hasText: "must add up" })), "Onboarding: steps must equal the bonus");
await page.getByLabel("Basics credits woman").fill("29");
await page.getByLabel("Step credits note").fill("Bigger first step"); await page.getByRole("region", { name: "Step credits" }).getByRole("button", { name: "Publish" }).click();
ok(await toast("Step credits published"), "Onboarding: step credits and bonus published together");
ok(await page.getByRole("spinbutton", { name: /^Minimum age/ }).isDisabled(), "Onboarding: minimum age locked at 18");
await shot("04-onboarding");

// content
await nav("Content");
await page.getByLabel("Text").fill("Marriage guaranteed this Diwali");
await page.getByLabel("banner note").fill("promo"); await page.getByRole("form", { name: "Save banner" }).getByRole("button", { name: "Save" }).click();
ok(await seen(page.getByRole("alert").filter({ hasText: "No promises" })), "Content: promise words refused");
await page.getByLabel("Text").fill("Diwali: 20% more credits on every pack");
await page.getByLabel("banner note").fill("Diwali offer"); await page.getByRole("form", { name: "Save banner" }).getByRole("button", { name: "Save" }).click();
ok(await toast("Banner is live") && await seen(page.getByRole("region", { name: "Banners" }).getByText("Diwali: 20% more credits")), "Content: banner live");
await page.getByRole("tab", { name: "Prompts and interests" }).click();
await page.getByLabel("New interest").fill("Garba nights"); await page.getByLabel("interest note").fill("festive"); await page.getByRole("form", { name: "Save interest" }).getByRole("button", { name: "Save" }).click();
ok(await toast("Interest added") && await seen(page.getByText("Garba nights")), "Content: interest added");
await btn("Remove Chai").click();
ok(await toast("Members have picked this interest"), "Content: picked interests can't be removed");
await page.getByRole("tab", { name: "App text" }).click();
ok(await seen(page.getByText("Not used by the app yet")), "Content: app text honestly not live");
await page.getByLabel("Missing Hindi").check();
ok(await seen(page.getByRole("row", { name: /discover.empty/ })) && await gone(page.getByRole("row", { name: /store.title/ })), "Content: filter missing Hindi");
await shot("05-content");

// payments
await nav("Payments and tax");
await page.getByRole("spinbutton", { name: /^Unused packs can be refunded within/ }).fill("10");
await page.getByLabel("Change note").fill("Longer window"); await btn("Publish changes").click();
ok(await seen(page.getByRole("alert").filter({ hasText: "Refund rules changed" })), "Payments: refund change flags the policy");
await shot("06-payments");

// general and legal
await nav("General and legal");
ok(await seen(page.getByRole("region", { name: "Legal documents" }).getByText(/Refunds policy may be out of date/i)), "Legal: policy review shown");
await page.getByRole("row", { name: /Terms and Privacy/ }).getByRole("button", { name: "New version" }).click();
const form = page.getByRole("form", { name: /New version of Terms/ });
await form.getByLabel("What members agree to").fill("I agree to the updated Terms of use and Privacy policy (unused packs refundable within 10 days).");
await form.getByLabel("What changed").fill("Refund window"); await form.getByRole("button", { name: "Publish" }).click();
ok(await toast("1.1 published") && await gone(page.getByText(/Refunds policy may be out of date/i)), "Legal: new Terms published, review cleared");
await page.getByRole("checkbox", { name: /^Maintenance mode/ }).check(); await page.getByLabel("Change note").first().fill("Database upgrade"); await btn("Publish changes").first().click();
ok(await seen(page.getByText("Maintenance is on.")), "General: maintenance on");
await page.getByRole("checkbox", { name: /^Maintenance mode/ }).uncheck(); await page.getByLabel("Change note").first().fill("Done"); await btn("Publish changes").first().click();
ok(await gone(page.getByText("Maintenance is on.")), "General: maintenance off");
await shot("07-general");

// security
await nav("Security and data");
ok(await seen(page.getByText("Birth details revealed")) && await seen(page.getByText(/Nobody, including Likha staff/)), "Security: who can see what");
await shot("08-security");

// AI CEO
await nav("AI CEO");
ok(await seen(page.getByText(/Agents aren.t running yet/)), "AI CEO: honest that agents aren't deployed");
const ap = page.getByLabel("Refund 350 credits");
await ap.getByRole("button", { name: "Approve" }).click();
ok(await toast("Approved"), "AI CEO: approval decided");
const undo = page.getByRole("region", { name: "What agents did" });
await undo.getByRole("button", { name: "Undo" }).first().click(); await page.getByLabel("Note").fill("Reading was fine"); await btn("Confirm").click();
ok(await toast("Undone") && await seen(undo.getByText("Undone")), "AI CEO: agent refund undone");
await btn("Pause all agents").click(); await page.getByLabel("Note").fill("Drill"); await btn("Confirm").click();
ok(await seen(page.getByText("All agents are paused.")), "AI CEO: agents paused");
await shot("09-ai-ceo");
await nav("AI CEO rules");
const sup = page.getByRole("region", { name: "Support", exact: true });
await sup.getByLabel("Never allowed (can only grow)").fill("Ban users");
await sup.getByLabel("Support note").fill("loosen"); await sup.getByRole("button", { name: "Save rules" }).click();
ok(await seen(sup.getByRole("alert").filter({ hasText: "can only grow" })), "Rules: never list can't shrink");
await sup.getByLabel("Never allowed (can only grow)").fill("Ban users\nPromise outcomes\nShare phone numbers");
await sup.getByRole("button", { name: "Save rules" }).click();
ok(await toast("Support rules saved"), "Rules: never list grew");
ok(await seen(page.getByRole("region", { name: "AI CEO", exact: true }).getByText("Read-only always")), "Rules: CEO always read-only");
await shot("10-rules");

await page.setViewportSize({ width: 390, height: 844 });
await nav("Pricing and credits").catch(() => {});
ok(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
