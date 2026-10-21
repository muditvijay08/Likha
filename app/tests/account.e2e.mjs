// Batch 4 walk-through in demo mode: Me, edit profile, settings, privacy, trusted contacts, Share my date + check-in, SOS + live
// location page, unmatch/block/report, inbox, plans and history, help (ticket, grievance), toolkit, account status, delete with OTP.
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
  birth: { date: "1997-08-14", time: "21:10", place: { name: "Jaipur", country: "IN", label: "Jaipur, Rajasthan, India", lat: 26.91, lng: 75.79 }, tz: "Asia/Kolkata", offsetMinutes: 330 },
  photos: [{ id: "p1", position: 1, url: "", status: "approved" }, { id: "p2", position: 2, url: "", status: "approved" }],
  prompts: [{ key: "about_you", answer: "Chai first, plans later." }, { key: "fond_of", answer: "Old Hindi songs." }], interests: [1],
  prefs: { age_min: 21, age_max: 35, distance: "same_city", diets: [] }, bonus: 70, kundliAt: 1, pushTokens: [],
  likes: ["s-sanya"], matches: [{ id: "m-s-sanya", other: "s-sanya", at: Date.now() - 36e5 }],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["geolocation"], geolocation: { latitude: 26.9124, longitude: 75.7873 } });
const page = await ctx.newPage();
ctx.on("page", (p) => { p.waitForURL(/wa\.me/, { timeout: 8000 }).then(() => p.close()).catch(() => {}); });   // WhatsApp popups
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (/Content Security Policy|Refused to (load|connect|execute|frame)/i.test(m.text())) errors.push("CSP: " + m.text().slice(0, 160)); });
const shot = (n) => page.screenshot({ path: `${OUT}Account-${n}.png`, fullPage: true });
const btn = (name, exact = true) => page.getByRole("button", { name, exact });

await page.goto(`${BASE}/offline`);
await page.evaluate((s) => localStorage.setItem("likha-demo-db", JSON.stringify(s)), SEED);

// P1 Me + preview
await page.goto(`${BASE}/me`);
ok(await seen(page.getByRole("heading", { name: /Aarav/ })) && await seen(page.getByText("Verified")), "Me: name and verified badge");
ok(await seen(page.getByText("Kick streak")) && await seen(page.getByRole("link", { name: /Preview my profile/ })), "Me: stats and menu");
await shot("01-me");
await page.getByRole("link", { name: /Preview my profile/ }).click();
ok(await seen(page.getByText("Preview: how others see you")) && await seen(page.getByText("Chai first, plans later.")), "Preview shows my profile as others see it");

// P2 edit
await page.goto(`${BASE}/me/edit`);
ok(await seen(page.getByText(/Birth details: 14 Aug 1997/)) && await seen(page.getByText(/Locked to keep matches honest/)), "Edit: birth details shown and locked");
await page.getByRole("button", { name: /^Lifestyle/ }).click();
await btn("Jain").click();
await btn("Save").click();
ok(await seen(page.getByRole("button", { name: /^Lifestyle\s*Jain/ })), "Edit: lifestyle saved");
await page.getByRole("button", { name: /^About/ }).and(page.locator(":enabled")).waitFor();
await page.getByRole("button", { name: /^About/ }).click();
await page.fill("#e-name", "Aarav K");
await shot("02-edit");
await btn("Save").click();
ok(await seen(page.getByText(/A person will quickly re-check your profile/)), "Edit: name change sends the profile for a re-check");
await page.goto(`${BASE}/me`);
ok(await seen(page.getByRole("link", { name: "Selfie being checked" })), "Me: verified badge waits for the check");
await page.goto(`${BASE}/account-status`);
ok(await seen(page.getByText("A person is checking your selfie")), "Account status (L6): review in progress");

// P3 settings
await page.goto(`${BASE}/settings`);
ok(await seen(page.getByText(/Grievance Officer: \[NAME\]/)), "Settings: Grievance Officer from settings");
await page.getByLabel(/Offers/).check();
ok(await seen(page.getByText("Saved")), "Settings: notification toggle saved");
await page.getByLabel(/Pause my profile/).check();
ok(await seen(page.getByText("Profile paused. Chats stay.")), "Settings: pause");
await page.getByLabel(/Pause my profile/).uncheck();
await shot("03-settings");

// P4 privacy + trusted contacts
await page.goto(`${BASE}/privacy`);
await page.getByLabel(/Incognito/).check();
ok(await seen(page.getByText("Saved")), "Privacy: incognito saved");
await shot("04-privacy");
await page.goto(`${BASE}/trusted`);
await page.fill("#t-name", "Priya"); await page.fill("#t-rel", "sister"); await page.fill("#t-phone", "+91 94140 55302");
await btn("Add contact").click();
ok(await seen(page.getByText("Priya (sister)")), "Trusted contact added");

