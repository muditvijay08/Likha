// Batch 5 walk-through in demo mode: Our Universe (consent first), partner consent, Seven Questions, Imagine Us, Couple Mode, Our Story,
// 30-day check-in, Boost, Travel Mode, Invite, Be a Cupid + payouts, and the /k /g /i landing pages with sign-up claims.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = new URL("./shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("PASS |", msg); } else { fail++; console.log("FAIL |", msg); } };
const seen = (loc, t = 8000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const msg = (mine, body, at) => ({ id: `x${at}`, mine, kind: "text", body, media_url: null, held: false, read_at: null, created_at: new Date(at).toISOString() });
const matchedAt = Date.now() - 31 * 864e5;

const SEED = {
  phone: "+919829041235", signedIn: true, consents: ["terms_privacy", "birth_matching", "selfie"],
  profile: { first_name: "Aarav", gender: "man", onboarding_step: 11, selfie_status: "passed", created: Date.now() - 40 * 864e5, height_cm: 178, wasActive: true,
             profession: "Product manager", diet: "vegetarian", drinking: "socially", smoking: "never", goal: "matchmaking" },
  city: { id: "c-jaipur", slug: "jaipur", name: "Jaipur", status: "live" },
  birth: { date: "1997-08-14", time: "21:10", place: { name: "Jaipur", country: "IN", label: "Jaipur, Rajasthan, India", lat: 26.91, lng: 75.79 }, tz: "Asia/Kolkata", offsetMinutes: 330 },
  photos: [{ id: "p1", position: 1, url: "", status: "approved" }, { id: "p2", position: 2, url: "", status: "approved" }],
  prompts: [{ key: "about_you", answer: "Chai first, plans later." }, { key: "fond_of", answer: "Old Hindi songs." }], interests: [1],
  prefs: { age_min: 21, age_max: 35, distance: "same_city", diets: [] }, bonus: 600, kundliAt: 1, pushTokens: [],
  likes: ["s-sanya"], matches: [{ id: "m-s-sanya", other: "s-sanya", at: matchedAt }],
  chats: { "m-s-sanya": [msg(true, "Chai at Tapri this weekend?", matchedAt + 6e5), msg(false, "Only if you're buying the bun maska", matchedAt + 9e5)] },
  gifts: [{ id: "g1", name: "Riya", kind: "gift", note: "Happy birthday!", token: "gtok1", deliver_on: today, opened: false, expires_at: new Date(Date.now() + 9 * 864e5).toISOString() }],
  crush: [{ id: "k1", name: "Meera", relation: "crush", token: "ktok1", joined: false, expires_at: new Date(Date.now() + 9 * 864e5).toISOString(), reading_id: "r-crush-1", status: "pending_consent" }],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
ctx.on("page", (p) => { p.waitForURL(/wa\.me/, { timeout: 8000 }).then(() => p.close()).catch(() => {}); });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (/Content Security Policy|Refused to (load|connect|execute|frame)/i.test(m.text())) errors.push("CSP: " + m.text().slice(0, 160)); });
const shot = (n) => page.screenshot({ path: `${OUT}Couples-${n}.png`, fullPage: true });
const btn = (name, exact = true) => page.getByRole("button", { name, exact });
const balance = () => page.evaluate(() => { const d = JSON.parse(localStorage.getItem("likha-demo-db")); return d.bonus + (d.purchased ?? 0) - (d.spent ?? 0); });

await page.goto(`${BASE}/offline`);
await page.evaluate((s) => localStorage.setItem("likha-demo-db", JSON.stringify(s)), SEED);

// C1 Our Universe from the menu (pick a match), Our Stars waits for the partner's yes
await page.goto(`${BASE}/universe`);
await page.getByRole("link", { name: /Sanya/ }).click();
await page.waitForURL("**/universe/m-s-sanya");
ok(await seen(page.getByText("Sanya is asked first. You're only charged if they say yes.")), "Universe: consent-first note");
await shot("01-universe");
await page.getByRole("button", { name: /Ask Sanya · 49 credits/ }).first().click();
await page.waitForURL("**/readings/**");
ok(await seen(page.getByText("Waiting for Sanya to say yes")), "Our Stars: waits for Sanya's yes");
ok(await seen(page.getByText(/Aarav and Sanya: easy warmth/), 15000), "Our Stars: reading opens after the yes");
await page.goto(`${BASE}/universe/m-s-sanya`);
ok(await seen(page.getByRole("link", { name: "Read it" })), "Universe: Our Stars now shows Read it");

