"use client";
// Edit a few settings, then "Publish changes" with a note. Every publish is versioned and in the audit log.
import { useEffect, useMemo, useState } from "react";
import { useAction, useAdmin } from "./shell";
import { api, type SettingValue, type SettingVersion } from "@/lib/api";
import { day } from "./ui";

export interface Field { key: string; path?: string; label: string; unit?: "rupees" | "pct" | "number" | "bool" | "days" | "credits" | "usd"; hint?: string; locked?: boolean }

const read = (all: Record<string, SettingValue>, f: Field): unknown => { const v = all[f.key]?.value; return f.path ? (v as Record<string, unknown> | undefined)?.[f.path] : v; };
const toInput = (v: unknown, f: Field) => f.unit === "bool" ? Boolean(v) : f.unit === "rupees" ? (Number(v) / 100).toString() : v === undefined || v === null ? "" : String(v);
const fromInput = (v: string | boolean, f: Field) => f.unit === "bool" ? Boolean(v) : f.unit === "rupees" ? Math.round(Number(v) * 100) : Number(v);
const suffix: Record<string, string> = { pct: "%", days: "days", credits: "credits", usd: "₹ per $" };

export function SettingsForm({ title, fields, canEdit, onSaved }: { title: string; fields: Field[]; canEdit: boolean; onSaved?(): void }) {
  const { toast } = useAdmin();
  const keys = useMemo(() => [...new Set(fields.map((f) => f.key))], [fields]);
  const [all, setAll] = useState<Record<string, SettingValue> | null>(null);
  const [vals, setVals] = useState<Record<string, string | boolean>>({});
  const [note, setNote] = useState(""); const [hist, setHist] = useState<{ key: string; rows: SettingVersion[] } | null>(null);
  const { busy, error, run } = useAction();
  const id = (f: Field) => f.key + (f.path ? "." + f.path : "");
  const load = () => api().settings(keys).then((a) => { setAll(a); setVals(Object.fromEntries(fields.map((f) => [id(f), toInput(read(a, f), f)]))); });
  useEffect(() => { load(); }, [keys.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!all) return <div className="skel" style={{ height: 160 }} />;
  const changed = fields.filter((f) => String(vals[id(f)]) !== String(toInput(read(all, f), f)));
  const publish = () => run(async () => {
    const changes: Record<string, unknown> = {};
    for (const f of changed) {
      if (f.path) changes[f.key] = { ...((changes[f.key] ?? all[f.key].value) as object), [f.path]: fromInput(vals[id(f)], f) };
      else changes[f.key] = fromInput(vals[id(f)], f);
    }
    const n = await api().saveSettings(changes, note); setNote(""); toast(`Published ${n} change${n === 1 ? "" : "s"}`); await load(); onSaved?.();
  });
  return (
    <section className="card stack" style={{ gap: 12 }} aria-label={title}>
      <div className="row"><h2 className="grow">{title}</h2>{!canEdit && <span className="pill off">Read only</span>}</div>
      <div className="stack" style={{ gap: 0 }}>{fields.map((f) => (
        <div key={id(f)} className="row" style={{ padding: "8px 0", borderTop: "1px solid var(--line-soft)", flexWrap: "nowrap" }}>
          <label htmlFor={`set-${id(f)}`} className="grow" style={{ fontSize: 13.5 }}>{f.label}{f.hint && <div className="small">{f.hint}</div>}</label>
          {f.unit === "bool" ? <input id={`set-${id(f)}`} type="checkbox" checked={Boolean(vals[id(f)])} disabled={!canEdit || f.locked} onChange={(e) => setVals({ ...vals, [id(f)]: e.target.checked })} />
            : <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>{f.unit === "rupees" && <span className="small">₹</span>}
                <input id={`set-${id(f)}`} className="input" type="number" min={0} step="any" style={{ width: 110 }} value={String(vals[id(f)] ?? "")} disabled={!canEdit || f.locked}
                  onChange={(e) => setVals({ ...vals, [id(f)]: e.target.value })} />{f.unit && suffix[f.unit] && <span className="small" style={{ width: 52 }}>{suffix[f.unit]}</span>}</span>}
          <button type="button" className="btn ghost sm" style={{ marginLeft: 8 }} aria-label={`History of ${f.label}`}
            onClick={async () => setHist(hist?.key === f.key ? null : { key: f.key, rows: await api().settingHistory(f.key) })}>History</button>
        </div>))}</div>
      {hist && <div className="note" style={{ fontSize: 12.5 }}><strong>{hist.key}</strong>{hist.rows.length === 0 ? " · never changed" : hist.rows.map((h) => (
        <div key={h.version}>v{h.version} · {day(h.at)}{h.by ? ` · ${h.by}` : ""} · {h.note} · <span className="mono">{JSON.stringify(h.value).slice(0, 120)}</span></div>))}</div>}
      {canEdit && changed.length > 0 && <div className="stack" style={{ gap: 8, padding: 12, borderRadius: 12, background: "#FFFBF0" }}>
        <span className="small">{changed.length} unpublished change{changed.length === 1 ? "" : "s"}: {changed.map((f) => f.label).join(", ")}</span>
        <input className="input" aria-label="Change note" placeholder="Why are you changing this? (goes in the history)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="row"><button type="button" className="btn sm" disabled={busy || note.trim().length < 3} onClick={publish}>Publish changes</button>
          <button type="button" className="btn ghost sm" onClick={() => setVals(Object.fromEntries(fields.map((f) => [id(f), toInput(read(all, f), f)])))}>Discard</button></div>
      </div>}
      {error && <p className="err" role="alert">{error}</p>}
    </section>
  );
}
