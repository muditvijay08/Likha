// Tells Bing (and through IndexNow, Yandex, Seznam, Naver) that the website changed, so new pages show up in
// search and in AI answers that use Bing (ChatGPT search, Copilot) within hours, not weeks.
//   node scripts/indexnow.mjs https://likha.in
// Reads the live sitemap and the key from /indexnow.txt; sends every URL. Safe to run after every deploy.
const site = (process.argv[2] ?? "https://likha.in").replace(/\/$/, "");
const key = (await (await fetch(`${site}/indexnow.txt`)).text()).trim();
if (!/^[a-f0-9]{32}$/.test(key)) throw new Error(`no IndexNow key at ${site}/indexnow.txt`);
const xml = await (await fetch(`${site}/sitemap.xml`)).text();
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).slice(0, 10000);
const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST", headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(site).host, key, keyLocation: `${site}/indexnow.txt`, urlList }),
});
console.log(`IndexNow: ${urlList.length} URLs, HTTP ${res.status}`);
if (res.status >= 400) process.exit(1);
