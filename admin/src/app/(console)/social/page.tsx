"use client";
// Social media: next week's seven posts, written every Sunday from computed facts. Read, edit, approve or drop each one;
// only approved posts go out, at their time, to the platforms ticked. Keys live in Keys and integrations > Social.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAction, useAdmin } from "@/components/shell";
import { SettingsForm } from "@/components/settings-form";
import { Page, day, label, useLoad } from "@/components/ui";
import { api, type SocialPlatform, type SocialPost } from "@/lib/api";

const PLATFORMS: [SocialPlatform, string][] = [["instagram", "Instagram"], ["facebook", "Facebook"], ["linkedin", "LinkedIn"], ["x", "X"], ["youtube", "YouTube Shorts"]];
const FIELDS: [string, string, number][] = [["instagram", "Instagram", 2200], ["facebook", "Facebook", 5000], ["linkedin", "LinkedIn", 3000], ["x", "X", 280],
  ["youtube_title", "YouTube title", 100], ["youtube_description", "YouTube description", 5000]];
const KIND: Record<string, string> = { panchang: "Aaj ka panchang", pair: "Rashi jodi", koota: "Kundli 101", feature: "Feature", myth: "Myth vs fact", golden: "Golden Hours", brand: "Likha diaries" };
const TONE: Record<SocialPost["status"], string> = { draft: "warn", approved: "info", dropped: "off", posting: "info", posted: "ok", partly: "warn", failed: "bad" };
const Pill = ({ s, text }: { s: string; text: string }) => <span className={`pill ${s}`}>{text}</span>;
const time = (iso: string) => new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** The card as drawn, or a close sketch of it before the image is ready. */
function Preview({ p }: { p: SocialPost }) {
  if (p.assets.image) return <img src={p.assets.image} alt={`Card: ${p.card.headline}`} style={{ width: "100%", borderRadius: 12, display: "block" }} />;
  const c = p.card;
  return (
    <div role="img" aria-label={`Card sketch: ${c.headline}`} style={{ aspectRatio: "4 / 5", borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 8,
      background: "linear-gradient(160deg, #1B1533, #2A1F55 55%, #4A2350)", color: "#fff" }}>
      <div className="row"><strong className="grow" style={{ fontSize: 16 }}>Likha<span style={{ color: "#FFB020" }}>.</span></strong>
        <span style={{ background: "#FFB020", color: "#1E1838", borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>{(KIND[p.kind] ?? p.kind).toUpperCase()}</span></div>
      <div className="grow" />
      {c.kicker && <div style={{ color: "#FFB020", fontWeight: 700, fontSize: 12 }}>{c.kicker}</div>}
      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{c.headline}</div>
      {c.sub && <div style={{ fontSize: 12, color: "#E4DEF7" }}>{c.sub}</div>}
      {c.big && <div style={{ fontSize: 34, fontWeight: 800, color: "#FFB020" }}>{c.big}</div>}
      {(c.facts ?? []).slice(0, 4).map(([k, v]) => <div key={k} className="row" style={{ fontSize: 11, background: "rgba(255,255,255,.09)", borderRadius: 8, padding: "4px 8px" }}>
        <span className="grow" style={{ color: "#D9D3F0" }}>{k}</span><strong>{v}</strong></div>)}
      <div className="grow" />
      <div className="row" style={{ fontSize: 10, color: "#CFC8EA" }}><span className="grow">{c.footer ?? "Kundli milao, dil milao."}</span><strong style={{ color: "#fff" }}>likha.in</strong></div>
    </div>
  );
}

function Post({ p, connections, done }: { p: SocialPost; connections: Record<SocialPlatform, boolean>; done(): void }) {
  const { toast } = useAdmin();
  const { busy, error, run } = useAction();
  const editable = ["draft", "approved", "dropped"].includes(p.status);
  const [tab, setTab] = useState("instagram");
  const [cap, setCap] = useState<Record<string, string>>(p.captions);
  const [head, setHead] = useState(p.card.headline);
  const [sub, setSub] = useState(p.card.sub ?? "");
  const [plats, setPlats] = useState<SocialPlatform[]>(p.platforms);
  const [video, setVideo] = useState(p.video);
  useEffect(() => { setCap(p.captions); setHead(p.card.headline); setSub(p.card.sub ?? ""); setPlats(p.platforms); setVideo(p.video); }, [p]);
  const dirty = JSON.stringify(cap) !== JSON.stringify(p.captions) || head !== p.card.headline || sub !== (p.card.sub ?? "")
    || plats.join() !== p.platforms.join() || video !== p.video;
  const field = FIELDS.find(([k]) => k === tab)!;
  const togglePlat = (k: SocialPlatform) => setPlats((xs) => xs.includes(k) ? xs.filter((x) => x !== k) : PLATFORMS.map(([q]) => q).filter((q) => q === k || xs.includes(q)));
  const save = () => run(async () => { await api().socialEdit(p.id, cap, { headline: head, sub }, plats, video); toast("Saved"); done(); });
  const decide = (s: "approved" | "dropped" | "draft") => run(async () => {
    if (dirty) await api().socialEdit(p.id, cap, { headline: head, sub }, plats, video);
    await api().socialDecide(p.id, s); toast(s === "approved" ? "Approved: it goes out on time" : s === "dropped" ? "Dropped" : "Back to draft"); done();
  });
  return (
    <section className="card social-post" aria-label={`${KIND[p.kind] ?? p.kind}, ${day(p.post_date)}`}>
      <Preview p={p} />
      <div className="stack" style={{ gap: 10 }}>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <strong className="grow">{time(p.scheduled_at)} · {KIND[p.kind] ?? label(p.kind)}</strong>
          <Pill s={TONE[p.status]} text={label(p.status)} />
        </div>
        {p.problems.length > 0 && <p className="note warn" role="alert">Flagged: {p.problems.join(", ")}. Fix the text, then approve.</p>}
        {editable && <>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <label className="f grow">Card headline<input className="input" value={head} maxLength={60} onChange={(e) => setHead(e.target.value)} /></label>
            <label className="f grow">Card line<input className="input" value={sub} maxLength={120} onChange={(e) => setSub(e.target.value)} /></label>
          </div>
          <div className="chips" role="group" aria-label="Post to">
            {PLATFORMS.map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={plats.includes(k)} onClick={() => togglePlat(k)}
              title={connections[k] ? "Connected" : "Not connected yet: add its keys in Keys and integrations"}>{l}{connections[k] ? "" : " ·  not connected"}</button>)}
            <button type="button" className="chip" aria-pressed={video} onClick={() => setVideo(!video)}>Video (Reel / Short)</button>
          </div>
        </>}
        <div className="tabs" role="tablist" style={{ overflowX: "auto" }}>{FIELDS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
        <label className="f">{field[1]} <span style={{ fontWeight: 500 }}>{(cap[tab] ?? "").length} / {field[2]}</span>
          <textarea className="input" style={{ height: tab.startsWith("youtube_title") ? 44 : 150, padding: 10, resize: "vertical", lineHeight: 1.45 }}
            value={cap[tab] ?? ""} readOnly={!editable} maxLength={field[2]} onChange={(e) => setCap({ ...cap, [tab]: e.target.value })} /></label>
        <span className="small">Written by {p.writer ?? "the planner"}{p.decided_by ? ` · ${label(p.status)} by ${p.decided_by}` : ""}</span>
        {Object.keys(p.results).length > 0 && <div className="stack" style={{ gap: 4 }}>
          {Object.entries(p.results).map(([k, r]) => <div key={k} className="row small">
            <Pill s={r!.ok ? "ok" : r!.pending ? "info" : "bad"} text={PLATFORMS.find(([q]) => q === k)?.[1] ?? k} />
            {r!.ok ? (r!.url ? <a href={r!.url} target="_blank" rel="noreferrer">See the post</a> : "Posted") : r!.pending ? "Processing the video" : r!.error}</div>)}
        </div>}
        {editable && <div className="row" style={{ flexWrap: "wrap" }}>
          {p.status !== "approved" && <button type="button" className="btn sm" disabled={busy || p.problems.length > 0 && !dirty} onClick={() => decide("approved")}>Approve</button>}
          {p.status === "approved" && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => decide("draft")}>Unapprove</button>}
          <button type="button" className="btn ghost sm" disabled={busy || !dirty} onClick={save}>Save changes</button>
          {p.status !== "dropped" && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => decide("dropped")}>Drop</button>}
        </div>}
        {error && <p className="err" role="alert">{error}</p>}
      </div>
    </section>
  );
}

