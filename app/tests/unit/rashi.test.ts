// node --experimental-strip-types --test tests/unit/rashi.test.ts
// The website's Moon-sign pages must use exactly the kundli engine's rules (kundli/likha_kundli/rules.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { ALL_PAIRS, RASHIS, bhakoot, grahaMaitri, nakshatrasOf, pair, pairFromSlug } from "../../src/lib/rashi.ts";

const engine = ["../kundli", "../../kundli"].map((p) => new URL(`../../${p}/`, import.meta.url).pathname).find((p) => existsSync(`${p}likha_kundli/rules.py`));

test("Graha Maitri and Bhakoot match the kundli engine for all 144 sign pairs", { skip: !engine && "kundli engine not next to the app" }, () => {
  const py = `
import json
from likha_kundli import rules as R
from likha_kundli.milan import _maitri, _friends
out = []
for b in range(12):
  for g in range(12):
    lb, lg = R.SIGN_LORD[b], R.SIGN_LORD[g]
    d1 = (b - g) % 12 + 1; d2 = (g - b) % 12 + 1
    bad = (d1, d2) in R.BAD_BHAKOOT
    out.append([b, g, _maitri(lb, lg), 0 if bad else 7, bad and (lb == lg or _friends(lb, lg))])
print(json.dumps(out))`;
  const rows = JSON.parse(execFileSync("python3", ["-c", py], { cwd: engine }).toString()) as [number, number, number, number, boolean][];
  assert.equal(rows.length, 144);
  for (const [b, g, m, bk, cancelled] of rows) {
    assert.equal(grahaMaitri(RASHIS[b].lord, RASHIS[g].lord), m, `maitri ${RASHIS[b].en}/${RASHIS[g].en}`);
    const x = bhakoot(b, g);
    assert.equal(x.points, bk, `bhakoot ${RASHIS[b].en}/${RASHIS[g].en}`);
    assert.equal(!!x.cancelled, cancelled, `bhakoot cancel ${RASHIS[b].en}/${RASHIS[g].en}`);
  }
});

test("78 pages, one per pair, slugs round-trip and reversed slugs aren't pages", () => {
  assert.equal(ALL_PAIRS.length, 78);
  assert.equal(new Set(ALL_PAIRS.map((p) => p.slug)).size, 78);
  for (const p of ALL_PAIRS) assert.equal(pairFromSlug(p.slug)?.points, p.points);
  assert.equal(pairFromSlug("pisces-and-aries"), null);
  assert.equal(pairFromSlug("aries-and-pluto"), null);
  assert.ok(ALL_PAIRS.every((p) => p.points >= 0 && p.points <= 12));
});

test("known pairs", () => {
  const ap = pair(0, 11);                                   // Mesh (Mars) and Meen (Jupiter): friends, 2/12 cancelled
  assert.deepEqual([ap.maitri, ap.bhakoot.pair, ap.bhakoot.dosha, !!ap.bhakoot.cancelled, ap.points], [5, "2/12", true, true, 12]);
  const tl = pair(1, 6);                                    // Vrishabh and Tula: both Venus, 6/8 cancelled
  assert.deepEqual([tl.maitri, tl.bhakoot.pair, tl.bhakoot.cancelled, tl.points], [5, "6/8", "both signs are ruled by Venus", 12]);
  const lc = pair(4, 9);                                    // Simha (Sun) and Makar (Saturn): enemies, 6/8 stays
  assert.deepEqual([lc.maitri, lc.bhakoot.cancelled, lc.points], [0, null, 0]);
  assert.deepEqual(nakshatrasOf(0), ["Ashwini", "Bharani", "Krittika"]);
  assert.deepEqual(nakshatrasOf(11), ["Purva Bhadrapada", "Uttara Bhadrapada", "Revati"]);
});
