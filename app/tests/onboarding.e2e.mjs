// End-to-end onboarding walk-through in demo mode (NEXT_PUBLIC_DEMO=1 build, `next start` on :3000).
// Two people: Riya (woman, Jaipur: live city -> kundli -> bonus -> tour) and Aarav (man, Pune: waitlist).
// Saves a screenshot of every screen to tests/shots/.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = new URL("./shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("PASS |", msg); } else { fail++; console.log("FAIL |", msg); } };

// a small JPEG to upload
const jpg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
writeFileSync("/tmp/face.jpg", jpg);

const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });

async function person({ name, gender, phone, city, tob, expectLive }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["camera"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = async (n) => page.screenshot({ path: `${OUT}${name}-${n}.png`, fullPage: true });
  const click = (text) => page.getByRole("button", { name: text, exact: true }).click();

  await page.goto(`${BASE}/`);
  await page.waitForURL("**/start");
  await shot("01-start");
  await click(gender === "woman" ? "Woman" : "Man");
  await page.waitForURL("**/phone");
  ok(await page.evaluate(() => document.documentElement.dataset.gender) === gender, `${name}: gender colour set to ${gender}`);
  await page.fill("#phone", phone);
  await click("Send code");
  await page.getByLabel("Digit 1").waitFor();
  await page.getByLabel("Digit 1").fill("111111");
  await click("Verify");
  ok(await page.locator(".error").textContent().then((t) => /didn't work/.test(t)), `${name}: wrong OTP is refused`);
  await page.getByLabel("Digit 1").fill("123456");
  await shot("02-phone");
  await click("Verify");
  await page.waitForURL("**/consent");
  await click("Agree and continue");
  ok(await page.locator(".error").isVisible(), `${name}: consent needs the required boxes`);
  for (const id of ["c-age", "c-terms", "c-birth", "c-photo"]) await page.check(`#${id}`);
  await shot("03-consent");
  await click("Agree and continue");

  await page.waitForURL("**/basics");
  ok(await page.getByText(`of ${gender === "woman" ? 150 : 70} credits earned`).isVisible(), `${name}: credit slider shows ${gender === "woman" ? 150 : 70}`);
  await click("Continue");
  ok(await page.locator(".error").isVisible(), `${name}: basics needs a name`);
  await page.fill("#fname", name);
  await page.selectOption("#height", { index: 14 });
  await page.fill("#tongue", "Marwari");
  await page.selectOption("#edu", "Post-graduate");
  await page.fill("#job", "Product designer");
  await page.fill("#city", city.slice(0, 3));
  await page.getByRole("option", { name: new RegExp(city) }).first().click();
  await shot("04-basics");
  await click("Continue");

  await page.waitForURL("**/lifestyle");
  for (const [group, opt] of [["Diet", "Vegetarian"], ["Drinking", "Socially"], ["Smoking", "Never"], ["Workout", "Often"], ["Kids", "Want"], ["Open to relocating", "Maybe"]])
    await page.getByRole("group", { name: group }).getByRole("button", { name: opt, exact: true }).click();
  await shot("05-lifestyle");
  await click("Continue");

  await page.waitForURL("**/birth");
  await page.fill("#dob", "1999-03-14");
  await click("Build my kundli");
  ok(/Birth time is a must|birthplace/i.test(await page.locator(".error").textContent()), `${name}: birth time is required`);
  await page.fill("#tob", tob);
  await page.fill("#pob", "Jaip");
  await page.getByRole("option", { name: /Jaipur, Rajasthan/ }).click();
  await click("Build my kundli");
  ok(await page.getByRole("alertdialog").isVisible(), `${name}: asked to confirm birth details before they lock`);
  await shot("06-birth");
  await click("Yes, build my kundli");

  await page.waitForURL("**/photos");
  for (const n of [1, 2, 3]) {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: `Add photo ${n}` }).click();
    await (await chooser).setFiles("/tmp/face.jpg");
    await page.getByAltText(`Photo ${n}`).waitFor();
  }
  await shot("07-photos");
  await click("Continue with 3 photos");

  await page.waitForURL("**/selfie");
  await click("Turn on camera");
  await click("Start check");
  await page.getByText("Verified. Welcome to the real side.").waitFor({ timeout: 10000 });
  await shot("08-selfie");
  await click("Continue");

  await page.waitForURL("**/vibe");
  await page.fill("#about", "Product designer, part-time chai critic. Weekends mean Albert Hall walks.");
  await page.fill("#fond", "Old Hindi songs, long drives to Nahargarh, voice notes.");
  for (const i of ["Travel", "Chai", "Cricket", "Cooking"]) await click(i);
  await shot("09-vibe");
  await click("Continue");

  await page.waitForURL("**/goal");
  await page.getByRole("radio", { name: /Matchmaking/ }).click();
  await shot("10-goal");
  await click("Continue");

  await page.waitForURL("**/preferences");
  ok(await page.getByText(`Last step. All ${gender === "woman" ? 150 : 70} credits unlock after it.`).isVisible(), `${name}: last step message`);
  await page.getByRole("radio", { name: "Any city" }).click();
  await shot("11-preferences");
  await click(expectLive ? "Build my kundli" : "Continue");

  if (!expectLive) {
    await page.waitForURL("**/waitlist");
    await page.getByText(/your stars are aligning/).waitFor();
    ok(await page.getByText(`${city}, your stars are aligning`).isVisible(), `${name}: ${city} is not live, so waitlist`);
    await shot("12-waitlist");
  } else {
    await page.waitForURL("**/kundli");
    await page.getByText("YOUR KUNDLI IS READY").waitFor({ timeout: 15000 });
    ok(await page.getByRole("img", { name: /birth chart, Leo ascendant/ }).isVisible(), `${name}: chart drawn with Lagna`);
    await shot("13-kundli");
    await click("Continue");
    await page.waitForURL("**/install");
    await shot("14-install");
    await click("Maybe later");
    await page.waitForURL("**/bonus");
    await page.getByText("You're all set. Credits unlocked.").waitFor();
    ok(await page.getByText("100%").first().isVisible(), `${name}: profile 100% and bonus unlocked`);
    await shot("15-bonus");
    await page.getByRole("link", { name: "Show me around" }).click();
    for (const n of [1, 2, 3]) {
      await page.waitForURL(`**/tour/${n}`);
      await shot(`T${n}-tour`);
      await page.getByRole("link", { name: n < 3 ? "Next" : "Start exploring" }).click();
    }
    await page.waitForURL("**/home");
    ok(await page.getByText("Profile 100% complete").waitFor({ timeout: 5000 }).then(() => true, () => false), `${name}: lands on Home with a complete profile`);
    // resume: a reload of the entry page goes straight to home
    await page.goto(`${BASE}/`); await page.waitForURL("**/home");
    ok(true, `${name}: returning member resumes at Home`);
  }
  ok(errors.length === 0, `${name}: no page errors ${errors.join(" | ")}`);
  await ctx.close();
}

await person({ name: "Riya", gender: "woman", phone: "9829041234", city: "Jaipur", tob: "06:42", expectLive: true });
await person({ name: "Aarav", gender: "man", phone: "9829041235", city: "Pune", tob: "21:10", expectLive: false });
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
