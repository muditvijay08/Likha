// Admin daily work in demo mode (sample data): dashboard, users and actions, moderation and appeals, selfie review,
// payments (re-check, two-person bank refund), readings, support with draft, grievances, data requests, Maasi picks.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = new URL("./shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("PASS |", msg); } else { fail++; console.log("FAIL |", msg); } };
const seen = (loc, t = 6000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = (n) => page.screenshot({ path: `${OUT}Ops-${n}.png`, fullPage: true });
const btn = (name, scope = page) => scope.getByRole("button", { name, exact: true });
const nav = async (name) => { await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name, exact: true }).click(); await page.waitForLoadState("networkidle"); };

// sign in
await page.goto(`${BASE}/login`);
await page.getByLabel("Work email").fill("mudit@likha.in"); await btn("Send code").click();
await page.getByLabel("Code", { exact: true }).fill("123456"); await btn("Continue").click();
await page.getByLabel("Code from the app").fill("123456"); await btn("Turn on and sign in").click();
await page.waitForURL("**/dashboard");

// dashboard
ok(await seen(page.getByRole("heading", { name: "Needs a person" })), "Dashboard: queues first");
ok(await seen(page.getByRole("link", { name: /Reports\s*3\s*1 urgent/ })), "Dashboard: reports with urgent count");
ok(await seen(page.getByRole("img", { name: "Daily sign-ups bar chart" })) && await seen(page.getByText("Selfie verified")), "Dashboard: sign-ups chart and funnel");
await shot("01-dashboard");

// users
await nav("Users");
await page.getByLabel("Search users").fill("+91 98290 41235"); await btn("Search").click();
ok(await seen(page.getByRole("link", { name: "Riya" })) && await page.locator("tbody tr").count() === 1, "Users: found by phone");
await btn("Clear").click();
await page.getByRole("button", { name: /^Under review/ }).click();
ok(await seen(page.getByRole("link", { name: "Kunal" })) && await seen(page.getByRole("link", { name: "Ritu" })), "Users: under review filter");
await page.getByRole("button", { name: /^All/ }).click();
await page.getByLabel("Link code").fill("https://likha.in/k/k7Qp2"); await btn("Look up").click();
ok(await seen(page.getByText("Check With Anyone")) && await seen(page.getByRole("definition").getByText("Meera")), "Users: crush link lookup from a pasted URL");
await page.getByRole("link", { name: "Aarav" }).first().click();
ok(await seen(page.getByRole("heading", { name: "Aarav, 27" })) && await seen(page.getByText("+91 98•• ••1234")), "User detail: masked phone");
await page.getByLabel("Add (+) or take (−)").fill("50"); await page.getByLabel("Reason", { exact: true }).fill("Charged twice on 17 Oct");
await btn("Change credits").click();
ok(await seen(page.getByText("Balance now 170")), "User: credits added with reason");
await page.getByLabel("Add (+) or take (−)").fill("900"); await page.getByLabel("Reason", { exact: true }).fill("too big");
await btn("Change credits").click();
ok(await seen(page.getByText("Adjust between 1 and 500 credits at a time.")), "User: big adjustments refused");
await page.getByLabel("Tier", { exact: true }).selectOption("surya"); await page.getByLabel("Tier reason").fill("Launch partner");
await btn("Set tier").click();
ok(await seen(page.getByText(/Surya · set by team until/)), "User: tier override");
await btn("Reveal (owner only, logged)").click(); await page.getByLabel("Note").fill("Birth time correction request DR-219"); await btn("Confirm").click();
ok(await seen(page.getByText("Jaipur (sample)")), "User: birth details revealed with a reason");
await shot("02-user");

