// A social post's card, drawn on demand: /social-card/<post id>?t=<card token>&f=post (1080x1350) or f=tall (1080x1920).
// The words come from the post (approved in Admin > Social) through the social-worker function; without the post's own
// token nothing is drawn, so this can't be used to make arbitrary Likha-branded images.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Brand fonts (SIL Open Font License, files and licences in ./fonts), read once per server.
const FONT_DIR = join(process.cwd(), "src/app/social-card/fonts");
let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 600 | 700 | 800; style: "normal" }[]> | null = null;
const loadFonts = () => (fonts ??= Promise.all([
  ["Manrope", "manrope-latin-400-normal.woff", 400], ["Manrope", "manrope-latin-600-normal.woff", 600], ["Manrope", "manrope-latin-800-normal.woff", 800],
  ["Fraunces", "fraunces-latin-700-normal.woff", 700],
].map(async ([name, file, weight]) => ({ name: name as string, data: await readFile(join(FONT_DIR, file as string)), weight: weight as 400 | 600 | 700 | 800, style: "normal" as const }))));

type Card = { kind: string; post_date: string; card: Record<string, any> };

const INK = "#1E1838", SAFFRON = "#FFB020", ROSE = "#E0457B", NIGHT = "#1B1533", MUTED = "#6B6585";
const KIND_LABEL: Record<string, string> = {
  panchang: "AAJ KA PANCHANG", pair: "RASHI JODI", koota: "KUNDLI 101", feature: "LIKHA PE", myth: "MYTH VS FACT", golden: "GOLDEN HOURS", brand: "LIKHA DIARIES",
};

async function load(id: string, token: string): Promise<Card | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !anon || !/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{32}$/.test(token)) return null;
  const r = await fetch(`${base}/functions/v1/social-worker`, {
    method: "POST", cache: "no-store",
    headers: { "content-type": "application/json", apikey: anon, authorization: `Bearer ${anon}` },
    body: JSON.stringify({ action: "card", id, token }),
  }).catch(() => null);
  if (!r?.ok) return null;
  return (await r.json().catch(() => null)) as Card | null;
}

function Stars({ tall }: { tall: boolean }) {
  // only in the margins, never behind words
  const dots = [[330, 70, 4], [560, 40, 3], [700, 95, 5], [1030, 260, 3], [1045, 520, 4], [1040, tall ? 1500 : 1080, 3]];
  return <>{dots.map(([x, y, r], i) => <div key={i} style={{ position: "absolute", left: x, top: y, width: r * 2, height: r * 2, borderRadius: 99, background: i % 3 ? "#FFE7A8" : "#FFFFFF", opacity: 0.8 }} />)}</>;
}

function Facts({ facts }: { facts: [string, string][] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 44 }}>
      {facts.slice(0, 4).map(([k, v]) => (
        <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 30px", borderRadius: 26, background: "rgba(255,255,255,0.09)", border: "2px solid rgba(255,255,255,0.14)" }}>
          <div style={{ fontSize: 34, color: "#D9D3F0" }}>{k}</div>
          <div style={{ fontSize: 40, fontWeight: 800, color: "#FFFFFF" }}>{v}</div>
        </div>
      ))}
    </div>
  );
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = new URL(req.url);
  const tall = u.searchParams.get("f") === "tall";
  const data = await load(id, u.searchParams.get("t") ?? "");
  if (!data) return new Response("Not found", { status: 404 });
  const c = data.card ?? {};
  const facts: [string, string][] = Array.isArray(c.facts) ? c.facts.filter((f: unknown) => Array.isArray(f) && f.length === 2).map((f: string[]) => [String(f[0]), String(f[1])]) : [];
  const big = typeof c.big === "string" ? c.big : null;            // one big number or pair, e.g. "10/12"
  const width = 1080, height = tall ? 1920 : 1350;
  return new ImageResponse(
    <div style={{ width, height, display: "flex", flexDirection: "column", position: "relative", padding: tall ? "150px 80px 120px" : "90px 80px 80px",
      background: `linear-gradient(160deg, ${NIGHT} 0%, #2A1F55 55%, #4A2350 100%)`, color: "#FFFFFF", fontFamily: "Manrope" }}>
      <Stars tall={tall} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", fontSize: 54, fontWeight: 700, fontFamily: "Fraunces" }}><span>Likha</span><span style={{ color: SAFFRON }}>.</span></div>
        <div style={{ display: "flex", padding: "10px 22px", borderRadius: 99, background: SAFFRON, color: INK, fontSize: 24, fontWeight: 800, letterSpacing: 2 }}>{KIND_LABEL[data.kind] ?? "LIKHA"}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
        {c.kicker && <div style={{ fontSize: 32, color: SAFFRON, fontWeight: 800, marginBottom: 18 }}>{String(c.kicker)}</div>}
        <div style={{ fontSize: tall ? 96 : 86, fontWeight: 700, lineHeight: 1.05, fontFamily: "Fraunces" }}>{String(c.headline ?? "")}</div>
        {c.sub && <div style={{ fontSize: 38, lineHeight: 1.35, color: "#E4DEF7", marginTop: 26 }}>{String(c.sub)}</div>}
        {big && <div style={{ display: "flex", marginTop: 40, fontSize: 160, fontWeight: 700, color: SAFFRON, lineHeight: 1, fontFamily: "Fraunces" }}>{big}</div>}
        {facts.length > 0 && <Facts facts={facts} />}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 30, color: "#CFC8EA" }}>
        <div style={{ display: "flex" }}>{String(c.footer ?? "Kundli milao, dil milao.")}</div>
        <div style={{ display: "flex", color: "#FFFFFF", fontWeight: 800 }}>likha.in</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 10, display: "flex", background: `linear-gradient(90deg, ${SAFFRON}, ${ROSE})` }} />
      {c.note && <div style={{ position: "absolute", left: 80, bottom: 26, fontSize: 20, color: MUTED, display: "flex" }}>{String(c.note)}</div>}
    </div>,
    { width, height, fonts: await loadFonts(), headers: { "cache-control": "no-store" } },
  );
}
