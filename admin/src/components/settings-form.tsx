"use client";
// Edit a few settings, then "Publish changes" with a note. Every publish is versioned and in the audit log.
import { useEffect, useMemo, useState } from "react";
import { useAction, useAdmin } from "./shell";
import { api, type SettingValue, type SettingVersion } from "@/lib/api";
import { day } from "./ui";

export interface Field {
  key: string; path?: string; label: string; hint?: string; locked?: boolean;
  /** saved, but nothing reads this sub-value yet (the whole-key list comes from the database) */ unused?: boolean;
  unit?: "rupees" | "pct" | "number" | "bool" | "days" | "credits" | "usd" | "hours" | "minutes" | "text" | "time" | "list" | "choice";
  /** for unit "choice" */ options?: string[];
}
let unusedCache: Promise<string[]> | null = null;
const unusedSettings = () => (unusedCache ??= api().unusedSettings().catch(() => []));

const read = (all: Record<string, SettingValue>, f: Field): unknown => { const v = all[f.key]?.value; return f.path ? (v as Record<string, unknown> | undefined)?.[f.path] : v; };
const TEXTY = ["text", "time", "list", "choice"];
const toInput = (v: unknown, f: Field) => f.unit === "bool" ? Boolean(v) : f.unit === "rupees" ? (Number(v) / 100).toString()
  : f.unit === "list" ? (Array.isArray(v) ? v.join(", ") : "") : v === undefined || v === null ? "" : String(v);
const fromInput = (v: string | boolean, f: Field) => f.unit === "bool" ? Boolean(v) : f.unit === "rupees" ? Math.round(Number(v) * 100)
  : f.unit === "list" ? String(v).split(",").map((x) => x.trim()).filter(Boolean) : TEXTY.includes(f.unit ?? "") ? String(v) : Number(v);
const suffix: Record<string, string> = { pct: "%", days: "days", credits: "credits", usd: "₹ per $", hours: "hours", minutes: "min" };

export function SettingsForm({ title, fields, canEdit, onSaved }: { title: string; fields: Field[]; canEdit: boolean; onSaved?(): void }) {
  const { toast } = useAdmin();
  const keys = useMemo(() => [...new Set(fields.map((f) => f.key))], [fields]);
  const [all, setAll] = useState<Record<string, SettingValue> | null>(null);
  const [unused, setUnused] = useState<string[]>([]);
  useEffect(() => { unusedSettings().then(setUnused); }, []);
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
          <label htmlFor={`set-${id(f)}`} className="grow" style={{ fontSize: 13.5 }}>{f.label}{f.locked && <span className="pill off" style={{ marginLeft: 6 }}>Locked</span>}
            {(f.unused || unused.includes(f.key)) && <span className="pill warn" style={{ marginLeft: 6 }} title="Saved, but nothing in the app reads this yet">Not used by the app yet</span>}
            {f.hint && <div className="small">{f.hint}</div>}</label>
          {f.unit === "bool" ? <input id={`set-${id(f)}`} type="checkbox" checked={Boolean(vals[id(f)])} disabled={!canEdit || f.locked} onChange={(e) => setVals({ ...vals, [id(f)]: e.target.checked })} />
            : f.unit === "choice" ? <select id={`set-${id(f)}`} className="input" style={{ width: 170 }} value={String(vals[id(f)] ?? "")} disabled={!canEdit || f.locked}
                onChange={(e) => setVals({ ...vals, [id(f)]: e.target.value })}>{(f.options ?? []).map((o) => <option key={o}>{o}</option>)}</select>
            : f.unit === "text" || f.unit === "list" ? <input id={`set-${id(f)}`} className="input" style={{ width: 280 }} value={String(vals[id(f)] ?? "")} disabled={!canEdit || f.locked}
                placeholder={f.unit === "list" ? "comma, separated" : ""} onChange={(e) => setVals({ ...vals, [id(f)]: e.target.value })} />
            : f.unit === "time" ? <input id={`set-${id(f)}`} className="input" type="time" style={{ width: 120 }} value={String(vals[id(f)] ?? "")} disabled={!canEdit || f.locked}
                onChange={(e) => setVals({ ...vals, [id(f)]: e.target.value })} />
            : <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>{f.unit === "rupees" && <span className="small">₹</span>}
                <input id={`set-${id(f)}`} className="input" type="number" min={0} step="any" style={{ width: 110 }} value={String(vals[id(f)] ?? "")} disabled={!canEdit || f.locked}
                  onChange={(e) => setVals({ ...vals, [id(f)]: e.target.value })} />{f.unit && suffix[f.unit] && <span className="small" style={{ width: 52 }}>{suffix[f.unit]}</span>}</span>}
          <button type="button" className="btn ghost sm" style={{ marginLeft: 8 }} aria-label={`History of ${f.label}`}
            onClick={async () => setHist(hist?.key === f.key ? null : { key: f.key, rows: await api().settingHistory(f.key) })}>History</button>
        </div>))}</div>
      {hist && <div className="note" style={{ fontSize: 12.5 }}><strong>{hist.key}</strong>{hist.rows.length === 0 ? " · never changed" : hist.rows.map((h, i) => (
        <div key={h.version} className="row" style={{ gap: 6 }}><span className="grow">v{h.version} · {day(h.at)}{h.by ? ` · ${h.by}` : ""} · {h.note} · <span className="mono">{JSON.stringify(h.value).slice(0, 120)}</span></span>
          {canEdit && i > 0 && <button type="button" className="btn ghost sm" onClick={() => run(async () => { await api().restoreSetting(hist.key, h.version, "from history"); toast(`Restored v${h.version}`); setHist(null); await load(); onSaved?.(); })}>Restore</button>}</div>))}</div>}
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
