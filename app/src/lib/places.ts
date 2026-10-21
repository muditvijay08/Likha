// City search: Google Places (New) when a key is set, otherwise a built-in list (demo and offline).
import tzlookup from "tz-lookup";
import type { Place } from "./api/types";

const BUILT_IN: Place[] = [
  ["Jaipur", "Rajasthan", 26.9124, 75.7873], ["Jaipur", "Odisha", 20.8486, 86.3374], ["Udaipur", "Rajasthan", 24.5854, 73.7125],
  ["Jodhpur", "Rajasthan", 26.2389, 73.0243], ["Ajmer", "Rajasthan", 26.4499, 74.6399], ["Kota", "Rajasthan", 25.2138, 75.8648],
  ["Bikaner", "Rajasthan", 28.0229, 73.3119], ["Delhi", "Delhi", 28.6139, 77.209], ["Gurugram", "Haryana", 28.4595, 77.0266],
  ["Noida", "Uttar Pradesh", 28.5355, 77.391], ["Mumbai", "Maharashtra", 19.076, 72.8777], ["Pune", "Maharashtra", 18.5204, 73.8567],
  ["Ahmedabad", "Gujarat", 23.0225, 72.5714], ["Surat", "Gujarat", 21.1702, 72.8311], ["Indore", "Madhya Pradesh", 22.7196, 75.8577],
  ["Bhopal", "Madhya Pradesh", 23.2599, 77.4126], ["Lucknow", "Uttar Pradesh", 26.8467, 80.9462], ["Kanpur", "Uttar Pradesh", 26.4499, 80.3319],
  ["Varanasi", "Uttar Pradesh", 25.3176, 82.9739], ["Patna", "Bihar", 25.5941, 85.1376], ["Kolkata", "West Bengal", 22.5726, 88.3639],
  ["Bengaluru", "Karnataka", 12.9716, 77.5946], ["Chennai", "Tamil Nadu", 13.0827, 80.2707], ["Hyderabad", "Telangana", 17.385, 78.4867],
  ["Chandigarh", "Chandigarh", 30.7333, 76.7794], ["Ludhiana", "Punjab", 30.901, 75.8573], ["Amritsar", "Punjab", 31.634, 74.8723],
  ["Dehradun", "Uttarakhand", 30.3165, 78.0322], ["Nagpur", "Maharashtra", 21.1458, 79.0882], ["Raipur", "Chhattisgarh", 21.2514, 81.6296],
  ["Guwahati", "Assam", 26.1445, 91.7362], ["Bhubaneswar", "Odisha", 20.2961, 85.8245], ["Kochi", "Kerala", 9.9312, 76.2673],
].map(([name, state, lat, lng]) => ({ name: name as string, state: state as string, country: "IN", label: `${name}, ${state}, India`,
  lat: lat as number, lng: lng as number }))
  .concat([
    { name: "Dubai", state: undefined as unknown as string, country: "AE", label: "Dubai, United Arab Emirates", lat: 25.2048, lng: 55.2708 },
    { name: "New York", state: "New York", country: "US", label: "New York, NY, USA", lat: 40.7128, lng: -74.006 },
    { name: "London", state: "England", country: "GB", label: "London, UK", lat: 51.5072, lng: -0.1276 },
  ]);

declare global { interface Window { google?: any; __likhaMaps?: Promise<void> } }   // eslint-disable-line @typescript-eslint/no-explicit-any

function loadMaps(key: string): Promise<void> {
  if (window.__likhaMaps) return window.__likhaMaps;
  window.__likhaMaps = new Promise((ok, bad) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async&v=weekly`;
    s.async = true; s.onload = () => ok(); s.onerror = () => bad(new Error("Google Maps did not load"));
    document.head.appendChild(s);
  });
  return window.__likhaMaps;
}

/** The Maps browser key set in Admin > Keys (so it can change without a new build). Asked once per visit. */
let mapsKeyAsk: Promise<string | undefined> | null = null;
function mapsKey(): Promise<string | undefined> {
  if (typeof window === "undefined") return Promise.resolve(undefined);
  mapsKeyAsk ??= import("./api").then(({ api }) => api().settings()).then((s) => s.public_keys?.google_maps_browser_key).catch(() => undefined);
  return mapsKeyAsk;
}

export interface Suggestion { label: string; main: string; resolve(): Promise<Place> }

export async function searchPlaces(input: string): Promise<Suggestion[]> {
  const q = input.trim().toLowerCase();
  if (q.length < 2) return [];
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || await mapsKey();
  if (key && typeof window !== "undefined") {
    try {
      await loadMaps(key);
      const { AutocompleteSuggestion } = await window.google.maps.importLibrary("places");
      const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input, includedPrimaryTypes: ["(cities)"] });
      return suggestions.slice(0, 5).map((s: any) => {                       // eslint-disable-line @typescript-eslint/no-explicit-any
        const p = s.placePrediction;
        return {
          label: p.text.toString(), main: p.mainText?.toString() ?? p.text.toString(),
          async resolve(): Promise<Place> {
            const place = p.toPlace();
            await place.fetchFields({ fields: ["location", "addressComponents", "displayName", "formattedAddress"] });
            const comp = (t: string, short = false) => place.addressComponents?.find((c: any) => c.types.includes(t))?.[short ? "shortText" : "longText"]; // eslint-disable-line @typescript-eslint/no-explicit-any
            return { name: comp("locality") ?? place.displayName, state: comp("administrative_area_level_1"), country: comp("country", true) ?? "IN",
                     label: place.formattedAddress, place_id: place.id, lat: place.location.lat(), lng: place.location.lng() };
          },
        };
      });
    } catch { /* fall back to the built-in list */ }
  }
  return BUILT_IN.filter((p) => p.name.toLowerCase().startsWith(q) || p.label.toLowerCase().includes(q)).slice(0, 5)
    .map((p) => ({ label: p.label, main: p.name, resolve: async () => p }));
}

export function timezoneFor(lat: number, lng: number): string {
  try { return tzlookup(lat, lng); } catch { return "Asia/Kolkata"; }
}

/** Offset (minutes east of UTC) in force at that local date and time in that zone, e.g. 330 for IST, 390 for 1943 war time. */
export function offsetMinutes(tz: string, date: string, time: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (ms: number) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ms));
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    return (Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute")) - ms) / 60000;
  };
  const first = offsetAt(asUtc);
  return offsetAt(asUtc - first * 60000);
}

export async function placeFromGps(): Promise<Place | null> {
  const pos = await new Promise<GeolocationPosition>((ok, bad) => navigator.geolocation.getCurrentPosition(ok, bad, { timeout: 8000 }));
  const { latitude: lat, longitude: lng } = pos.coords;
  let best: Place | null = null; let bestD = Infinity;
  for (const p of BUILT_IN) {
    const dd = (p.lat - lat) ** 2 + (p.lng - lng) ** 2;
    if (dd < bestD) { bestD = dd; best = p; }
  }
  return bestD < 1 ? best : null;            // within ~100 km of a city we know
}