// C3 someone asks me: card on Home, consent page, yes
await page.goto(`${BASE}/home`);
const ask = page.getByRole("link", { name: /Sanya wants to read Our Stars with you/ });
ok(await seen(ask), "Home: consent request card");
await ask.click();
ok(await seen(page.getByText(/Sanya pays; you pay nothing/)), "Consent: who pays, what's read");
ok(!(await page.getByRole("checkbox").isChecked()), "Consent: 'don't ask again' starts unticked");
await shot("02-consent");
await btn("Yes, go ahead").click();
ok(await seen(page.getByText("Writing Our Stars now")), "Consent: yes recorded");
await page.goto(`${BASE}/readings`);
ok(await seen(page.getByText(/Our Stars/)), "Readings list includes the shared reading");

// Seven Questions
const before7 = await balance();
await page.goto(`${BASE}/seven/m-s-sanya`);
await btn("Start · 39 credits").click();
for (let i = 1; i <= 7; i++) {
  ok(await seen(page.getByText(`Question ${i} of 7`)), `Seven: question ${i} shown`);
  await page.getByRole("radio").first().click();
  await btn("Lock in answer").click();
}
ok(await before7 - await balance() === 39, "Seven: one payment of 39 credits");
ok(await seen(page.getByText(/Sanya: /)), "Seven: Sanya's answers revealed after answering");
ok(await seen(page.getByRole("link", { name: "Read it" }), 12000), "Seven: reading ready once both finished");
await shot("03-seven");
await page.getByRole("link", { name: "Read it" }).click();
ok(await seen(page.getByText("Two planners, one playful streak")) && await seen(page.getByRole("link", { name: "See both your answers" })), "Seven: reading + link back to answers");

// E2 Imagine Us
await page.goto(`${BASE}/imagine/m-s-sanya`);
ok(await seen(page.getByText(/Every picture is marked "Imagined, not a real photo"/)), "Imagine: labelled, consent-first");
await page.getByRole("radio", { name: /Our wedding/ }).click();
await page.getByRole("button", { name: /Ask Sanya · 49 credits/ }).click();
await page.waitForURL("**/readings/**");
ok(await seen(page.getByRole("img", { name: "Imagined picture 2" }), 15000), "Imagine: two pictures");
ok(await page.getByText("Imagined, not a real photo").count() === 2, "Imagine: every picture captioned as imagined");
await shot("04-imagine");

// C4 Couple Mode (both confirm)
await page.goto(`${BASE}/couple/m-s-sanya`);
await btn("Start Couple Mode with Sanya").click();
ok(await seen(page.getByText("Waiting for Sanya to confirm")), "Couple: waits for Sanya");
ok(await seen(page.getByText("Couple Mode is on"), 12000), "Couple: on once both confirm");
ok(await seen(page.getByRole("link", { name: /Get Plus for ₹149/ })), "Couple: Plus offer, one pays both get it");
await shot("05-couple");

// C5 Our Story
await page.goto(`${BASE}/story/m-s-sanya`);
for (const t of ["You matched", "First message", "Couple Mode on", "Read Our Stars together", "Played Seven Questions"])
  ok(await seen(page.getByText(t, { exact: true })), `Story: ${t}`);
await btn("Add a moment").click();
await page.fill("#m-title", "Sunset at Nahargarh");
await btn("Add to our story").click();
ok(await seen(page.getByText("Sunset at Nahargarh", { exact: true })), "Story: moment added");
ok(await seen(btn("Remind me on our anniversary")), "Story: anniversary reminder");
await shot("06-story");

// Q1 30-day check-in
await page.goto(`${BASE}/home`);
const due = page.getByRole("link", { name: /30 days with Sanya/ });
ok(await seen(due), "Home: 30-day check-in card");
await due.click();
await btn("Going really well").click();
ok(await seen(page.getByText(/Couple Mode takes you out of Discover together/)), "Check-in: answer recorded, next step offered");
await page.goto(`${BASE}/home`);
ok(!(await seen(page.getByRole("link", { name: /30 days with Sanya/ }), 2000)), "Home: check-in card gone after answering");

// E7 Boost
const beforeB = await balance();
await page.goto(`${BASE}/boost`);
await btn("Boost now · 29 credits").click();
ok(await seen(page.getByText("BOOST IS ON")) && await beforeB - await balance() === 29, "Boost: live, 29 credits");
await shot("07-boost");

