// Admin batch B in demo mode (sample data): cities (rules, schedule, unlock), Be a Cupid (review, KYC, payouts, partner, rates, TDS),
// AI spend (caps with history, pause free AI, member limit, call log), fraud (decide cases), system health (incidents), team (invite, roles, audit).
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
const shot = (n) => page.screenshot({ path: `${OUT}Growth-${n}.png`, fullPage: true });
const btn = (name, scope = page) => scope.getByRole("button", { name, exact: true });
const nav = async (name) => { await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name, exact: true }).click(); await page.waitForLoadState("networkidle"); };
const toast = (t) => seen(page.getByRole("status").filter({ hasText: t }));

await page.goto(`${BASE}/login`);
await page.getByLabel("Work email").fill("mudit@likha.in"); await btn("Send code").click();
await page.getByLabel("Code", { exact: true }).fill("123456"); await btn("Continue").click();
await page.getByLabel("Code from the app").fill("123456"); await btn("Turn on and sign in").click();
await page.waitForURL("**/dashboard");

// cities
await nav("Cities and waitlist");
ok(await seen(page.getByText("Live cities")) && await seen(page.getByRole("row", { name: /Pune/ })), "Cities: KPIs and table");
await page.getByRole("row", { name: /Pune/ }).click();
ok(await seen(page.getByText(/612 of 1,000/)) && await seen(page.getByText(/ready in about \d+ days/)), "Cities: progress and pace for Pune");
ok(await btn("Schedule unlock").isDisabled(), "Cities: unready city can't be scheduled without a reason");
await page.getByLabel("Not ready yet. Why unlock early?").fill("College fest launch");
await btn("Schedule unlock").click();
ok(await toast("Pune scheduled") && await seen(page.getByText(/Unlock scheduled for/)), "Cities: early unlock scheduled with a reason");
await btn("Cancel scheduled unlock").click();
ok(await toast("Unlock cancelled"), "Cities: schedule cancelled");
await page.getByRole("row", { name: /Udaipur/ }).click();
await btn("Open the waitlist").click(); await page.getByLabel("Note").fill("Ambassadors ready"); await btn("Confirm").click();
ok(await seen(page.getByRole("row", { name: /Udaipur/ }).getByText("Waitlist")), "Cities: Udaipur waitlist opened");
await page.getByRole("spinbutton", { name: "Booth sign-up bonus" }).fill("30");
ok(await seen(page.getByText(/1 unpublished change: Booth sign-up bonus/)), "Settings: unpublished change shown");
ok(await btn("Publish changes").first().isDisabled(), "Settings: a note is needed to publish");
await page.getByLabel("Change note").first().fill("Weekend booth at WTP mall"); await btn("Publish changes").first().click();
ok(await toast("Published 1 change"), "Settings: published with a note");
await page.getByRole("button", { name: "History of Booth sign-up bonus" }).click();
ok(await seen(page.getByText(/v2 · .* · Weekend booth at WTP mall/)) && await seen(page.getByText(/v1 · .* Before first change/)), "Settings: version history keeps old value");
await shot("01-cities");

// cupid
await nav("Be a Cupid");
ok(await seen(page.getByText(/31 joined that day · 19 share one network · 2 face matches/)), "Cupid: review shows fraud signals");
await page.getByRole("row", { name: /Sumit/ }).getByRole("button", { name: "Reverse" }).click();
await page.getByLabel("Note").fill("19 sign-ups from one network"); await btn("Confirm").click();
ok(await toast("Reversed"), "Cupid: earning reversed with a note");
ok(await seen(page.getByText("PAN ABC••••34F · riya@okicici")), "Cupid: KYC shows masked PAN");
await page.getByRole("row", { name: /Riya Kapoor/ }).getByRole("button", { name: "Verified" }).click();
ok(await toast("Verified"), "Cupid: KYC verified");
await page.getByRole("row", { name: /MNIT Dating Club.*above auto-approve/ }).getByRole("button", { name: "Approve" }).click();
ok(await toast("Approved: sent in the next hourly run"), "Cupid: big payout approved by a person");
const [tds] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Export TDS report/ }).click()]);
ok(tds.suggestedFilename().startsWith("likha-cupid-tds-"), "Cupid: TDS report downloads");
await page.getByRole("tab", { name: "Cupids and partners" }).click();
await page.getByLabel("Member #ID").fill("#A1B2C3"); await page.getByLabel("₹ per verified sign-up").fill("30"); await page.getByLabel("₹ per first payment").fill("70");
await page.getByLabel("Agreement / reason").fill("Creator agreement signed 21 Oct"); await btn("Make partner").click();
ok(await toast("Partner added") && await seen(page.getByRole("row", { name: /Aarav/ }).getByText("Partner")), "Cupid: partner with own rates");
await page.getByRole("tab", { name: "Rates and limits" }).click();
await page.getByRole("spinbutton", { name: "Pay per verified sign-up" }).fill("25"); await page.getByLabel("Change note").first().fill("Diwali push");
await btn("Publish changes").first().click();
ok(await toast("Published 1 change"), "Cupid: rate change published");
await shot("02-cupid");

