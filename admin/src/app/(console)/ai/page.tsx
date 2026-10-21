"use client";
// AI models: pick the picture model for Imagine Us (with a Test that makes one labelled picture), route each text
// feature to a model, and keep the model list and prices up to date. Every change is logged.
import { useCallback, useEffect, useState } from "react";
import { useAction, useAdmin, when } from "@/components/shell";
import { api, type Ai, type Feature, type Model } from "@/lib/api";

const PROVIDER: Record<string, string> = { anthropic: "Anthropic", gemini: "Google", openai: "OpenAI", fal: "fal.ai" };
const KEYNAME: Record<string, string> = { anthropic: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY", openai: "OPENAI_API_KEY", fal: "FAL_KEY" };
const PICTURES_PER_READING = 2;
const READING_PRICE = 49;                                                  // Imagine Us price in credits (₹1 each), price_list.imagine_us
const inr = (usd: number, rate: number) => `₹${(usd * rate).toFixed(2)}`;

function ImageCard({ m, ai, feature, reload }: { m: Model; ai: Ai; feature: Feature; reload(): void }) {
  const { toast } = useAdmin();
  const [preview, setPreview] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const { busy, error, run } = useAction();
  const inUse = feature.model === m.model, fallback = feature.fallback === m.model;
  const perReading = (m.per_image ?? 0) * ai.usd_inr * PICTURES_PER_READING;
  const use = () => run(async () => { await api().setFeatureModel("imagine", m.model, feature.fallback === m.model ? null : feature.fallback); setConfirm(false); toast(`Imagine Us now uses ${m.label}`); reload(); });
  return (
    <article className="card stack" style={{ gap: 8, opacity: m.active ? 1 : 0.6, borderColor: inUse ? "var(--violet)" : undefined, boxShadow: inUse ? "0 0 0 2px var(--violet-soft)" : undefined }}
      aria-label={m.label} data-model={m.model}>
      <div className="row" style={{ gap: 6 }}>
        <span className="pill off">{PROVIDER[m.provider]}</span>
        {inUse && <span className="pill info">In use</span>}{fallback && <span className="pill warn">Fallback</span>}
        {!m.active && <span className="pill off">Off</span>}
      </div>
      <strong style={{ fontSize: 15 }}>{m.label}</strong>
      <span className="small mono" style={{ wordBreak: "break-all" }}>{m.model}</span>
      <div className="row" style={{ gap: 14 }}>
        <span><strong>{inr(m.per_image ?? 0, ai.usd_inr)}</strong> <span className="small">a picture</span></span>
        <span><strong>₹{perReading.toFixed(0)}</strong> <span className="small">a reading ({PICTURES_PER_READING}) of ₹{READING_PRICE}</span></span>
      </div>
      {m.note && <span className="small">{m.note}</span>}
      {!m.key_set && <span className="pill warn" style={{ alignSelf: "flex-start" }}>{KEYNAME[m.provider]} not set in Keys</span>}
      {m.verified_at ? <span className="pill ok" style={{ alignSelf: "flex-start" }}>✓ Tested {when(m.verified_at)}</span>
        : m.test_note ? <span className="pill bad" style={{ alignSelf: "flex-start" }}>✗ {m.test_note}</span> : <span className="small">Not tested yet</span>}
      {preview && <figure style={{ margin: 0 }}><img src={preview} alt={`Test picture from ${m.label}`} style={{ width: "100%", borderRadius: 12, display: "block" }} />
        <figcaption className="small">Test picture made from two plain stand-in portraits, never a member&apos;s photo.</figcaption></figure>}
      <div className="grow" />
      {confirm ? (
        <div className="stack" style={{ gap: 6 }}><span className="small">Not tested yet. Members could get errors (they&apos;re refunded). Use it anyway?</span>
          <div className="row"><button type="button" className="btn sm" disabled={busy} onClick={use}>Use anyway</button><button type="button" className="btn ghost sm" onClick={() => setConfirm(false)}>Cancel</button></div></div>
      ) : (
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn ghost sm" disabled={busy} onClick={() => run(async () => {
            const r = await api().testModel(m.model); if (r.preview) setPreview(r.preview); toast(r.ok ? `Works: ${r.note}` : `Failed: ${r.note}`); reload(); })}>{busy ? "Working…" : "Test"}</button>
          {ai.can_edit && m.active && !inUse && <button type="button" className="btn sm" disabled={busy} onClick={() => m.verified_at ? use() : setConfirm(true)}>Use for Imagine Us</button>}
          {ai.can_edit && m.active && !inUse && !fallback && <button type="button" className="btn ghost sm" disabled={busy}
            onClick={() => run(async () => { await api().setFeatureModel("imagine", feature.model, m.model); toast(`${m.label} is the fallback`); reload(); })}>Make fallback</button>}
        </div>
      )}
      {error && <p className="err" role="alert">{error}</p>}
    </article>
  );
}