// E8 Travel Mode
await page.goto(`${BASE}/travel`);
await page.fill("#t-city", "Udai");
await page.getByRole("option", { name: /Udaipur/ }).first().click();
ok(await seen(page.getByText("No one on Likha in Udaipur yet")) && await btn("Start trip · 29 credits").isDisabled(), "Travel: empty city can't be bought");
await page.fill("#t-city", "Pun");
await page.getByRole("option", { name: /Pune/ }).first().click();
ok(await seen(page.getByText(/people on Likha in Pune/)), "Travel: people count for Pune");
await btn("Start trip · 29 credits").click();
ok(await seen(page.getByText("TRAVEL MODE ON")), "Travel: trip on");
await btn("End trip now").click();
ok(await seen(page.getByLabel("Where to")), "Travel: trip ended");

// E13 Invite
await page.goto(`${BASE}/invite`);
ok(await seen(page.getByText("aarav-demo")) && await seen(page.getByRole("link", { name: "Share on WhatsApp" })), "Invite: code and WhatsApp share");

// K1/K2 Be a Cupid
await page.goto(`${BASE}/cupid`);
ok(await btn("Become a Cupid").isDisabled(), "Cupid: terms must be ticked first");
await page.getByRole("checkbox").check();
await btn("Become a Cupid").click();
ok(await seen(page.getByText("READY TO WITHDRAW")) && await seen(page.getByText(/likha\.in\/c\/aarav-/)), "Cupid: joined with own link");
await page.getByText("Add a link for a channel").click();
await page.fill("#c-code", "likha-team");
await btn("Create link").click();
ok(await seen(page.getByText("Pick a different link name.")), "Cupid: reserved link names refused");
await page.fill("#c-label", "Instagram");
await page.fill("#c-code", "aarav-insta");
await btn("Create link").click();
ok(await seen(page.getByText("https://likha.in/c/aarav-insta")), "Cupid: new link listed");
await shot("08-cupid");
await page.goto(`${BASE}/cupid/payout`);
await page.fill("#k-name", "Aarav Kumar"); await page.fill("#k-pan", "ABC12"); await page.fill("#k-upi", "aarav@okicici");
ok(await btn("Send for checking").isDisabled(), "Payout: short PAN can't be sent");
await page.fill("#k-pan", "ABCDE1234F");
ok(!(await page.getByLabel("I live in India").isChecked()), "Payout: residency box starts unticked");
await btn("Send for checking").click();
ok(await seen(page.getByText(/We're checking your details/)), "Payout: KYC sent for checking");
ok(await seen(page.getByText(/2% TDS is deducted once your total/)), "Payout: TDS explained");

// L2 gift landing → open → reading
await page.goto(`${BASE}/g/gtok1`);
ok(await seen(page.getByText("A GIFT FOR RIYA")) && await seen(page.getByText(/Happy birthday!/)), "Gift landing: who, note");
await btn("Open my gift").click();
await page.waitForURL("**/readings/**", { timeout: 10000 }).catch(() => {});
ok(await seen(page.getByText("Your year ahead in love"), 12000), "Gift: claimed after sign-in and opened");
await page.goto(`${BASE}/g/gtok1`);
ok(await seen(page.getByText("This gift has ended")), "Gift landing: can't be opened twice");

// L1 crush landing → agree → claim
await page.goto(`${BASE}/k/ktok1`);
ok(await seen(page.getByText(/Hi Meera, someone who knows you/)), "Check landing: greets by name, sender hidden");
ok(await btn("Join and see the reading").isDisabled(), "Check landing: agreement box starts unticked");
await page.getByRole("checkbox").check();
await btn("Join and see the reading").click();
ok(await seen(page.getByText("You and Meera"), 12000), "Check: claimed and reading opens");
await shot("09-landing");

// /i invite landing keeps the code for sign-up
await page.goto(`${BASE}/i/riya-ab12`);
ok(await seen(page.getByText("A friend invited you to Likha")) && await seen(page.getByText("riya-ab12")), "Invite landing: shows the code");
await btn("Join Likha").click();
ok(await page.waitForURL("**/start", { timeout: 8000 }).then(() => true, () => false), "Invite landing: goes to sign-up");
ok(await page.evaluate(() => JSON.parse(sessionStorage.getItem("likha-draft") ?? "{}").inviteCode) === "riya-ab12", "Invite landing: code saved for sign-up");

// chat chips go to this match's Universe
await page.goto(`${BASE}/chat/m-s-sanya`);
ok(await seen(page.locator('a[href="/universe/m-s-sanya"]')), "Chat: Our Universe chip opens this match");

ok(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
