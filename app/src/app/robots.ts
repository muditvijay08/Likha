import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Search engines may read the website; everything behind sign-in, share links and the sign-up steps stays out.
const PRIVATE = ["/open", "/home", "/discover", "/likes", "/matches", "/match/", "/chat/", "/profile/", "/me", "/settings", "/privacy", "/delete",
  "/wallet", "/store", "/checkout", "/payment/", "/invoice/", "/plans", "/tiers", "/inbox", "/menu", "/toolkit", "/readings", "/report/", "/kick",
  "/saathi", "/guru/", "/maasi", "/couple", "/universe", "/story", "/together/", "/seven/", "/imagine/", "/golden/", "/ask/", "/boost", "/travel",
  "/cupid", "/invite", "/trusted", "/share-date", "/sos", "/safety/report", "/checkin/", "/check", "/gift", "/why", "/why-not", "/my-kundli", "/filters",
  "/account-status", "/basics", "/birth", "/bonus", "/consent", "/goal", "/lifestyle", "/phone", "/photos", "/preferences", "/selfie", "/vibe", "/kundli",
  "/waitlist", "/tour/", "/install", "/offline", "/g/", "/i/", "/k/", "/s/"];

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: ["/", "/check-your-crush", "/kundli-matching"], disallow: PRIVATE }], sitemap: `${SITE_URL}/sitemap.xml`, host: SITE_URL };
}
