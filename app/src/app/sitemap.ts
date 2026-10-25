import type { MetadataRoute } from "next";
import { ALL_PAIRS, RASHIS } from "@/lib/rashi";
import { CITY_PAGES, SITE_URL } from "@/lib/site";

// Every public website page. App screens (after sign-in) are not listed and are blocked in robots.txt.
export default function sitemap(): MetadataRoute.Sitemap {
  const at = new Date();
  const page = (path: string, priority: number, changeFrequency: "daily" | "weekly" | "monthly" = "monthly") =>
    ({ url: `${SITE_URL}${path}`, lastModified: at, changeFrequency, priority });
  return [
    page("/", 1, "daily"),
    ...["/how-it-works", "/safety", "/check-your-crush", "/faq"].map((p) => page(p, 0.8)),
    ...["/kundli-matching", "/manglik-dosha", "/moon-sign-calculator", "/compatibility", "/rashi"].map((p) => page(p, 0.9, "weekly")),
    ...CITY_PAGES.map((c) => page(`/dating/${c.slug}`, 0.8, "weekly")),
    ...RASHIS.map((r) => page(`/rashi/${r.slug}`, 0.7)),
    ...ALL_PAIRS.map((p) => page(`/compatibility/${p.slug}`, 0.6)),
    ...["/legal/terms", "/legal/privacy", "/legal/refunds", "/legal/disclaimer", "/help"].map((p) => page(p, 0.3)),
  ];
}
