import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Search engines may read the website; everything behind sign-in, share links and the sign-up steps stays out.
const PRIVATE = ["/open", "/home", "/discover", "/likes", "/matches", "/match/", "/chat/", "/profile/", "/me", "/settings", "/privacy", "/delete",
  "/wallet", "/store", "/checkout", "/payment/", "/invoice/", "/plans", "/tiers", "/inbox", "/menu", "/toolkit", "/readings", "/report/", "/kick",
  "/saathi", "/guru/", "/maasi", "/couple", "/universe", "/story", "/together/", "/seven/", "/imagine/", "/golden/", "/ask/", "/boost", "/travel",
  "/cupid", "/invite", "/trusted", "/share-date", "/sos", "/safety/report", "/checkin/", "/check", "/gift", "/why", "/why-not", "/my-kundli", "/filters",
  "/account-status", "/basics", "/birth", "/bonus", "/consent", "/goal", "/lifestyle", "/phone", "/photos", "/preferences", "/selfie", "/vibe", "/kundli",
  "/waitlist", "/tour/", "/install", "/login", "/offline", "/g/", "/i/", "/k/", "/s/"];

// AI assistants and their search crawlers are welcome on the website (same rules as everyone), named so it's explicit.
const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User",
  "Google-Extended", "Applebot-Extended", "Bingbot", "meta-externalagent", "CCBot"];

export default function robots(): MetadataRoute.Robots {
  const allow = ["/", "/llms.txt", "/about", "/check-your-crush", "/kundli-matching"];
  return {
    rules: [{ userAgent: "*", allow, disallow: PRIVATE }, { userAgent: AI_BOTS, allow, disallow: PRIVATE }],
    sitemap: `${SITE_URL}/sitemap.xml`, host: SITE_URL,
  };
}
