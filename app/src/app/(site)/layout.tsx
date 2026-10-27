// Public website: server-rendered pages with the site header and footer. The app's own screens are outside this group.
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site/chrome";
import "./site.css";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site">
      {/* Devanagari display face for the Hindi line; React hoists this into <head> */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tiro+Devanagari+Hindi&display=swap" precedence="default" />
      <a href="#content" className="sr">Skip to content</a>
      <SiteHeader />
      <main id="content">{children}</main>
      <SiteFooter />
    </div>
  );
}
