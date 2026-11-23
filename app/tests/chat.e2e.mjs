// Batch 2 walk-through in demo mode: Chats list, chat (text, voice, safety hold, Cupid openers), Guru Ji, Golden Hours, Saathi.
// Aarav has matched with Sanya (a labelled sample profile) and has 100 credits.
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
  bonus: 100, kundliAt: 1, pushTokens: [], likes: ["s-sanya"], matches: [{ id: "m-s-sanya", other: "s-sanya", at: Date.now() - 36e5 }],
};

const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["microphone"] });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (/Content Security Policy|Refused to (load|connect|execute|frame)/i.test(m.text())) errors.push("CSP: " + m.text().slice(0, 160)); });
const shot = (n) => page.screenshot({ path: `${OUT}Chat-${n}.png`, fullPage: false });
const btn = (name) => page.getByRole("button", { name, exact: true });

await page.goto(`${BASE}/offline`);
await page.evaluate((s) => localStorage.setItem("likha-demo-db", JSON.stringify(s)), SEED);

// M2
await page.goto(`${BASE}/matches`);
ok(await seen(page.getByText("New matches")) && await seen(page.getByRole("link", { name: "Sanya" })), "Chats: Sanya under new matches");
ok(await seen(page.getByText("Someone to talk to till you match")), "Chats: Saathi row");
await shot("01-matches");

// M3
await page.getByRole("link", { name: "Sanya" }).click();
await page.waitForURL("**/chat/m-s-sanya");
ok(await seen(page.getByText("Say hi to Sanya")), "Chat: empty state nudges a first message");
ok(await seen(page.getByText(/Golden Hour now|Next Golden Hour/)), "Chat: Golden Hour banner");
await page.fill("#msg", "Train or plane? This is a compatibility question");
await btn("Send").click();
ok(await seen(page.getByText("Train or plane? This is a compatibility question")), "Chat: message sent");
ok(await seen(page.getByText("(sample reply in demo mode)"), 5000), "Chat: live reply arrives without reloading");
await page.fill("#msg", "call me 9829012345");
await btn("Send").click();
ok(await seen(page.getByText(/Not delivered: no numbers or links/)), "Chat: phone number in early messages is held, sender told why");
await btn("Record voice note").click();
await page.waitForTimeout(1500);
await btn("Stop and send voice note").click();
ok(await seen(page.getByRole("img", { name: "Voice note" }).or(page.locator("audio")), 6000), "Chat: voice note recorded and sent");
await shot("02-chat");
await page.getByRole("button", { name: /Cupid suggestions/ }).click();
await btn("Get 3 openers · 15 credits").click();
const opener = page.getByRole("button", { name: /window seat on a train/ });
ok(await seen(opener), "Cupid openers written (15 credits)");
await shot("03-openers");
await opener.click();
ok((await page.inputValue("#msg")).includes("window seat"), "Tapping an opener puts it in the message box");

// E1 Guru Ji
await page.getByRole("link", { name: "Ask Guru Ji" }).click();
await page.waitForURL("**/guru/m-s-sanya");
ok(await seen(page.getByText("About you and Sanya · 3 of 3 questions left")), "Guru Ji: 3 free questions for the couple");
await btn("How do we argue better?").click();
ok(await seen(page.getByText(/Sample answer in demo mode/)), "Guru Ji answers");
ok(await seen(page.getByText("About you and Sanya · 2 of 3 questions left")), "Guru Ji: question counted");
ok(await seen(page.getByText("Guidance, not a verdict. Sanya sees this chat too.")), "Guru Ji: shared-chat notice");
await shot("04-guru");

// M5 Golden Hours
await page.goto(`${BASE}/golden/m-s-sanya`);
ok(await seen(page.getByText("You and Sanya · best times in Jaipur")), "Golden Hours page for the match");
ok(await seen(btn("Unlock all · 19 credits")), "Golden Hours: calendar locked");
await shot("05-golden-locked");
await btn("Unlock all · 19 credits").click();
ok(await seen(page.getByText("Best (Jupiter hora)")) && !(await btn("Unlock all · 19 credits").isVisible().catch(() => false)), "Golden Hours: 14-day calendar unlocked");
await shot("06-golden");

// Saathi
await page.goto(`${BASE}/saathi`);
ok(await seen(page.getByText("Meet your Saathi")), "Saathi: setup first (E11)");
await page.getByRole("radio", { name: /Dhruv/ }).click();
await page.getByRole("radio", { name: "English" }).click();
ok((await page.getByText(/flirty/i).count()) === 0, "Setup has no flirty option: romance starts off");
await shot("07-saathi-setup");
await btn("Say hi to Dhruv").click();
ok(await seen(page.getByText("Hi! I'm Dhruv, a virtual companion, not a real person.")), "Saathi says it's virtual from the first line");
await page.fill("#ai-msg", "Honestly just tired of swiping");
await btn("Send").click();
ok(await seen(page.getByText(/Sample reply in demo mode/)), "Saathi replies");
ok(await seen(page.getByText(/30 free messages a day · 29 left/)), "Saathi counts today's free messages");

