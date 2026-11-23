import type { Metadata, Viewport } from "next";
import { RegisterSW } from "@/components/RegisterSW";
import { MaintenanceGate } from "@/components/gates";
import { FlowProvider } from "@/lib/flow";
import { SITE_URL } from "@/lib/site";
import "./kit.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Likha · Jo likha hai, woh milega",
  description: "Real people, matched by your kundli. Dating is free.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Likha", statusBarStyle: "default" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#FFFFFF", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" data-gender="woman">
      <head>
      </head>
      <body><FlowProvider><MaintenanceGate>{children}</MaintenanceGate></FlowProvider><RegisterSW /></body>
    </html>
  );
}
