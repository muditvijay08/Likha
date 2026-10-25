// Public website: server-rendered pages with the site header and footer. The app's own screens are outside this group.
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site/chrome";
import "./site.css";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site">
      <a href="#content" className="sr">Skip to content</a>
      <SiteHeader />
      <main id="content">{children}</main>
      <SiteFooter />
    </div>
  );
}