// Modes
const modes = page.getByRole("radiogroup", { name: "Mode" });
ok(await modes.getByRole("radio", { name: /Companion/ }).getAttribute("aria-checked") === "true", "Mode: Companion by default, shown as active");
await modes.getByRole("radio", { name: /Ask anything/ }).click();
await page.waitForTimeout(300);
ok(await modes.getByRole("radio", { name: /Ask anything/ }).getAttribute("aria-checked") === "true", "Mode: switch to Ask anything");
await page.fill("#ai-msg", "What should I text after a first date?");
await btn("Send").click();
ok(await seen(page.getByText(/Here's what I'd do/)), "Ask anything answers in advisor mode");

// Settings: personality, romance consent, memory consent
await page.getByRole("link", { name: "Saathi settings" }).click();
await page.waitForURL("**/saathi/settings");
ok(await seen(page.getByRole("radio", { name: /^Off/ })) && await page.getByRole("radio", { name: /^Off/ }).getAttribute("aria-checked") === "true", "Romance: Off by default");
await page.getByRole("radio", { name: /^Romantic/ }).click();
const ack = page.getByLabel(/I'm 18 or older\. I understand Dhruv is a virtual companion/);
ok(await seen(ack) && !(await ack.isChecked()), "Romantic needs a confirmation box, unticked");
await page.getByRole("button", { name: "Save", exact: true }).click();
ok(await seen(page.getByText("Tick the box to confirm you understand, or pick Off or Warm.")), "Can't save romantic without ticking");
await ack.check();
ok(await seen(page.getByText(/Good morning, jaan!/)), "Preview line follows the settings");
await page.getByLabel("Caring to Direct").fill("90");
await page.getByRole("switch", { name: "Memory" }).check();
const mack = page.getByLabel(/Keep the things I approve/);
ok(await seen(mack) && !(await mack.isChecked()), "Memory needs its own box, unticked");
await mack.check();
await shot("07c-saathi-settings");
await page.getByRole("button", { name: "Save", exact: true }).click();
await page.waitForURL("**/saathi");
await page.fill("#ai-msg", "I have a date on Saturday and I'm nervous");
await btn("Send").click();
ok(await seen(page.getByText(/Aww, jaan\./)), "Romantic tone after opting in (sample reply)");
const sug = page.getByRole("note", { name: "Memory suggestion" });
ok(await seen(sug.getByText(/Has a date coming up/)), "Dhruv suggests a memory; nothing is kept yet");
await sug.getByRole("button", { name: "Save" }).click();
await page.getByRole("link", { name: "Memory Centre" }).click();
await page.waitForURL("**/saathi/memory");
ok(await seen(page.getByText("Has a date coming up")) && await seen(page.getByText("You approved this")), "Memory Centre shows the approved memory");
await page.fill("#mem-add", "Loves old Hindi songs");
await page.getByRole("button", { name: "Add", exact: true }).click();
ok(await seen(page.getByText("Loves old Hindi songs")), "Add a memory yourself");
await page.getByRole("button", { name: "Edit: Loves old Hindi songs" }).click();
await page.fill("input[id^='mem-']:not(#mem-add)", "Loves old Kishore Kumar songs");
await page.getByRole("button", { name: "Save", exact: true }).click();
ok(await seen(page.getByText("Loves old Kishore Kumar songs")), "Edit a memory");
await page.getByRole("button", { name: "Delete: Has a date coming up" }).click();
ok(await seen(page.getByText("1 memory")), "Delete one memory");
await shot("07d-memory-centre");
await page.getByRole("button", { name: "Clear chat with Dhruv" }).click();
await page.getByRole("button", { name: "Yes, delete" }).click();
ok(await seen(page.getByText("Chat cleared")), "Clear chat (confirmed first)");
await page.getByRole("button", { name: "Turn memory off" }).click();
ok(await seen(page.getByText("Memory is off")), "Turn memory off any time");
await page.goto(`${BASE}/saathi/settings`);
await page.getByRole("radio", { name: /^Off/ }).click();
await page.getByRole("button", { name: "Save", exact: true }).click();
await page.waitForURL("**/saathi");
ok(await seen(page.getByText(/30 free messages a day · 27 left/)), "Clearing chat didn't reset today's free messages");
await page.fill("#ai-msg", "I want to end my life");
await btn("Send").click();
ok(await seen(page.getByText(/Tele-MANAS on 14416/)), "Crisis message gets the Tele-MANAS help reply");
await shot("08-saathi");

// E12: after a real conversation gets going, Saathi steps back
await page.goto(`${BASE}/chat/m-s-sanya`);
for (const t of ["Albert Hall at sunset?", "Saturday works", "See you there"]) { await page.fill("#msg", t); await btn("Send").click(); await page.waitForTimeout(250); }
await page.goto(`${BASE}/saathi`);
ok(await seen(page.getByText("Saathi paused")), "Saathi steps back while you talk to Sanya (E12)");
await shot("09-saathi-paused");
await btn("Talk to Dhruv anyway").click();
ok(await seen(page.locator("#ai-msg")), "…and you can still talk to Dhruv");

ok(errors.length === 0, `no page errors ${errors.join(" | ")}`);
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