export default function Social() {
  const { toast, me } = useAdmin();
  const [week, setWeek] = useState<string | undefined>();
  const { data, reload } = useLoad(() => api().social(week), [week]);
  const { busy, error, run } = useAction();
  if (!data) return <div className="skel" style={{ height: 400 }} />;
  const on = Boolean(data.settings?.enabled);
  const drafts = data.posts.filter((p) => p.status === "draft" && p.problems.length === 0).length;
  const weeks = [...new Set([data.week_of, ...data.weeks])].sort().reverse();
  const canSettings = data.can_settings || (me?.perms ?? []).includes("settings.write");
  return (
    <Page title="Social media" sub="One post a day, written every Sunday from real facts. Nothing goes out until you approve it."
      actions={<div className="row" style={{ flexWrap: "wrap" }}>
        <select className="input" aria-label="Week" value={data.week_of} onChange={(e) => setWeek(e.target.value)}>
          {weeks.map((w) => <option key={w} value={w}>Week of {day(w)}</option>)}</select>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => run(async () => { const r = await api().socialPlan(data.week_of); toast(`${r.saved} drafts written`); reload(); })}>
          {data.posts.length ? "Write the drafts again" : "Write this week now"}</button>
        <button type="button" className="btn" disabled={busy || drafts === 0} onClick={() => run(async () => { const n = await api().socialApproveWeek(data.week_of); toast(`${n} posts approved`); reload(); })}>
          Approve all ({drafts})</button>
      </div>}>
      {error && <p className="err" role="alert">{error}</p>}
      {!on && <p className="note warn">Posting is off. Approved posts wait until you switch it on below{canSettings ? "" : " (needs settings permission)"}.</p>}
      <section className="card row" aria-label="Connections" style={{ flexWrap: "wrap" }}>
        <strong className="grow">Connected</strong>
        {PLATFORMS.map(([k, l]) => <Pill key={k} s={data.connections[k] ? "ok" : "off"} text={`${l}${data.connections[k] ? "" : ": not yet"}`} />)}
        <Link href="/keys" className="btn ghost sm">Add keys</Link>
      </section>
      {data.posts.length === 0 && <p className="note">No posts for this week yet. They&apos;re written every Sunday at {String(data.settings?.plan_time_ist ?? "10:00")} for the week after, or press &ldquo;Write this week now&rdquo;.</p>}
      {data.posts.map((p) => <Post key={p.id} p={p} connections={data.connections} done={reload} />)}
      <SettingsForm title="Social settings" canEdit={canSettings} onSaved={reload} fields={[
        { key: "social", path: "enabled", label: "Post approved posts", unit: "bool", hint: "Off: nothing goes out, even if approved" },
        { key: "social", path: "post_time_ist", label: "Posting time (IST)", unit: "time" },
        { key: "social", path: "plan_weekday", label: "Write next week's drafts on", unit: "choice", options: ["0", "1", "2", "3", "4", "5", "6"], hint: "0 = Sunday, 6 = Saturday" },
        { key: "social", path: "plan_time_ist", label: "…at (IST)", unit: "time" },
        { key: "social", path: "platforms", label: "Platforms", unit: "list", hint: "instagram, facebook, linkedin, x, youtube" },
        { key: "social", path: "video_kinds", label: "Also make a video for", unit: "list", hint: "panchang, pair, koota, feature, myth, golden, brand" },
        { key: "social", path: "youtube_privacy", label: "YouTube Shorts go up as", unit: "choice", options: ["private", "unlisted", "public"],
          hint: "Google keeps API uploads private until your project passes its audit" },
        { key: "social", path: "hashtags", label: "Hashtags", unit: "list" },
      ]} />
    </Page>
  );
}
