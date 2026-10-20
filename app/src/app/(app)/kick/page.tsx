"use client";
// H2 Daily Kick. Scores and times are computed; the words around them are written overnight. Paid part unlocks with credits or Kick Pass.
import { useState } from "react";
import { BackButton, ErrorNote, Primary, useAction } from "@/components/ui";
import { LockIcon, price, useApp } from "@/components/app";
import { api, type Kick } from "@/lib/api";

const ICONS = [
  <span key="c" style={{ width: 22, height: 22, flex: "none", borderRadius: 6, background: "#FFD43B", border: "1px solid #E0B400" }} />,
  <svg key="m" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A4300" strokeWidth="2" aria-hidden="true" style={{ flex: "none" }}><path d="M12 3c4 4 4 14 0 18M12 3c-4 4-4 14 0 18M3 12h18" /></svg>,
  <svg key="k" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A4300" strokeWidth="2" aria-hidden="true" style={{ flex: "none" }}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>,
];

const Tile = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 16, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
    <span style={{ fontSize: 11, color: "var(--muted)" }}>{label}</span>{children}
  </div>
);

export default function DailyKick() {
  const { home, prices, reload, toast } = useApp();
  const [opened, setOpened] = useState<Kick | null>(null);
  const { busy, error, run } = useAction();
  const k = opened ?? home?.kick ?? null;
  const city = home?.city;
  const date = city ? new Intl.DateTimeFormat("en-IN", { timeZone: city.timezone, weekday: "long", day: "numeric", month: "long" }).format(new Date()) : "";
  const cost = price(prices, "daily_kick", home?.kick_price ?? 10);

  const unlock = () => run(async () => { setOpened(await api().unlockKick()); await reload(); });
  const share = async () => {
    if (!k) return;
    const text = `My love weather today: ${k.teaser.vibe}/10. "${k.teaser.love_weather}" · Likha, jo likha hai, woh milega`;
    try { if (navigator.share) await navigator.share({ text, url: location.origin }); else { await navigator.clipboard.writeText(text); toast("Copied. Paste it anywhere."); } } catch { /* cancelled */ }
  };

  const c = k?.content;
  return (
    <div className="app-body pad">
      <div className="titlebar">
        <BackButton href="/home" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 24, fontWeight: 600 }}>Your Daily Kick</h1>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{date}{city ? ` · ${city.name}` : ""}</span>
        </div>
        {home?.kick_pass && <span className="badge-soft">Kick Pass</span>}
      </div>

      {!home ? <div className="skel" style={{ height: 300 }} /> : !k ? (
        <div className="empty card"><strong>Today&apos;s Kick is still being written</strong><span className="sub">It arrives early every morning. Check back in a little while.</span></div>
      ) : <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          <Tile label="Vibe"><span className="serif" style={{ fontSize: 24, fontWeight: 600 }}>{k.teaser.vibe}<span style={{ fontSize: 13, color: "var(--muted)" }}>/10</span></span></Tile>
          <Tile label="Date score"><span className="serif" style={{ fontSize: 24, fontWeight: 600, color: "#D6336C" }}>{k.teaser.date_score}<span style={{ fontSize: 13, color: "var(--muted)" }}>/10</span></span></Tile>
          <Tile label="Lucky window"><span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{k.teaser.lucky_window ?? "Tonight"}</span></Tile>
        </div>

        <div className="lockbox">
          <div className="stack" style={{ gap: 12 }} aria-hidden={!c || undefined}>
            <section aria-label="Today's fix" style={{ background: "var(--saffron-soft)", borderRadius: 20, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              <strong style={{ fontSize: 15 }}>Today&apos;s fix</strong>
              {(c?.fix ?? ["A colour for today.", "A short mantra.", "One kind thing to do."]).map((f, i) => (
                <div key={i} className="row" style={{ gap: 10, fontSize: 13 }}>{ICONS[i]}{f}</div>
              ))}
            </section>
            <section aria-label="Best times today" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 20, padding: "6px 16px", display: "flex", flexDirection: "column" }}>
              {(c?.time_windows ?? [{ label: "Office and meetings", time: "–" }, { label: "Travel", time: "–" }, { label: "Date or chat", time: "–" }, { label: "Avoid big money moves (Rahu Kaal)", time: "–" }]).map((w, i, all) => (
                <div key={w.label} className="row" style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: i < all.length - 1 ? "1px solid var(--line-soft)" : 0, fontSize: 13 }}>
                  <span>{w.label}</span><strong style={{ color: w.label.startsWith("Date") ? "#D6336C" : w.label.includes("Rahu") ? "var(--muted)" : undefined }}>{w.time}</strong>
                </div>
              ))}
            </section>
            <div style={{ background: "var(--rose-soft)", border: "1px solid #FFC6D4", borderRadius: 20, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
              <strong style={{ fontSize: 14 }}>Good day for a first date?</strong>
              <span style={{ fontSize: 13, color: "#8A3A55" }}>{c?.first_date_answer ?? "Your answer for today."}</span>
              {c?.today_moon && <span className="small">Today&apos;s Moon: {c.today_moon}{c.tara ? ` · your Tara: ${c.tara}` : ""}</span>}
            </div>
          </div>
          {!c && (
            <div className="veil">
              <LockIcon color="#8A4300" />
              <strong>Today&apos;s fix, best times and date answer</strong>
              <div style={{ width: "100%", maxWidth: 280 }}>
                <Primary onClick={unlock} busy={busy}>{home.kick_pass ? "Open with Kick Pass" : `Unlock today · ${cost} credits`}</Primary>
              </div>
              <ErrorNote error={error} />
            </div>
          )}
        </div>
        <div className="grow" />
        <button type="button" className="btn ghost" onClick={share}>Share today&apos;s card</button>
        <span className="small" style={{ textAlign: "center" }}>Astrology shows tendencies, not fate. Enjoy it lightly.</span>
      </>}
    </div>
  );
}
