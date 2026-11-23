// node --experimental-strip-types --test tests/unit/match-intel.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { compare, summaryLine, type Side } from "../../src/lib/match-intel.ts";

const full = (over: Partial<Side> & { life?: Side["life"] } = {}): Side => ({
  first_name: "Ishita", goal: "matchmaking", diet: "vegetarian", city: "Jaipur", interests: ["Travel", "Chai"],
  ...over,
  life: { drinking: "never", smoking: "never", kids: "want", relocate: "maybe", marriage_timeline: "1_2y", languages: ["Hindi", "English"],
          hometown: "Udaipur", workout: "often", family_setup: "joint", career_plan: "both_work", comm_style: "caller", conflict_style: "talk_now",
          weekend_style: "outdoors", money_style: "saver", life_values: ["family", "humour"], ...(over.life ?? {}) },
});
const me = (life: Side["life"] = {}, over: Partial<Side> = {}) => full({ first_name: "Aarav", ...over, life });
const item = (x: ReturnType<typeof compare>, key: string) => x.items.find((i) => i.key === key)!;

test("the same answers line up, and the verdict is a strong fit", () => {
  const x = compare(me(), full());
  assert.equal(x.counts.differ, 0);
  assert.equal(x.counts.unknown, 0);
  assert.equal(x.verdict, "strong");
  assert.match(item(x, "life_values").text, /family and humour/);
  assert.match(item(x, "location").text, /both in Jaipur\. Both from Udaipur/);
});

test("nothing is invented: a missing answer is 'not known yet', and says whose", () => {
  const them = full({ life: { kids: null, money_style: null } });
  const x = compare(me({ family_setup: null }), them);
  assert.equal(item(x, "kids").status, "unknown");
  assert.equal(item(x, "kids").missing, "them");
  assert.match(item(x, "kids").text, /Ishita hasn't shared this yet/);
  assert.equal(item(x, "family_setup").missing, "me");
  assert.ok(x.myMissing.includes("family_setup"));
  assert.equal(item(x, "money_style").theirs, null);
});

test("kids: want vs don't want is a big difference, flagged first", () => {
  const x = compare(me({ kids: "want" }), full({ life: { kids: "dont_want" } }));
  assert.equal(item(x, "kids").status, "differ");
  assert.equal(x.verdict, "big_differences");
  assert.match(item(x, "kids").text, /you want kids, Ishita doesn't want kids/);
});

test("food: vegetarian and Jain are close; vegetarian and non-veg is a conversation, never a 'differ'", () => {
  assert.equal(item(compare(me({}, { diet: "jain" }), full()), "diet").status, "align");
  const nv = item(compare(me({}, { diet: "non_veg" }), full()), "diet");
  assert.equal(nv.status, "talk");
  assert.match(nv.text, /What's cooked at home/);
});

test("drinking two steps apart differs; one step is a conversation", () => {
  assert.equal(item(compare(me({ drinking: "regularly" }), full()), "drinking").status, "differ");
  assert.equal(item(compare(me({ drinking: "socially" }), full()), "drinking").status, "talk");
});

test("'open to either' fits any family set-up and any work plan", () => {
  const x = compare(me({ family_setup: "open", career_plan: "open" }), full({ life: { family_setup: "nuclear", career_plan: "one_home" } }));
  assert.equal(item(x, "family_setup").status, "align");
  assert.equal(item(x, "career_plan").status, "align");
});

test("different cities: nobody moving differs, one open to moving fits", () => {
  assert.equal(item(compare(me({ relocate: "no" }, { city: "Delhi" }), full({ life: { relocate: "no" } })), "location").status, "differ");
  assert.equal(item(compare(me({ relocate: "no" }, { city: "Delhi" }), full({ life: { relocate: "yes" } })), "location").status, "align");
});

test("religion and caste are never compared, even if a caller passes them", () => {
  const x = compare(me({ religion: "A", caste: "B" } as never), full({ life: { religion: "C", caste: "D" } as never }));
  assert.ok(!x.items.some((i) => /religion|caste/i.test(i.key + i.area + i.text)));
});

test("too little shared: 'too early to say', not a verdict", () => {
  const blank: Side = { first_name: "Riya", goal: null, diet: null, city: null, interests: [], life: null };
  const x = compare(me(), blank);
  assert.equal(x.verdict, "too_early");
  assert.equal(summaryLine(x), "Real life: too early to say");
});

test("the Discover line counts honestly", () => {
  const x = compare(me({ conflict_style: "cool_off" }), full());
  assert.equal(summaryLine(x), `Real life: ${x.counts.align} line up · 1 to talk about`);
});
