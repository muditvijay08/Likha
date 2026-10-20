"use client";
// L10–L13 legal pages. Text comes from the approved copy on the design canvas (src/lib/legal.json).
import { useParams } from "next/navigation";
import { BackButton, Screen } from "@/components/ui";
import legal from "@/lib/legal.json";

type Block = [string, string];
const DOCS = legal as unknown as Record<string, Block[]>;

export default function LegalDoc() {
  const { doc } = useParams<{ doc: string }>();
  const blocks = DOCS[doc] ?? [["h1", "Not found"]];
  return (
    <Screen style={{ gap: 12 }}>
      <BackButton />
      <article className="stack" style={{ gap: 10, lineHeight: 1.55, fontSize: 14 }}>
        {blocks.map(([tag, text], i) => {
          if (tag === "h1") return <h1 key={i} className="h1">{text}</h1>;
          if (tag === "h2" || tag === "h3") return <h2 key={i} style={{ margin: "10px 0 0", fontSize: 17 }}>{text}</h2>;
          if (tag === "li") return <p key={i} style={{ margin: 0, paddingLeft: 14, textIndent: -10 }}>• {text}</p>;
          return <p key={i} style={{ margin: 0 }}>{text}</p>;
        })}
      </article>
    </Screen>
  );
}
