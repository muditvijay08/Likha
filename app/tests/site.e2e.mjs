// Public website (likha.in) in demo mode: pages render on the server with titles, canonicals and structured data,
// the Founding Members form validates and joins, invites work, signed-in members go to the app, and no CSP errors.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = new URL("./shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("PASS |", msg); } else { fail++; console.log("FAIL |", msg); } };

// 1. server HTML (what a search engine sees, no JavaScript)
const pages = ["/", "/how-it-works", "/safety", "/check-your-crush", "/faq", "/kundli-matching", "/manglik-dosha", "/moon-sign-calculator",
  "/rashi", "/rashi/aries", "/rashi/pisces", "/compatibility", "/compatibility/aries-and-pisces", "/compatibility/leo-and-capricorn", "/compatibility/cancer-and-cancer",
  "/dating/jaipur", "/dating/dubai"];
for (const p of pages) {
  const html = await (await fetch(BASE + p)).text();
  const title = /<title>([^<]+)/.exec(html)?.[1] ?? "";
  ok(title.length > 20 && title.length < 110, `${p}: title (${title.length} chars)`);
  ok(new RegExp(`rel="canonical" href="https://likha.in${p === "/" ? "/?" : p}"`).test(html), `${p}: canonical`);
  ok(/<h1[^>]*>/.test(html) && /<meta name="description" content="[^"]{60,}/.test(html), `${p}: h1 and description in the HTML`);
  ok(/application\/ld\+json/.test(html), `${p}: structured data`);
  ok(!/\bAI\b/.test(html.replace(/<script[\s\S]*?<\/script>/g, "")), `${p}: never says AI`);
}
const pairHtml = await (await fetch(BASE + "/compatibility/aries-and-pisces")).text();
ok(/<b>12<\/b>/.test(pairHtml) && /dosha cancelled/.test(pairHtml) && /Mars and Jupiter, are friends/.test(pairHtml), "Mesh and Meen: 12/12, 2/12 dosha cancelled by friendly lords (engine rules)");
const lc = await (await fetch(BASE + "/compatibility/leo-and-capricorn")).text();
ok(/<b>0<\/b>/.test(lc) && /no classical cancellation/.test(lc), "Simha and Makar: 0/12, 6/8 not cancelled");
ok((await fetch(BASE + "/compatibility/pisces-and-aries")).status === 404, "reversed pair is not a second page");
ok((await fetch(BASE + "/rashi/pluto")).status === 404, "unknown rashi is 404");
const sitemap = await (await fetch(BASE + "/sitemap.xml")).text();
ok((sitemap.match(/<url>/g) ?? []).length === 109, "sitemap lists 109 pages");
ok(!/\/home<|\/chat|\/open</.test(sitemap), "sitemap has no app screens");
const robots = await (await fetch(BASE + "/robots.txt")).text();
ok(/Disallow: \/home/.test(robots) && /Disallow: \/chat\//.test(robots) && /Sitemap: https:\/\/likha.in\/sitemap.xml/.test(robots), "robots keeps app screens out and points to the sitemap");
ok((await fetch(BASE + "/opengraph-image")).headers.get("content-type") === "image/png", "link preview image");
const manifest = await (await fetch(BASE + "/manifest.webmanifest")).json();
ok(manifest.start_url === "/open", "installed app opens the app, not the website");

// 2. in the browser
const browser = await chromium.launch();
for (const [label, viewport] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (/Content Security Policy|Refused to (load|connect|execute|frame)/i.test(m.text())) errors.push("CSP: " + m.text().slice(0, 160)); });
  await page.goto(BASE + "/");
  await page.getByRole("form", { name: "Join as a Founding Member" }).waitFor();
  await page.getByText("Sample numbers. Real counts show once a city passes 100 members.").waitFor();
  ok(true, `${label}: city counters labelled as sample numbers`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label}: no sideways scroll`);
  await page.screenshot({ path: `${OUT}site-${label}-home.png`, fullPage: true });
  const form = page.getByRole("form", { name: "Join as a Founding Member" });
  ok(!(await form.getByRole("checkbox").isChecked()), `${label}: consent box starts unticked`);
  if (label === "desktop") {
    await form.getByRole("button", { name: "Join as a Founding Member" }).click();
    ok(/first name/.test(await form.getByRole("alert").textContent()), "empty form: asks for first name");
    await form.getByLabel("First name").fill("Sneha");
    await form.getByLabel("Mobile number").fill("98290 12345");
    await form.getByLabel("City", { exact: true }).selectOption("pune");
    await form.getByRole("radio", { name: "Woman" }).click();
    await form.getByRole("button", { name: "Join as a Founding Member" }).click();
    ok(/18\+/.test(await form.getByRole("alert").textContent()), "consent is required");
    await form.getByRole("checkbox").check();
    await form.getByRole("button", { name: "Join as a Founding Member" }).click();
    await page.getByText(/You're #\d+ in Pune/).waitFor();
    ok(true, "joins Pune and sees their place");
    const link = await page.getByLabel("Your invite link").inputValue();
    ok(/\/\?invite=[a-f0-9]{8}$/.test(link), "gets an invite link");
    ok(/wa\.me/.test(await page.getByRole("link", { name: "Share on WhatsApp" }).getAttribute("href")), "WhatsApp share");
    await page.screenshot({ path: `${OUT}site-desktop-joined.png` });
    // same number again
    await page.goto(BASE + link.replace(/^https?:\/\/[^/]+/, ""));
    const f2 = page.getByRole("form", { name: "Join as a Founding Member" });
    await f2.waitFor();
    ok(await page.getByText("You were invited by a friend").isVisible(), "invite link is recognised");
    await f2.getByLabel("First name").fill("Sneha");
    await f2.getByLabel("Mobile number").fill("+91 98290 12345");
    await f2.getByLabel("City", { exact: true }).selectOption("pune");
    await f2.getByRole("radio", { name: "Woman" }).click();
    await f2.getByRole("checkbox").check();
    await f2.getByRole("button", { name: "Join as a Founding Member" }).click();
    await page.getByText("You're already on the list.").waitFor();
    ok(true, "same number twice: already on the list");
    // live city
    await page.goto(BASE + "/");
    const f3 = page.getByRole("form", { name: "Join as a Founding Member" });
    await f3.getByLabel("City", { exact: true }).selectOption("jaipur");
    ok(await f3.getByRole("link", { name: /Jaipur is live: start now/ }).isVisible(), "live city: start now instead of the waitlist");
    // tools
    await page.goto(BASE + "/moon-sign-calculator");
    await page.getByLabel("Date of birth").fill("1994-06-15");
    await page.getByRole("button", { name: "Find my Moon sign" }).click();
    await page.getByRole("status").waitFor();
    ok(/Moon sign is most likely|moving between/.test(await page.getByRole("status").textContent()), "Moon sign finder answers, and says it's approximate");
    await page.goto(BASE + "/compatibility");
    await page.getByLabel("Your Moon sign").selectOption("4");
    await page.getByLabel("Their Moon sign").selectOption("0");
    await page.getByRole("button", { name: "See our match" }).click();
    await page.waitForURL("**/compatibility/aries-and-leo");
    ok(true, "pair picker opens the pair page in zodiac order");
    await page.screenshot({ path: `${OUT}site-desktop-pair.png`, fullPage: true });
  }
  ok(errors.length === 0, `${label}: no page or CSP errors ${errors.join(" | ")}`);
  await ctx.close();
}

// 3. signed-in members go to the app
{
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { if (!localStorage.getItem("likha-demo-db")) localStorage.setItem("likha-demo-db", JSON.stringify({ signedIn: true, consents: [], photos: [], prompts: [], interests: [], pushTokens: [] })); });
  const page = await ctx.newPage();
  await page.goto(BASE + "/");
  await page.waitForURL((u) => !u.pathname.match(/^\/$/), { timeout: 8000 }).catch(() => {});
  ok(new URL(page.url()).pathname === "/consent", `signed-in member is sent into the app (${new URL(page.url()).pathname})`);
  await ctx.close();
}
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
