import type { Metadata, Viewport } from "next";
import { RegisterSW } from "@/components/RegisterSW";
import { FlowProvider } from "@/lib/flow";
import "./globals.css";

export const metadata: Metadata = {
  title: "Likha · Jo likha hai, woh milega",
  description: "Real people, matched by your kundli. Dating is free.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Likha", statusBarStyle: "default" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = { themeColor: "#FBF8FF", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-gender="woman">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Manrope:wght@400;500;600;700&display=swap" />
      </head>
      <body><FlowProvider>{children}</FlowProvider><RegisterSW /></body>
    </html>
  );
}