function FeatureRow({ f, ai, reload }: { f: Feature; ai: Ai; reload(): void }) {
  const { toast } = useAdmin();
  const [model, setModel] = useState(f.model); const [fb, setFb] = useState(f.fallback ?? "");
  const { busy, error, run } = useAction();
  const options = ai.models.filter((m) => m.kind === f.kind && (m.active || m.model === f.model || m.model === f.fallback));
  const changed = model !== f.model || fb !== (f.fallback ?? "");
  return (
    <tr>
      <td><strong>{f.label}</strong><div className="small mono">{f.key} · {f.kind}{f.paid ? " · paid" : ""}</div></td>
      <td><select className="input" aria-label={`Model for ${f.label}`} value={model} disabled={!ai.can_edit} onChange={(e) => setModel(e.target.value)}>
        {options.map((m) => <option key={m.model} value={m.model} disabled={!m.active}>{m.label}{m.active ? "" : " (off)"}</option>)}</select></td>
      <td><select className="input" aria-label={`Fallback for ${f.label}`} value={fb} disabled={!ai.can_edit} onChange={(e) => setFb(e.target.value)}>
        <option value="">None</option>{options.filter((m) => m.model !== model && m.active).map((m) => <option key={m.model} value={m.model}>{m.label}</option>)}</select></td>
      <td className="small">₹{(f.spent_7d_paise / 100).toFixed(0)}</td>
      <td>{ai.can_edit && <button type="button" className="btn sm" disabled={!changed || busy}
        onClick={() => run(async () => { await api().setFeatureModel(f.key, model, fb || null); toast(`${f.label} updated`); reload(); })}>Save</button>}
        {error && <p className="err" role="alert">{error}</p>}</td>
    </tr>
  );
}

type Draft = Pick<Model, "model" | "provider" | "kind" | "label" | "input" | "output" | "per_image" | "note" | "active">;
const blank: Draft = { model: "", provider: "fal", kind: "image", label: "", input: 0, output: 0, per_image: null, note: "", active: true };

function ModelForm({ start, onDone }: { start: Draft; onDone(saved: boolean): void }) {
  const [d, setD] = useState<Draft>(start);
  const { busy, error, run } = useAction();
  const isNew = !start.model;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });
  return (
    <form className="card stack" style={{ gap: 12 }} aria-label={isNew ? "Add a model" : `Edit ${start.label}`}
      onSubmit={(e) => { e.preventDefault(); run(async () => { await api().saveModel(d); onDone(true); }); }}>
      <h2>{isNew ? "Add a model" : `Edit ${start.label}`}</h2>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        <label className="f">Provider<select className="input" value={d.provider} onChange={(e) => set("provider", e.target.value as Draft["provider"])}>
          {Object.entries(PROVIDER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="f">Kind<select className="input" value={d.kind} onChange={(e) => set("kind", e.target.value as Draft["kind"])}>
          <option value="text">Text</option><option value="image" disabled={d.provider === "anthropic"}>Pictures</option></select></label>
        <label className="f">Exact model id{d.provider === "fal" ? " (fal endpoint)" : ""}<input className="input mono" value={d.model} readOnly={!isNew} onChange={(e) => set("model", e.target.value)} placeholder={d.provider === "fal" ? "fal-ai/flux-2-max/edit" : "model-id"} /></label>
        <label className="f">Name shown here<input className="input" value={d.label} onChange={(e) => set("label", e.target.value)} /></label>
        {d.kind === "image" ? <label className="f">US$ per picture<input className="input" type="number" step="0.0001" min="0" value={d.per_image ?? ""} onChange={(e) => set("per_image", e.target.value === "" ? null : Number(e.target.value))} /></label> : <>
          <label className="f">US$ per million input tokens<input className="input" type="number" step="0.01" min="0" value={d.input} onChange={(e) => set("input", Number(e.target.value))} /></label>
          <label className="f">US$ per million output tokens<input className="input" type="number" step="0.01" min="0" value={d.output} onChange={(e) => set("output", Number(e.target.value))} /></label></>}
        <label className="f" style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 18 }}><input type="checkbox" checked={d.active} onChange={(e) => set("active", e.target.checked)} />Available to pick</label>
      </div>
      <label className="f">Note for the team<input className="input" value={d.note ?? ""} onChange={(e) => set("note", e.target.value)} placeholder="Where the price came from, limits, anything odd" /></label>
      {error && <p className="err" role="alert">{error}</p>}
      <div className="row"><button className="btn" disabled={busy || !d.model.trim() || !d.label.trim()}>Save model</button><button type="button" className="btn ghost" onClick={() => onDone(false)}>Cancel</button>
        <span className="small">Copy the id and price from the provider&apos;s own page, then press Test before using it.</span></div>
    </form>
  );
}