// F2 share my date -> L8 check-in
await page.goto(`${BASE}/share-date?match=m-s-sanya`);
await page.fill("#sd-place", "Neel Rooftop Cafe, C-Scheme");
ok(await seen(page.getByText(/Priya get.* an SMS alert/)), "Share my date: explains the alert");
await shot("05-share-date");
await btn("Share with Priya").click();
await page.waitForURL("**/checkin/**");
ok(await seen(page.getByText(/all good\?/)) && await seen(page.getByText(/Your date with Sanya at Neel Rooftop Cafe/)), "Check-in screen for the date");
await shot("06-checkin");
await btn("Still out, check again in 1 hour").click();
await btn("I'm okay").click();
ok(await seen(page.getByText("Glad you're okay")), "Check-in: I'm okay");

// F3 SOS + live location page
await page.goto(`${BASE}/sos?match=m-s-sanya`);
ok((await page.getByRole("link", { name: /Call 112/ }).getAttribute("href")) === "tel:112", "SOS: Call 112 first");
await btn(/Share my live location/, false).click();
ok(await seen(page.getByText("Sharing your live location for 2 hours")), "SOS: live location sharing on");
await btn(/Flag Sanya for urgent review/, false).click();
ok(await seen(page.getByText(/Sanya is flagged/)), "SOS: date flagged for urgent review");
await shot("07-sos");
const token = await page.evaluate(() => JSON.parse(localStorage.getItem("likha-demo-db")).sos[0].token);
const viewer = await ctx.newPage();
await viewer.goto(`${BASE}/s/${token}`);
ok(await seen(viewer.getByText(/needs help/)) && await seen(viewer.getByRole("link", { name: "Open in Google Maps" })), "Live location page opens without login");
await viewer.screenshot({ path: `${OUT}Account-08-live.png` });
await btn("Stop sharing").click();
await viewer.reload();
ok(await seen(viewer.getByText("Location sharing has ended")), "Stopping sharing ends the link");
await viewer.close();

// L7 + F1 block and report
await page.goto(`${BASE}/safety/report?user=s-sanya&match=m-s-sanya`);
ok(await seen(page.getByRole("heading", { name: "Unmatch or block Sanya?" })), "L7: unmatch or block sheet");
await shot("09-block");
await btn(/Block and report/, false).click();
await page.getByRole("radio", { name: "Harassment" }).click();
await page.fill("#r-details", "Kept messaging after I said no.");
await btn("Send report").click();
ok(await seen(page.getByText("Thank you for telling us")), "Report sent, person blocked");
await page.goto(`${BASE}/matches`);
ok(!(await page.getByRole("link", { name: "Sanya" }).isVisible().catch(() => false)), "Blocked match is gone from Chats");
await page.goto(`${BASE}/privacy`);
await btn(/Blocked people/, false).click();
await btn("Unblock").click();
ok(await seen(page.getByText("Unblocked")), "Unblock from Privacy");

// L3 inbox, L4 plans
await page.goto(`${BASE}/inbox`);
ok(await seen(page.getByText("Activity")) && await seen(page.getByText(/Someone with \d+% liked you/)), "Inbox: likes without names");
await btn("Mark all read").click();
await shot("10-inbox");
await page.goto(`${BASE}/plans`);
ok(await seen(page.getByText("No active plans")) && await seen(page.getByText("Welcome bonus")), "Plans and credit history");
await shot("11-plans");

// L5 help
await page.goto(`${BASE}/help`);
await btn("Payments and credits").click();
await page.getByText(/My payment is stuck/).click();
ok(await seen(page.getByText(/Don't pay again/)), "Help: quick answer");
await btn("Talk to a person").click();
await page.fill("#h-msg", "My payment shows pending for an hour");
await btn("Send to our team").click();
ok(await seen(page.getByText("Your conversations with us")), "Help: ticket opened");
await page.fill("#g-detail", "A profile is using my photos.");
await btn("Submit grievance").click();
ok(await seen(page.getByText(/Grievance GR-\d+ received/)), "Help: grievance gets a ticket number");
await shot("12-help");

// N2 toolkit reward, N3 why
await page.goto(`${BASE}/my-kundli`);
ok(await seen(page.getByText("+5 credits for trying My Kundli")), "Toolkit: first try of My Kundli gives 5 credits");
await page.goto(`${BASE}/toolkit`);
ok(await seen(page.getByRole("link", { name: /My Kundli.*Tried/ })), "Toolkit shows it as tried");
await shot("13-toolkit");
await page.goto(`${BASE}/why`);
ok(await seen(page.getByText("Kundli first. Not after the families meet.")), "Why Likha");

// P5 delete with OTP
await page.goto(`${BASE}/delete`);
await page.getByRole("radio", { name: "Taking a break" }).click();
ok(await seen(page.getByText(/Pause instead\?/)), "Delete: suggests pausing");
await shot("14-delete");
await btn("Delete account with OTP").click();
await page.fill("#del-otp", "111111");
await btn("Delete my account").click();
ok(await seen(page.getByText(/That code didn't work/)), "Delete: wrong code refused");
await page.fill("#del-otp", "123456");
await btn("Delete my account").click();
await page.waitForURL("**/start**", { timeout: 8000 });
ok(await page.evaluate(() => localStorage.getItem("likha-demo-db") === null), "Delete: account gone, signed out");

ok(errors.length === 0, `no page errors ${errors.join(" | ")}`);
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