// ai spend
await nav("AI spend and limits");
ok(await seen(page.getByText(/of ₹4,000 cap/)) && await seen(page.getByText("Paid readings")), "AI spend: today vs cap and by feature");
await btn("Pause free AI").click(); await page.getByLabel("Note").fill("Bill spike test"); await btn("Confirm").click();
ok(await seen(page.getByText(/Free AI is paused/)), "AI spend: free AI paused, paid still on");
await btn("Resume free AI").click(); await page.getByLabel("Note").fill("Back to normal"); await btn("Confirm").click();
ok(await gone(page.getByText(/Free AI is paused/)), "AI spend: resumed");
await page.getByRole("row", { name: /Kunal/ }).getByRole("button", { name: "Set limit" }).click();
await page.getByLabel("Block free AI").check(); await page.getByLabel("Limit reason").fill("5,410 calls in a week, looks scripted"); await btn("Save").click();
ok(await seen(page.getByText(/Free AI blocked · 5,410 calls/)), "AI spend: member's free AI blocked with a reason");
await page.getByRole("spinbutton", { name: "Daily cap (all members)" }).fill("5000"); await page.getByLabel("Change note").first().fill("Launch week");
await btn("Publish changes").first().click();
ok(await toast("Published 1 change") && await seen(page.getByText(/of ₹5,000 cap/)), "AI spend: daily cap raised");
const [log] = await Promise.all([page.waitForEvent("download"), btn("Download call log (24 h)").click()]);
ok(log.suggestedFilename().endsWith(".csv"), "AI spend: call log downloads");
await shot("03-ai-spend");

// fraud
await nav("Fraud and abuse");
const face = page.getByRole("region", { name: "Same face, 3 accounts" });
ok(await btn("Keep oldest, ban the rest", face).isDisabled(), "Fraud: decisions need a reason");
await face.getByLabel("Decision reason").fill("Same face on 3 phones; oldest is the real person");
await btn("Keep oldest, ban the rest", face).click();
ok(await toast("Keep oldest, ban the rest: done"), "Fraud: linked accounts handled");
const bio = page.getByRole("region", { name: "Copied bio text" });
await bio.getByLabel("Decision reason").fill("Popular quote, not fraud"); await btn("Not fraud", bio).click();
ok(await toast("Not fraud: done") && await gone(page.getByRole("region", { name: "Copied bio text" })), "Fraud: dismissed case leaves the list");
await page.getByLabel(/Show decided cases/).check();
ok(await seen(page.getByText(/Decided by You: keep_oldest/)), "Fraud: decided cases keep the reason");
await shot("04-fraud");

// health
await nav("System health");
ok(await seen(page.getByText("Not connected yet (OneSignal)", { exact: false })) && await seen(page.getByText("statement timeout")), "Health: services, honest push status, failed job shown");
await page.getByLabel("What happened").fill("Kick batch late"); await page.getByLabel("Impact").fill("Kicks ready at 5:40 AM"); await btn("Log incident").click();
ok(await toast("Incident logged"), "Health: incident logged");
const inc = page.getByRole("region", { name: "Incidents" }).locator("div", { hasText: /^OpenKick batch late/ }).first();
await page.getByLabel("Update on Kick batch late").fill("Batch retried, all done"); await page.getByRole("region", { name: "Incidents" }).getByRole("button", { name: "Fixed" }).first().click();
ok(await toast("Marked fixed") && await seen(page.getByText(/Batch retried, all done/)), "Health: incident fixed with a note");
await shot("05-health");

// team
await nav("Team and audit");
ok(await seen(page.getByRole("row", { name: /Rohit \(agency\).*Setup pending/ })), "Team: pending two-step sign-in shown");
await page.getByLabel("Name", { exact: true }).fill("Kavya"); await page.getByLabel("Work email").fill("kavya@likha.in"); await btn("Send invite").click();
ok(await toast("Invited Kavya") && await seen(page.getByRole("row", { name: /Kavya/ })), "Team: invited");
await page.getByRole("row", { name: /Rohit/ }).getByRole("button", { name: "Change" }).click();
await page.getByLabel("Role change reason").fill("Agency contract ended"); await btn("Remove access").click();
ok(await toast("Rohit (agency) removed"), "Team: access removed with a reason");
await page.getByRole("tab", { name: "What each role can do" }).click();
ok(await page.getByLabel("Owner: Provider keys and live mode").isDisabled() && await page.getByLabel("Support: See payments").isDisabled(), "Roles: locked until a reason is given; owner fixed");
await page.getByLabel("Permission change reason").fill("Faster payment tickets");
await page.getByLabel("Support: See payments").click();
ok(await toast("Support: See payments on"), "Roles: permission granted with a reason");
ok(await page.getByLabel("Admin: Provider keys and live mode").isDisabled(), "Roles: keys stay with owners");
await page.getByRole("tab", { name: "Audit log" }).click();
ok(await seen(page.getByRole("row", { name: /Role permission.*Faster payment tickets/ })), "Audit: newest change listed with its reason");
await page.getByRole("button", { name: "AI agents" }).click();
ok(await gone(page.getByRole("row", { name: /Role permission/ })) && await seen(page.getByRole("row", { name: /AI · safety/ })), "Audit: filter by AI agents");
await shot("06-team");

await page.setViewportSize({ width: 390, height: 844 });
await nav("Be a Cupid");
ok(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, "Cupid: no sideways scroll at phone width");
ok(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