export default function AiPage() {
  const { toast } = useAdmin();
  const [ai, setAi] = useState<Ai | null>(null);
  const [tab, setTab] = useState<"pictures" | "features" | "models">("pictures");
  const [form, setForm] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { api().ai().then(setAi).catch((e: Error) => setErr(e.message)); }, []);
  useEffect(() => { load(); }, [load]);
  if (err) return <div className="note warn">{err}</div>;
  if (!ai) return <div className="skel" style={{ height: 400 }} />;
  const imagine = ai.features.find((f) => f.key === "imagine")!;
  const images = ai.models.filter((m) => m.kind === "image").sort((a, b) => Number(b.model === imagine.model) - Number(a.model === imagine.model) || Number(b.active) - Number(a.active));
  return (
    <>
      <div className="stack" style={{ gap: 4 }}><h1>AI models</h1>
        <p className="sub">Which model writes or paints each feature, and what it costs. Members never see model names; every picture is marked &quot;Imagined, not a real photo&quot;.</p></div>
      <div className="tabs" role="tablist">
        {([["pictures", "Imagine Us pictures"], ["features", "Text features"], ["models", "All models"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>))}
      </div>
      {tab === "pictures" && <>
        <div className="note">Imagine Us makes {PICTURES_PER_READING} pictures per reading from both members&apos; main photos (both said yes). The fallback is used when the day&apos;s AI budget runs low.</div>
        <div className="grid">{images.map((m) => <ImageCard key={m.model} m={m} ai={ai} feature={imagine} reload={load} />)}</div>
        {ai.can_edit && <button type="button" className="btn ghost" style={{ alignSelf: "flex-start" }} onClick={() => { setForm({ ...blank }); setTab("models"); }}>Add another picture model</button>}
      </>}
      {tab === "features" && (
        <div className="card flush"><table className="t">
          <thead><tr><th>Feature</th><th>Model</th><th>Fallback</th><th>7 days</th><th /></tr></thead>
          <tbody>{ai.features.filter((f) => f.kind === "text").map((f) => <FeatureRow key={f.key} f={f} ai={ai} reload={load} />)}</tbody></table></div>
      )}
      {tab === "models" && <>
        {form ? <ModelForm start={form} onDone={(saved) => { setForm(null); if (saved) { toast("Model saved"); load(); } }} />
          : ai.can_edit && <button type="button" className="btn" style={{ alignSelf: "flex-start" }} onClick={() => setForm({ ...blank })}>Add a model</button>}
        <div className="card flush"><table className="t">
          <thead><tr><th>Model</th><th>Kind</th><th>Price</th><th>Status</th><th /></tr></thead>
          <tbody>{ai.models.map((m) => (
            <tr key={m.model}>
              <td><strong>{m.label}</strong><div className="small mono">{PROVIDER[m.provider]} · {m.model}</div></td>
              <td>{m.kind === "image" ? "Pictures" : "Text"}</td>
              <td className="small">{m.kind === "image" ? `$${m.per_image} a picture (${inr(m.per_image ?? 0, ai.usd_inr)})` : `$${m.input} in / $${m.output} out per M tokens`}</td>
              <td><div className="row" style={{ gap: 4 }}>{m.active ? <span className="pill ok">On</span> : <span className="pill off">Off</span>}
                {m.used_by.length > 0 && <span className="pill info">{m.used_by.join(", ")}</span>}{m.verified_at && <span className="pill ok">Tested</span>}</div></td>
              <td>{ai.can_edit && <button type="button" className="btn ghost sm" onClick={() => setForm({ model: m.model, provider: m.provider, kind: m.kind, label: m.label, input: m.input, output: m.output, per_image: m.per_image, note: m.note, active: m.active })}>Edit</button>}</td>
            </tr>))}</tbody></table></div>
      </>}
    </>
  );
}
