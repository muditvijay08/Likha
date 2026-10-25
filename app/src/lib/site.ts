// Public website: address, cities with their own page, and shared copy.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://likha.in").replace(/\/$/, "");
export const SITE_NAME = "Likha";
export const TAGLINE = "Swipe less. Match written in the stars.";

/** Cities with a page at /dating/<slug>. Mirrors the cities the database starts with (locked cities have no page). */
export const CITY_PAGES = [
  { slug: "jaipur", name: "Jaipur", region: "Rajasthan", country: "India", spots: ["Bapu Bazaar", "C-Scheme cafés", "Amer at sunset", "Jawahar Kala Kendra"],
    blurb: "Likha started in Jaipur, the Pink City, where kundli matching is a familiar part of family conversations about marriage." },
  { slug: "pune", name: "Pune", region: "Maharashtra", country: "India", spots: ["Koregaon Park", "FC Road", "Sinhagad trek", "Aundh cafés"],
    blurb: "Students, IT professionals and old Pune families: a city that mixes the modern with tradition." },
  { slug: "ahmedabad", name: "Ahmedabad", region: "Gujarat", country: "India", spots: ["Sabarmati Riverfront", "Law Garden", "Manek Chowk", "Sindhu Bhavan Road"],
    blurb: "A city where family, food and festivals come first, and where compatibility has always been asked about." },
  { slug: "dubai", name: "Dubai", region: "UAE", country: "United Arab Emirates", spots: ["JBR Walk", "Al Seef", "Dubai Marina", "Alserkal Avenue"],
    blurb: "For the Indian community in Dubai who want a partner who shares their roots, and their stars." },
] as const;

export const GUIDES = [
  { href: "/kundli-matching", title: "Kundli matching explained", sub: "The 36 Gunas and 8 kootas, in plain words" },
  { href: "/manglik-dosha", title: "Manglik dosha", sub: "What it is, and why we never filter by it" },
  { href: "/moon-sign-calculator", title: "Find your Moon sign", sub: "Your rashi from your date of birth" },
  { href: "/compatibility", title: "Rashi compatibility", sub: "All 78 Moon-sign pairs" },
] as const;
