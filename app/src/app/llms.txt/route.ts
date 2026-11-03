// likha.in/llms.txt: a plain summary for AI assistants and search engines (llmstxt.org format).
// Built from lib/about.ts and lib/site.ts, so it always matches the website.
import { COMPANY, FEATURES, ONE_LINER, PRICING, PRINCIPLES, SUMMARY, cities } from "@/lib/about";
import { GUIDES, SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  const u = (p: string) => `${SITE_URL}${p}`;
  const text = `# Likha

> ${ONE_LINER}

${SUMMARY}

## Key facts
- Website: ${SITE_URL}
- Company: ${COMPANY.legalName}, ${COMPANY.city}, ${COMPANY.region}, India
- Founder: ${COMPANY.founder}
- Tagline: "Jo likha hai, woh milega."
- Cities: ${cities().join(", ")} (each opens when its Founding Members list fills)
- Who can join: anyone 18 or older with a mobile number
- Price: ${PRICING}

## What Likha does
${FEATURES.map(([t, d]) => `- ${t}: ${d}`).join("\n")}

## What Likha will not do
${PRINCIPLES.map((p) => `- ${p}`).join("\n")}

## Pages
- [About Likha](${u("/about")}): who we are and what the app does
- [How it works](${u("/how-it-works")}): from kundli to first date
- [Safety](${u("/safety")}): verification, privacy and date safety
- [Questions](${u("/faq")}): price, privacy, caste, Manglik, deleting an account
- [Check your crush](${u("/check-your-crush")}): free Moon-sign compatibility check
${GUIDES.map((g) => `- [${g.title}](${u(g.href)}): ${g.sub}`).join("\n")}

## Optional
- [All 12 rashis](${u("/rashi")})
- [Terms](${u("/legal/terms")}), [Privacy](${u("/legal/privacy")}), [Grievance Officer](${u("/help")})
`;
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
