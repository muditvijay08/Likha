// Social posts: the plan's facts, the words' checks, and each platform's API calls (mocked fetch).
import { deepStrictEqual as assertEquals, match as assertMatch, ok as assert } from "node:assert";
import {
  type Bank, KIND_BY_DAY, MYTHS, checkWritten, factsFor, finishCaptions, platformsFor, templateCaptions, weekIndex, weekSlots,
} from "../functions/_shared/social.ts";
import { styleCheck } from "../functions/_shared/core.ts";
import { facebook, instagram, linkedin, oauth1, x, youtube } from "../functions/_shared/social_publish.ts";

const JAIPUR = { name: "Jaipur", lat: 26.9124, lng: 75.7873, timezone: "Asia/Kolkata" };
const BANK: Bank = {
  site: "https://likha.in",
  features: [{ title: "Kundli on every profile", line: "Guna Milan and the Jodi Score." }, { title: "Real charts", line: "NASA JPL data." },
    { title: "Free to date", line: "Liking and chatting are free." }, { title: "Women set the pace", line: "Women can message first." },
    { title: "Verified", line: "Selfie check." }, { title: "Safety", line: "SOS." }],
  principles: ["No caste."],
  kootas: [{ name: "Varna", max: 1, about: "Work style and ego.", from: "moon" }, { name: "Nadi", max: 8, about: "Most weighted.", from: "nak" }],
  pairs: [{ slug: "aries-and-pisces", a: "Mesh", a_en: "Aries", b: "Meen", b_en: "Pisces", points: 12, out_of: 12, maitri: 5, bhakoot: "2/12",
    bhakoot_meaning: "Talk about money early.", dosha: true, cancelled_because: "their lords are friends", band: "Very supportive Moon signs", url: "https://likha.in/compatibility/aries-and-pisces" }],
};

Deno.test("a week is Monday to Sunday at 7:30 PM IST, one kind each day", () => {
  const s = weekSlots("2026-11-09", "19:30");
  assertEquals(s.length, 7);
  assertEquals(s[0], { date: "2026-11-09", at: "2026-11-09T14:00:00.000Z" });
  assertEquals(s[6].date, "2026-11-15");
  assertEquals(KIND_BY_DAY, ["panchang", "pair", "koota", "feature", "myth", "golden", "brand"]);
  assert(weekIndex("2026-11-16") === weekIndex("2026-11-09") + 1);
});

Deno.test("panchang facts are computed for the city and the date", () => {
  const { facts, card } = factsFor("panchang", "2026-11-09", 0, BANK, JAIPUR);
  const times = (facts as any).times;
  assertMatch(times.Sunrise, /^6:\d\d AM$/);
  assertMatch(times.Sunset, /^5:\d\d PM$/);
  assertMatch(times["Rahu Kaal"], /–/);                    // Monday: 7:30–9:00 AM-ish
  assertEquals(card.kicker, "Jaipur · Mon 9 Nov");
  assert((card.facts ?? []).length >= 3);
});

Deno.test("golden hours facts are real windows; pair facts copy the engine's numbers", () => {
  const g = factsFor("golden", "2026-11-14", 0, BANK, JAIPUR);
  assert((g.card.facts ?? []).length > 0 && (g.card.facts ?? []).every(([k]) => /^(Sat|Sun) · /.test(k)));
  const p = factsFor("pair", "2026-11-10", 0, BANK, JAIPUR);
  assertEquals(p.card.big, "12/12");
  assertEquals(p.card.headline, "Mesh + Meen");
  assertEquals((p.facts as any).bhakoot, "2/12, dosha cancelled");
});

Deno.test("template words pass the house checks for every kind, every week of rotation", () => {
  for (let w = 0; w < 12; w++) for (const [i, kind] of KIND_BY_DAY.entries()) {
    const date = weekSlots("2026-11-09")[i].date;
    const { facts, card } = factsFor(kind, date, w, BANK, JAIPUR);
    const c = finishCaptions(templateCaptions(kind, facts, card, BANK.site), { hashtags: ["#Likha", "#KundliMatching"] }, BANK.site, (facts as any).url);
    const all = Object.values(c).join("\n") + JSON.stringify(card);
    assertEquals(styleCheck(all).problems, [], `${kind} week ${w}`);
    assert(!/\b(caste|guarantee|AI)\b/.test(all.replace(/No caste/g, "")), `${kind} week ${w}: ${all.slice(0, 80)}`);
    assert(c.x.length <= 280 && c.youtube_title.length <= 100 && c.instagram.length <= 2200, `${kind} lengths`);
    assert(c.instagram.includes("likha.in") && c.youtube_title.endsWith("#Shorts"));
  }
  assert(MYTHS.every((m) => !/guarantee|death|divorce/i.test(m.myth + m.fact)));
});

