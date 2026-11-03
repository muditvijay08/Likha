// The facts the weekly social planner works from (supabase/functions/social-worker): features, principles, kootas,
// rashis and all 78 Moon-sign pairs, computed by the same code as the website. Public, like the pages it comes from.
import { FEATURES, PRINCIPLES } from "@/lib/about";
import { ALL_PAIRS, BAND_WORD, BHAKOOT_MEANING, KOOTAS, RASHIS } from "@/lib/rashi";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  const bank = {
    site: SITE_URL,
    features: FEATURES.map(([title, line]) => ({ title, line })),
    principles: PRINCIPLES,
    kootas: KOOTAS.map(([name, max, about, from]) => ({ name, max, about, from })),
    rashis: RASHIS.map((r) => ({ i: r.i, slug: r.slug, en: r.en, hi: r.hi, deva: r.deva, lord: r.lord, element: r.element, love: r.love, needs: r.needs })),
    pairs: ALL_PAIRS.map((p) => ({
      slug: p.slug, a: p.a.hi, a_en: p.a.en, b: p.b.hi, b_en: p.b.en, points: p.points, out_of: 12, maitri: p.maitri,
      bhakoot: p.bhakoot.pair, bhakoot_meaning: BHAKOOT_MEANING[p.bhakoot.pair], dosha: p.bhakoot.dosha, cancelled_because: p.bhakoot.cancelled,
      band: BAND_WORD[p.band], url: `${SITE_URL}/compatibility/${p.slug}`,
    })),
  };
  return Response.json(bank, { headers: { "cache-control": "public, max-age=3600" } });
}
