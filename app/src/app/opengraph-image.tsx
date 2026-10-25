import { ImageResponse } from "next/og";

// Shared preview image for links to likha.in (WhatsApp, Instagram, search results).
export const alt = "Likha: swipe less, match written in the stars";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80,
      background: "linear-gradient(135deg, #FBF8FF 0%, #FFF3D6 60%, #FFE4EC 100%)", color: "#1E1838", fontFamily: "serif" }}>
      <div style={{ fontSize: 64, fontWeight: 700, display: "flex" }}>Likha<span style={{ color: "#D9650B" }}>.</span></div>
      <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, marginTop: 30, maxWidth: 900 }}>Swipe less. Match written in the stars.</div>
      <div style={{ fontSize: 34, marginTop: 30, color: "#5E5780", fontFamily: "sans-serif" }}>Real people, matched by your kundli. Dating is free.</div>
    </div>,
    size,
  );
}