Deno.test("the writer's words are refused for invented numbers, AI, hashtags or length", () => {
  const { facts, card } = factsFor("pair", "2026-11-10", 0, BANK, JAIPUR);
  const good = { headline: "Mesh aur Meen", sub: "", instagram: "Mesh + Meen = 12/12 Moon-sign points, Graha Maitri 5/5.", facebook: "Mesh aur Meen, kya jodi!",
    linkedin: "Aries and Pisces Moon signs score 12 of 12.", x: "Mesh + Meen: 12/12", youtube_title: "Mesh + Meen", youtube_description: "Moon signs ki baat." };
  assertEquals(checkWritten(good, facts, card), []);
  assert(checkWritten({ ...good, x: "Mesh + Meen: 34/36 gunas!" }, facts, card).some((p) => p.startsWith("numbers not in the facts")));
  assert(checkWritten({ ...good, facebook: "Our AI matched them" }, facts, card).length > 0);
  assert(checkWritten({ ...good, instagram: "Love it #Mesh" }, facts, card).includes("wrote hashtags"));
  assert(checkWritten({ ...good, headline: "one two three four five six seven eight nine" }, facts, card).includes("headline too long"));
  assert(checkWritten({ ...good, linkedin: "" }, facts, card).includes("missing linkedin"));
  assert(checkWritten({ ...good, instagram: "Join thousands of singles" }, facts, card).includes("claims a big number"));
});

Deno.test("YouTube only when there is a video; platforms follow settings", () => {
  assertEquals(platformsFor("panchang", {}).platforms, ["instagram", "facebook", "linkedin", "x", "youtube"]);
  assertEquals(platformsFor("myth", {}).platforms, ["instagram", "facebook", "linkedin", "x"]);
  assertEquals(platformsFor("myth", { platforms: { x: false, linkedin: false } }).platforms, ["instagram", "facebook"]);
  assertEquals(platformsFor("golden", { platforms: ["instagram", "youtube"] }).platforms, ["instagram", "youtube"]);
});

// ---------------------------------------------------------------- platforms
type Call = { url: string; init?: RequestInit };
function mock(replies: ((c: Call) => Response | undefined)[]) {
  const calls: Call[] = [];
  const f = ((url: string | URL | Request, init?: RequestInit) => {
    const c = { url: String(url), init }; calls.push(c);
    for (const r of replies) { const out = r(c); if (out) return Promise.resolve(out); }
    return Promise.resolve(new Response("unexpected " + c.url, { status: 500 }));
  }) as typeof fetch;
  return { f, calls };
}
const J = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", ...headers } });
const POST = { captions: { instagram: "Hi", facebook: "Hi", linkedin: "Kundli (36 gunas) #Likha", x: "Hi", youtube_title: "T #Shorts", youtube_description: "D" },
  assets: { image: "https://cdn/x.jpg", video: "https://cdn/x.mp4" }, results: {}, video: false };
const IMG = new Uint8Array([0xff, 0xd8, 1, 2]);

