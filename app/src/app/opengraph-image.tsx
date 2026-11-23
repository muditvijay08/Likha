import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Shared preview image for links to likha.in (WhatsApp, Instagram, search results). Nov 2026 look: white, near-black,
// one electric orange, Anton headline, Fraunces wordmark. Fonts are the OFL files in social-card/fonts.
export const alt = "Likha: swipe less, match written in the stars";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";

const FONT_DIR = join(process.cwd(), "src/app/social-card/fonts");

export default async function OgImage() {
  const [anton, inter, fraunces] = await Promise.all(["anton-latin-400-normal.woff", "inter-latin-600-normal.woff", "fraunces-latin-700-normal.woff"]
    .map((f) => readFile(join(FONT_DIR, f))));
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "70px 80px",
      background: "#FFFFFF", color: "#111111", fontFamily: "Inter", borderBottom: "14px solid #FF5A1F" }}>
      <div style={{ fontSize: 60, fontFamily: "Fraunces", display: "flex" }}>Likha<span style={{ color: "#FF5A1F" }}>.</span></div>
      <div style={{ fontSize: 96, fontFamily: "Anton", lineHeight: 1, marginTop: 28, maxWidth: 1000, textTransform: "uppercase", display: "flex", flexDirection: "column" }}>
        <span>Swipe less.</span><span>Jo likha hai, woh milega.</span></div>
      <div style={{ fontSize: 32, marginTop: 28, color: "#706C67" }}>Real people, matched by your kundli. Dating is free.</div>
    </div>,
    { ...size, fonts: [{ name: "Anton", data: anton, weight: 400, style: "normal" }, { name: "Inter", data: inter, weight: 600, style: "normal" },
                       { name: "Fraunces", data: fraunces, weight: 700, style: "normal" }] },
  );
}