// moderation
await nav("Moderation");
await page.getByRole("row", { name: /Scam/ }).click();
ok(await seen(page.getByText(/can you send 2000 on GPay/)) && await seen(page.getByText(/Your reading is logged/)), "Moderation: reported chat with logging notice");
await btn("Ban").click();
ok(await seen(page.getByText("Add a short note.")), "Moderation: decision needs a note");
await page.getByLabel("Decision note").fill("Asked a match for money, third report");
await btn("Suspend").click();
ok(await seen(page.getByText("Closed: suspend")) && !(await seen(page.getByRole("row", { name: /Scam/ }), 1500)), "Moderation: suspended and closed");
await shot("03-moderation");
await page.getByRole("tab", { name: /Appeals/ }).click();
ok(await seen(page.getByText(/Those are my sisters' accounts/)), "Appeals: listed with the member's words");
await btn("Overturn and restore").click(); await page.getByLabel("Note").fill("Checked: three sisters, separate phones"); await btn("Confirm").click();
ok(await seen(page.getByText("No open appeals.")), "Appeals: overturned");

// selfies
await nav("Selfie review");
ok(await seen(page.getByText(/open under-18 report/)), "Selfies: under-18 report warning shown");
await page.keyboard.press("s");
ok(await seen(page.getByText("New selfie requested")), "Selfies: S asks for a new selfie");
await seen(page.getByRole("heading", { name: /Ritu/ }));
await page.keyboard.press("a");
ok(await seen(page.getByText(/Ritu approved/)), "Selfies: A approves");
ok(await seen(page.getByText("Nothing to review.")), "Selfies: queue empty");

// payments
await nav("Payments and refunds");
await page.getByRole("button", { name: "Unconfirmed", exact: true }).click();
await page.getByRole("row", { name: /Ishita/ }).getByRole("button", { name: "Re-check" }).click();
ok(await seen(page.getByText(/Captured by Razorpay .* Credited now/)), "Payments: re-check credits a missed payment");
await page.getByRole("button", { name: "All", exact: true }).click();
ok(await seen(page.getByText("asked by Seema")), "Payments: refund waiting for a second person");
await btn("Approve").click();
await btn("Send to Razorpay").click();
ok(await seen(page.getByText(/Sent to Razorpay/)), "Payments: approved bank refund sent");
await page.getByRole("row", { name: /Aarav/ }).getByRole("button", { name: "Refund…" }).click();
await page.getByLabel("Reason").fill("Bought the wrong pack"); await btn("Ask for approval").click();
ok(await seen(page.getByText("You asked; someone else approves")), "Payments: you can't approve your own refund");
await shot("04-payments");

// readings
await nav("Readings");
await page.getByRole("row", { name: /Our stars/ }).click();
ok(await seen(page.getByText("Aarav and Riya: easy warmth")), "Readings: support can read a complaint's reading");
await btn("Rewrite").click(); await page.getByLabel("Note").fill("Repeated a section"); await btn("Confirm").click();
ok(await seen(page.getByText(/Sent back to the writer/)), "Readings: rewrite queued");
await page.getByRole("row", { name: /Who suits me/ }).click();
await btn("Refund 49 credits").click(); await page.getByLabel("Note").fill("Stuck for 40 minutes"); await btn("Confirm").click();
ok(await seen(page.getByText("Refunded", { exact: true })), "Readings: refunded");

// support
await nav("Support inbox");
await page.getByRole("row", { name: /Paid ₹249/ }).click();
ok(await seen(page.getByText(/Draft from the support agent · not sent/)), "Support: agent draft waits for a person");
ok(await page.getByLabel("Reply").inputValue() !== "", "Support: draft loaded into the reply box");
await btn("Send draft and solve").click();
ok(await seen(page.getByText("Sent and solved")), "Support: draft sent by a person");

// grievances
await nav("Grievances");
ok(await seen(page.getByText("Overdue", { exact: true })), "Grievances: overdue acknowledgement flagged");
await page.getByRole("row", { name: /GR-1042/ }).click();
await btn("Acknowledge").click();
ok(await seen(page.getByText("Acknowledged", { exact: true })), "Grievances: acknowledged");
await page.getByLabel("Resolution").fill("ok");
await btn("Resolve").click();
ok(await seen(page.getByText(/at least a sentence/)), "Grievances: outcome must be a real answer");
await page.getByLabel("Resolution").fill("We removed the profile that used your photos and blocked its device.");
await btn("Resolve").click();
ok(await seen(page.getByText(/Outcome sent: We removed the profile/)), "Grievances: resolved and outcome recorded");
const [csv] = await Promise.all([page.waitForEvent("download"), btn("Monthly compliance report").click()]);
ok(csv.suggestedFilename().startsWith("likha-grievance-report"), "Grievances: monthly report downloads");
await shot("05-grievances");

// data requests
await nav("Data requests");
const [exp] = await Promise.all([page.waitForEvent("download"), btn("Make export file").click()]);
ok(exp.suggestedFilename().endsWith(".json"), "Data: export file made");
await btn("Erase…").click();
ok(await seen(page.getByText(/Kept: payment and GST records/)), "Data: erase shows what is kept");
await btn("Erase now").click();
ok(await seen(page.getByText("Erased. Proof saved.")), "Data: erased with proof");
await btn("Mark done").click(); await page.getByLabel("Note").fill("Marketing messages switched off"); await btn("Confirm").click();
ok(await seen(page.getByText(/^Done /).nth(2)), "Data: all three requests done");

// maasi
await nav("Rishta Maasi picks");
await btn("Choose picks").click();
const first = page.getByLabel(/Maasi's note about/).first();
await first.fill("Pakka shaadi, 100% match beta");
await page.getByRole("button", { name: "Pick" }).first().click();
ok(await seen(page.getByText("No promises in the note.")), "Maasi: promises refused");
await first.fill("Two planners who love chai. Your Moons are friends.");
await page.getByRole("button", { name: "Pick" }).first().click();
ok(await seen(page.getByText(/1 of 3 for/)), "Maasi: pick added for Sunday");
await shot("06-maasi");

await page.setViewportSize({ width: 390, height: 844 });
await nav("Payments and refunds");
ok(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, "Payments: no sideways scroll at phone width");
ok(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
