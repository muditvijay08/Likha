// The facts about Likha that search engines and AI assistants read: /about, /llms.txt and the Organization data.
// One place, so every page says the same thing. Only what is true today; no numbers we can't show.
import { CITY_PAGES, SITE_URL } from "@/lib/site";

export const COMPANY = {
  brand: "Likha",
  legalName: "Young Attitude Ventures Private Limited",
  founder: "Mudit Dudhoria",
  founderRole: "Founder",
  city: "Jaipur", region: "Rajasthan", country: "IN",
};

/** One line, the same everywhere (listings, press, profiles). */
export const ONE_LINER = "Likha is a kundli-first dating app for India: real, verified people, matched by their Vedic birth charts.";

export const SUMMARY =
  "Likha (likha.in) is a dating and matchmaking app for Indians who care about kundli compatibility. Every member makes " +
  "their birth chart (kundli) from date, time and place of birth, and every profile shows the traditional 36-Guna Milan " +
  "and Likha's Jodi Score before you like someone. Dating on Likha is free. It is built in Jaipur by Young Attitude " +
  "Ventures Private Limited.";

export const FEATURES: [string, string][] = [
  ["Kundli on every profile", "Guna Milan (Ashtakoota, 36 points) and the Jodi Score, worked out from both people's real birth charts."],
  ["Real charts, not guesses", "Planet positions come from NASA JPL's DE421 ephemeris with the Lahiri ayanamsa, the Indian standard."],
  ["Free to date", "Making your kundli, liking, matching and chatting are free. Seeing who liked you is free."],
  ["Women set the pace", "Women can choose to message first. Anyone can go incognito, shown only to people they have liked."],
  ["Verified, real people", "Sign-up with your own mobile number and a selfie check. Likha never creates fake profiles."],
  ["Safety built in", "No phone numbers or links in first messages, date sharing with check-ins, one-tap SOS, and a team behind every report."],
  ["Golden Hours", "Good times to chat or plan a first date with a match, from the day's planetary hours, avoiding Rahu Kaal."],
  ["Cosmic Like and Cupid", "A like with a note to stand out, and suggested openers once you match."],
  ["Rishta Maasi", "Three hand-picked people every Sunday, checked by the Likha team (paid plan)."],
  ["Saathi", "A virtual companion to talk things through or warm up before a date. Always shown as a virtual companion, never a real person."],
  ["Readings and Guru Ji", "Detailed readings from your chart (paid), and Guru Ji, a shared astrology chat for a matched couple: a few free questions, then packs."],
  ["Couple Mode", "Free for a couple who both confirm: both leave Discover. Couple Mode Plus adds extras."],
];

export const PRINCIPLES = [
  "No caste. Likha doesn't ask for it or filter by it.",
  "Manglik status is shown, never used to hide anyone.",
  "No predictions of death, illness or divorce, and no paid remedies, pujas or gemstones.",
  "No guarantees: a good match is a good start, not a promise.",
  "Birth details are private and never shown to other members.",
];

export const PRICING =
  "Dating is free. Some extras (detailed readings, Boost, Cosmic Like, Rishta Maasi) use credits or a plan, " +
  "always priced in the app before you pay, in Indian rupees. New members get free credits as they set up their profile.";

export const cities = () => CITY_PAGES.map((c) => c.name);

export function organizationLd() {
  return {
    "@context": "https://schema.org", "@type": "Organization", "@id": `${SITE_URL}/#organization`,
    name: COMPANY.brand, legalName: COMPANY.legalName, url: SITE_URL, logo: `${SITE_URL}/icons/icon-512.png`,
    description: ONE_LINER, slogan: "Jo likha hai, woh milega.",
    founder: { "@type": "Person", name: COMPANY.founder, jobTitle: COMPANY.founderRole },
    foundingLocation: { "@type": "Place", name: `${COMPANY.city}, ${COMPANY.region}, India` },
    address: { "@type": "PostalAddress", addressLocality: COMPANY.city, addressRegion: COMPANY.region, addressCountry: COMPANY.country },
    areaServed: CITY_PAGES.map((c) => ({ "@type": "City", name: c.name })),
    knowsAbout: ["Kundli matching", "Guna Milan", "Ashtakoota", "Vedic astrology", "Online dating in India"],
  };
}

export function appLd() {
  return {
    "@context": "https://schema.org", "@type": "WebApplication", "@id": `${SITE_URL}/#app`,
    name: COMPANY.brand, url: SITE_URL, description: SUMMARY, applicationCategory: "LifestyleApplication",
    operatingSystem: "Android, iOS, Web (installable app)", inLanguage: "en-IN", isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR", description: "Dating is free; extras use credits." },
    publisher: { "@id": `${SITE_URL}/#organization` },
    featureList: FEATURES.map(([t]) => t),
  };
}
