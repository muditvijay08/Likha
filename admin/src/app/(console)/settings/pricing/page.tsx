"use client";
// I10 Pricing and credits. The whole catalog (packs, feature prices, plans, tiers) is edited as a draft and published
// together with one note. Every publish is a version you can restore. Real money only ever uses these database prices.
import { useEffect, useState } from "react";
import { useAction, useAdmin, when } from "@/components/shell";
import { SettingsForm } from "@/components/settings-form";
import { Page, rupees, useLoad } from "@/components/ui";
import { api, type Catalog } from "@/lib/api";

const num = (v: string) => (v === "" ? 0 : Number(v));

export default function PricingPage() {
  const { toast, me } = useAdmin();
  const { data, reload } = useLoad(() => api().pricing());
  const [draft, setDraft] = useState<Catalog | null>(null);
  const [note, setNote] = useState("");
  const act = useAction();
  useEffect(() => { if (data) setDraft({ packs: data.packs, prices: data.prices, plans: data.plans, tiers: data.tiers }); }, [data]);
  if (!data || !draft) return <div className="skel" style={{ height: 400 }} />;
  const can = data.can_edit;
  const base = JSON.stringify({ packs: data.packs, prices: data.prices, plans: data.plans, tiers: data.tiers });
  const dirty = JSON.stringify(draft) !== base;
  const set = <K extends keyof Catalog>(k: K, i: number, patch: Partial<Catalog[K][number]>) =>
    setDraft({ ...draft, [k]: draft[k].map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const publish = () => act.run(async () => { await api().savePricing(draft, note); setNote(""); toast("Prices published"); reload(); });

  return (
    <Page title="Pricing and credits" sub="1 credit = ₹1. Changes are a draft until you publish them with a note. Members see new prices at once; past purchases never change.">
      {!can && <div className="note">Read only. Changing prices needs “Change prices and settings”.</div>}

      <section className="card stack" aria-label="Credit packs">
        <h2>Credit packs</h2>
        <table className="t"><thead><tr><th>Pack</th><th>Price</th><th>Credits</th><th>Bonus</th><th>Per credit</th><th>On sale</th></tr></thead><tbody>
          {draft.packs.map((p, i) => (
            <tr key={p.id}>
              <td><input className="input" aria-label={`${p.id} label`} value={p.label} disabled={!can} onChange={(e) => set("packs", i, { label: e.target.value })} style={{ width: 140 }} /></td>
              <td><span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>₹<input className="input" type="number" min={1} aria-label={`${p.label} price`} value={p.price_paise / 100} disabled={!can}
                onChange={(e) => set("packs", i, { price_paise: Math.round(num(e.target.value) * 100) })} style={{ width: 90 }} /></span></td>
              <td><input className="input" type="number" min={1} aria-label={`${p.label} credits`} value={p.credits} disabled={!can} onChange={(e) => set("packs", i, { credits: num(e.target.value) })} style={{ width: 90 }} /></td>
              <td><span className="row" style={{ gap: 4, flexWrap: "nowrap" }}><input className="input" type="number" min={0} max={100} aria-label={`${p.label} bonus`} value={p.bonus_pct} disabled={!can}
                onChange={(e) => set("packs", i, { bonus_pct: num(e.target.value) })} style={{ width: 70 }} />%</span></td>
              <td className="small">{p.credits ? `₹${(p.price_paise / 100 / p.credits).toFixed(2)}` : "–"}</td>
              <td><input type="checkbox" aria-label={`${p.label} on sale`} checked={p.active} disabled={!can} onChange={(e) => set("packs", i, { active: e.target.checked })} /></td>
            </tr>))}
        </tbody></table>
        <span className="small">Prices include GST. The bonus is shown to members as “+10% extra”; it is already counted in Credits.</span>
      </section>

      <div className="split">
        <section className="card stack" aria-label="Feature prices">
          <h2>Feature prices (credits)</h2>
          <table className="t"><thead><tr><th>Feature</th><th>Credits</th><th>Tier discount</th><th>On</th></tr></thead><tbody>
            {draft.prices.map((p, i) => (
              <tr key={p.key}><td>{p.label}<div className="small mono">{p.key}</div></td>
                <td><input className="input" type="number" min={0} aria-label={`${p.label} credits`} value={p.credits} disabled={!can} onChange={(e) => set("prices", i, { credits: num(e.target.value) })} style={{ width: 80 }} /></td>
                <td><input type="checkbox" aria-label={`${p.label} tier discount`} checked={p.tier_discount} disabled={!can} onChange={(e) => set("prices", i, { tier_discount: e.target.checked })} /></td>
                <td><input type="checkbox" aria-label={`${p.label} on`} checked={p.active} disabled={!can} onChange={(e) => set("prices", i, { active: e.target.checked })} /></td></tr>))}
          </tbody></table>
        </section>
        <div className="stack" style={{ gap: 16 }}>
          <section className="card stack" aria-label="Plans">
            <h2>Plans</h2>
            {draft.plans.map((p, i) => (
              <div key={p.key} className="row" style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 8 }}>
                <input className="input grow" aria-label={`${p.key} name`} value={p.label} disabled={!can} onChange={(e) => set("plans", i, { label: e.target.value })} />
                <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>₹<input className="input" type="number" min={1} aria-label={`${p.label} price`} value={p.price_paise / 100} disabled={!can}
                  onChange={(e) => set("plans", i, { price_paise: Math.round(num(e.target.value) * 100) })} style={{ width: 80 }} />/{p.interval}</span>
                <input type="checkbox" aria-label={`${p.label} on sale`} checked={p.active} disabled={!can} onChange={(e) => set("plans", i, { active: e.target.checked })} />
                <input className="input" style={{ width: "100%" }} aria-label={`${p.label} note`} placeholder="Note shown under the price (optional)" value={p.trial_note ?? ""} disabled={!can}
                  onChange={(e) => set("plans", i, { trial_note: e.target.value || null })} />
              </div>))}
          </section>
          <section className="card stack" aria-label="Tiers">
            <h2>Tiers</h2>
            <table className="t"><thead><tr><th>Tier</th><th>Discount</th><th>Conversations</th><th>Kick streak</th></tr></thead><tbody>
              {draft.tiers.map((t, i) => (
                <tr key={t.key}><td>{t.label}</td>
                  <td><span className="row" style={{ gap: 4, flexWrap: "nowrap" }}><input className="input" type="number" min={0} max={50} aria-label={`${t.label} discount`} value={t.discount_pct}
                    disabled={!can || t.key === "none"} onChange={(e) => set("tiers", i, { discount_pct: num(e.target.value) })} style={{ width: 64 }} />%</span></td>
                  <td><input className="input" type="number" min={0} aria-label={`${t.label} conversations`} value={t.min_conversations} disabled={!can || t.key === "none"}
                    onChange={(e) => set("tiers", i, { min_conversations: num(e.target.value) })} style={{ width: 70 }} /></td>
                  <td><span className="row" style={{ gap: 4, flexWrap: "nowrap" }}><input className="input" type="number" min={0} aria-label={`${t.label} streak`} value={t.min_streak_days}
                    disabled={!can || t.key === "none"} onChange={(e) => set("tiers", i, { min_streak_days: num(e.target.value) })} style={{ width: 64 }} />days</span></td></tr>))}
            </tbody></table>
            <span className="small">Higher tiers can&apos;t get a smaller discount. Tara is given for a verified profile.</span>
          </section>
        </div>
      </div>

      {can && dirty && (
        <div className="card stack" style={{ position: "sticky", bottom: 12, gap: 8, background: "#FFFBF0", zIndex: 2 }} aria-label="Publish prices">
          <strong>Unpublished price changes</strong>
          <input className="input" aria-label="Price change note" placeholder="Why are you changing prices? (goes in the history)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="row"><button type="button" className="btn" disabled={act.busy || note.trim().length < 3} onClick={publish}>Publish prices</button>
            <button type="button" className="btn ghost" onClick={() => setDraft(JSON.parse(base))}>Discard</button></div>
          {act.error && <p className="err" role="alert">{act.error}</p>}
        </div>)}

      <div className="split">
        <SettingsForm title="Free credits" canEdit={me.perms.includes("settings.write")} onSaved={reload} fields={[
          { key: "welcome_bonus", path: "expiry_days", label: "Welcome bonus expires after", unit: "days", hint: "The bonus amount is set with the step credits on the Onboarding page." },
          { key: "invite_rewards", path: "inviter", label: "Invite reward · the inviter", unit: "credits" }, { key: "invite_rewards", path: "friend", label: "Invite reward · the friend", unit: "credits" },
          { key: "toolkit_reward", label: "Trying a new feature (toolkit) earns", unit: "credits" },
          { key: "couple_mode_discount_pct", label: "Couple Mode discount on readings", unit: "pct" },
          { key: "cosmic_likes_free_week", label: "Free Cosmic Likes a week", unit: "number" }]} />
        <section className="card stack" aria-label="Price history">
          <h2>Price history</h2>
          {data.history.length === 0 ? <span className="sub">No price changes yet.</span> : data.history.map((h, i) => (
            <div key={h.id} className="row" style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 8 }}>
              <span className="grow"><strong>v{h.id}</strong> · {when(h.at)}{h.by ? ` · ${h.by}` : ""}<div className="small">{h.note}</div></span>
              {can && i > 0 && <button type="button" className="btn ghost sm" disabled={act.busy}
                onClick={() => act.run(async () => { await api().restorePricing(h.id, "from history"); toast(`Restored v${h.id}`); reload(); })}>Restore</button>}
            </div>))}
          <span className="small">Starter pack today: {rupees(data.packs[0]?.price_paise ?? 0)} for {data.packs[0]?.credits} credits.</span>
        </section>
      </div>
    </Page>
  );
}
