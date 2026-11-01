"use client";
// L10–L13 legal pages. Text comes from the approved copy on the design canvas (src/lib/legal.json).
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type PublicSettings } from "@/lib/api";
import { BackButton, Screen } from "@/components/ui";
import legal from "@/lib/legal.json";

type Block = [string, string];
const DOCS = legal as unknown as Record<string, Block[]>;

export default function LegalDoc() {
  const { doc } = useParams<{ doc: string }>();
  const [s, setS] = useState<PublicSettings | null>(null);
  useEffect(() => { api().settings().then(setS).catch(() => {}); }, []);
  // Company and Grievance Officer come from Admin > Settings > General and legal, so the pages never go stale.
  const c = s?.company, g = s?.grievance_officer;
  const fill = (t: string) => t
    .replace("{company}", c ? [c.legal_name, c.address].filter(Boolean).join(", ") : "Young Attitude Ventures Private Limited, Jaipur, Rajasthan")
    .replace("{grievance}", `Grievance Officer: ${g?.name ?? "Mudit Dudhoria"}, ${g?.email ?? "grievance@likha.in"}${g?.phone ? `, ${g.phone}` : ""}. We reply within ${g?.ack_hours ?? 24} hours and resolve within ${g?.resolve_days ?? 15} days.`);
  const blocks = (DOCS[doc] ?? [["h1", "Not found"]]).map(([t, x]) => [t, fill(x)] as Block);
  return (
    <Screen style={{ gap: 12 }}>
      <BackButton />
      <article className="stack" style={{ gap: 10, lineHeight: 1.55, fontSize: 14 }}>
        {blocks.map(([tag, text], i) => {
          if (tag === "h1") return <h1 key={i} className="h1">{text}</h1>;
          if (tag === "h2" || tag === "h3") return <h2 key={i} style={{ margin: "10px 0 0", fontSize: 17 }}>{text}</h2>;
          if (tag === "li") return <p key={i} style={{ margin: 0, paddingLeft: 14, textIndent: -10 }}>• {text}</p>;
          if (tag === "strong") return <p key={i} style={{ margin: "8px 0 0", fontWeight: 700 }}>{text}</p>;
          return <p key={i} style={{ margin: 0 }}>{text}</p>;
        })}
      </article>
    </Screen>
  );
}