Deno.test("OAuth 1.0a signature matches X's published example", async () => {
  const h = await oauth1("POST", "https://api.twitter.com/1.1/statuses/update.json",
    { key: "xvz1evFS4wEEPTGEFPHBog", secret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw", token: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb", tokenSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE" },
    { status: "Hello Ladies + Gentlemen, a signed OAuth request!", include_entities: "true" }, "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", "1318622958");
  assert(h.includes(`oauth_signature="${encodeURIComponent("hCtSmYh+iHYCEqBWrE7C7hYmtUk=")}"`), h);
});

Deno.test("Instagram image: container, then publish, then permalink", async () => {
  const { f, calls } = mock([
    (c) => c.url.endsWith("/IG/media") ? J({ id: "C1" }) : undefined,
    (c) => c.url.includes("/C1?fields=status_code") ? J({ status_code: "FINISHED" }) : undefined,
    (c) => c.url.endsWith("/IG/media_publish") ? J({ id: "M1" }) : undefined,
    (c) => c.url.includes("/M1?fields=permalink") ? J({ permalink: "https://instagram.com/p/x" }) : undefined,
  ]);
  const r = await instagram(f, { token: "T", igUser: "IG", version: "v23.0" }, POST);
  assertEquals(r, { ok: true, id: "M1", url: "https://instagram.com/p/x" });
  assertEquals(new URLSearchParams(String(calls[0].init?.body)).get("image_url"), "https://cdn/x.jpg");
});

Deno.test("Instagram Reel still processing comes back as pending, then publishes next run", async () => {
  let ready = false;
  const { f } = mock([
    (c) => c.url.endsWith("/IG/media") ? J({ id: "C2" }) : undefined,
    (c) => c.url.includes("/C2?fields=status_code") ? J({ status_code: ready ? "FINISHED" : "IN_PROGRESS" }) : undefined,
    (c) => c.url.endsWith("/IG/media_publish") ? J({ id: "M2" }) : undefined,
    (c) => c.url.includes("permalink") ? J({}) : undefined,
  ]);
  const first = await instagram(f, { token: "T", igUser: "IG", version: "v23.0" }, { ...POST, video: true });
  assertEquals(first, { ok: false, pending: { container: "C2" } });
  ready = true;
  const second = await instagram(f, { token: "T", igUser: "IG", version: "v23.0" }, { ...POST, video: true, results: { instagram: first } });
  assertEquals(second.ok, true);
});

Deno.test("Facebook photo, and a refused token is reported", async () => {
  const ok = mock([(c) => c.url.endsWith("/PG/photos") ? J({ id: "P1", post_id: "PG_1" }) : undefined]);
  assertEquals((await facebook(ok.f, { token: "T", page: "PG", version: "v23.0" }, POST)).id, "PG_1");
  const bad = mock([(c) => c.url.endsWith("/PG/photos") ? J({ error: { message: "Invalid OAuth access token" } }, 400) : undefined]);
  const r = await facebook(bad.f, { token: "T", page: "PG", version: "v23.0" }, POST);
  assertEquals(r.ok, false); assertMatch(r.error!, /Facebook 400: Invalid OAuth/);
});

Deno.test("LinkedIn: upload the image, then a post with escaped text and working hashtags", async () => {
  const { f, calls } = mock([
    (c) => c.url.includes("images?action=initializeUpload") ? J({ value: { uploadUrl: "https://up/1", image: "urn:li:image:9" } }) : undefined,
    (c) => c.url === "https://up/1" ? new Response(null, { status: 201 }) : undefined,
    (c) => c.url.endsWith("/rest/posts") ? new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:7" } }) : undefined,
  ]);
  const r = await linkedin(f, { token: "T", author: "urn:li:organization:1", version: "202510" }, POST, IMG);
  assertEquals(r, { ok: true, id: "urn:li:share:7", url: "https://www.linkedin.com/feed/update/urn:li:share:7" });
  const body = JSON.parse(String(calls[2].init?.body));
  assertEquals(body.commentary, "Kundli \\(36 gunas\\) #Likha");
  assertEquals(body.content.media.id, "urn:li:image:9");
});

Deno.test("X: media upload, then the post with it", async () => {
  const { f, calls } = mock([
    (c) => c.url.endsWith("/2/media/upload") ? J({ data: { id: "55" } }) : undefined,
    (c) => c.url.endsWith("/2/tweets") ? J({ data: { id: "99" } }, 201) : undefined,
  ]);
  const r = await x(f, { key: "k", secret: "s", token: "t", tokenSecret: "ts" }, POST, IMG);
  assertEquals(r, { ok: true, id: "99", url: "https://x.com/i/web/status/99" });
  assertEquals(JSON.parse(String(calls[1].init?.body)).media.media_ids, ["55"]);
  assertMatch(String((calls[1].init?.headers as Record<string, string>).authorization), /^OAuth oauth_consumer_key="k"/);
});

Deno.test("YouTube: refresh token, resumable upload, Shorts link; private by default", async () => {
  const { f, calls } = mock([
    (c) => c.url.includes("oauth2.googleapis.com/token") ? J({ access_token: "A" }) : undefined,
    (c) => c.url.includes("uploadType=resumable") ? new Response(null, { status: 200, headers: { location: "https://upload/2" } }) : undefined,
    (c) => c.url === "https://upload/2" ? J({ id: "vid1" }) : undefined,
  ]);
  const r = await youtube(f, { clientId: "c", clientSecret: "s", refresh: "r", privacy: "nonsense" }, { ...POST, video: true }, IMG);
  assertEquals(r, { ok: true, id: "vid1", url: "https://www.youtube.com/shorts/vid1" });
  assertEquals(JSON.parse(String(calls[1].init?.body)).status.privacyStatus, "private");
  const bad = mock([(c) => c.url.includes("token") ? J({ error: "invalid_grant" }, 400) : undefined]);
  assertMatch((await youtube(bad.f, { clientId: "c", clientSecret: "s", refresh: "r", privacy: "public" }, POST, IMG)).error!, /refresh token/);
});
