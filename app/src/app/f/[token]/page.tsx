"use client";
// F2 Family page, opened from a WhatsApp link without signing in. Read-only: profile basics, kundli summary and, for a
// match, the koota report. Never photos, birth details or chats. Ends after 7 days or when either person stops it.
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Screen } from "@/components/ui";
import { api, type FamilyPage } from "@/lib/api";

const KOOTAS: [string, string, number][] = [["varna", "Varna", 1], ["vashya", "Vashya", 2], ["tara", "Tara", 3], ["yoni", "Yoni", 4],
  ["graha_maitri", "Graha Maitri", 5], ["gana", "Gana", 6], ["bhakoot", "Bhakoot", 7], ["nadi", "Nadi", 8]];
const MARITAL: Record<string, string> = { never_married: "Never married", divorced: "Divorced", separated: "Separated", widowed: "Widowed" };
const TIMELINE: Record<string, string> = { within_1y: "Hoping to marry within a year", "1_2y": "Hoping to marry in 1–2 years", not_sure: "Will marry when it feels right" };
const DIET: Record<string, string> = { vegetarian: "Vegetarian", jain: "Jain", eggetarian: "Eggetarian", non_veg: "Non-vegetarian", vegan: "Vegan" };
const pts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function FamilyView() {
  const { token } = useParams<{ token: string }>();
  const [v, setV] = useState<FamilyPage | null | undefined>(undefined);
  useEffect(() => { api().familyView(token).then(setV).catch(() => setV(null)); }, [token]);
  if (v === undefined) return <Screen><div className="skel" style={{ height: 320 }} /></Screen>;
  if (!v) return (
    <Screen style={{ gap: 14 }}>
      <div className="wordmark">Likha<span>.</span></div>
      <h1 className="h1">This family page has ended</h1>
      <p className="sub">Family pages work for 7 days, and either person can stop one sooner. Ask for a new link.</p>
    </Screen>
  );
  const p = v.person, m = v.match;
  const facts = [p.age ? `${p.age} years` : null, p.city, p.hometown && p.hometown !== p.city ? `from ${p.hometown}` : null,
    p.height_cm ? `${Math.floor(p.height_cm / 30.48)}′${Math.round((p.height_cm / 2.54) % 12)}″` : null].filter(Boolean).join(" · ");
  const life = [p.profession, p.education, p.marital_status ? MARITAL[p.marital_status] : null, p.marriage_timeline ? TIMELINE[p.marriage_timeline] : null,
    p.diet ? DIET[p.diet] : null, p.languages?.length ? p.languages.join(", ") : null].filter(Boolean) as string[];
  const doshaLines = m ? (["nadi", "bhakoot", "gana"] as const).flatMap((k) => {
    const d = m.doshas?.[k]; if (!d?.present) return [];
    return [`${k[0].toUpperCase() + k.slice(1)} dosha: present${d.cancelled ? `, cancelled because ${d.reason}` : ""}.`];
  }) : [];
  return (
    <Screen style={{ gap: 18 }}>
      <div className="wordmark">Likha<span>.</span></div>
      <span style={{ font: "700 12px var(--sans)", letterSpacing: ".12em", color: "var(--saffron-ink)" }}>FOR THE FAMILY · SHARED BY {v.shared_by.toUpperCase()}</span>
      <div className="stack" style={{ gap: 4 }}>
        <h1 className="h1" style={{ margin: 0 }}>{p.first_name}</h1>
        {facts && <span className="sub" style={{ margin: 0 }}>{facts}</span>}
        {p.verified && <span style={{ fontSize: 13, fontWeight: 700, color: "#1F5E49" }}>Selfie-verified on Likha</span>}
      </div>
      {life.length > 0 && <ul className="stack" style={{ gap: 6, margin: 0, paddingLeft: 18, fontSize: 15 }}>{life.map((x) => <li key={x}>{x}</li>)}</ul>}

      <section aria-label="Kundli" className="stack" style={{ gap: 8, padding: 16, borderRadius: 18, background: "var(--saffron-faint)", border: "1px solid var(--line)" }}>
        <strong style={{ fontSize: 16 }}>Kundli</strong>
        <span style={{ fontSize: 15 }}>Moon sign {p.moon_sign ?? "–"} · Nakshatra {p.nakshatra ?? "–"} · {p.manglik ? "Manglik" : "Not Manglik"}</span>
        {p.time_approx && <span className="small">Worked out from an approximate birth time.</span>}
      </section>

      {m && (
        <section aria-label="Kundli match" className="stack" style={{ gap: 10, padding: 16, borderRadius: 18, background: "var(--card, #fff)", border: "1px solid var(--line)" }}>
          <div className="row" style={{ gap: 12, alignItems: "baseline" }}>
            <strong className="serif" style={{ fontSize: 34, lineHeight: 1 }}>{pts(m.gunas)}<span style={{ fontSize: 16, color: "var(--muted)" }}> / 36 Gunas</span></strong>
          </div>
          <span style={{ fontSize: 14 }}>Ashtakoota Guna Milan between {v.shared_by} and {p.first_name}. 18 or more is traditionally acceptable, 25 or more good.</span>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <tbody>{KOOTAS.map(([k, label, max]) => (
              <tr key={k} style={{ borderTop: "1px solid var(--line)" }}>
                <td style={{ padding: "7px 0" }}>{label}</td>
                <td style={{ padding: "7px 0", textAlign: "right", fontVariantNumeric: "tabular-nums" }}><strong>{pts(Number(m.kootas?.[k] ?? 0))}</strong> / {max}</td>
              </tr>
            ))}</tbody>
          </table>
          {doshaLines.map((d) => <span key={d} style={{ fontSize: 14 }}>{d}</span>)}
          <span className="small">Likha&apos;s Jodi Score for this pair: {m.jodi_score} / 100 (mostly the Gunas, plus Manglik fit and Moon–Venus harmony).</span>
        </section>
      )}

      {p.prompts.length > 0 && (
        <section aria-label="In their words" className="stack" style={{ gap: 10 }}>
          {p.prompts.map((q) => (
            <div key={q.label} className="stack" style={{ gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>{q.label}</span>
              <span style={{ fontSize: 15 }}>{q.answer}</span>
            </div>
          ))}
        </section>
      )}

      <section aria-label="What next" className="stack" style={{ gap: 8, padding: 16, borderRadius: 18, background: "var(--card, #fff)", border: "1px solid var(--line)" }}>
        <strong style={{ fontSize: 16 }}>What happens next</strong>
        <span style={{ fontSize: 15 }}>If the family likes what you see, tell {v.shared_by} directly. Likha never contacts {p.first_name}&apos;s family for you, and nobody here can message {p.first_name}.</span>
        <span style={{ fontSize: 15 }}>Want to see your own child&apos;s kundli first? It&apos;s free on Likha: Moon sign, nakshatra and the full chart from the birth date, time and place.</span>
        <a href="/" className="btn" style={{ marginTop: 4 }}>How Likha works</a>
      </section>

      <p className="small" style={{ margin: 0 }}>
        Read-only page from Likha (likha.in), shared with {p.first_name}&apos;s agreement. It ends on {new Date(v.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}.
        Guidance, not a guarantee: kundli matching is one input among many. Likha never asks for or uses caste.
      </p>
    </Screen>
  );
}
