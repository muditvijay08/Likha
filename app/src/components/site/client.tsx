"use client";
// Website pieces that run in the browser: the Founding Members form, live city counters, the Moon sign finder,
// the pair picker, and sending signed-in members straight into the app.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, type CityCounter, type Gender, type WaitlistResult } from "@/lib/api";
import { resumePath } from "@/lib/flow";
import { moonLongitude } from "@/lib/moon";
import { RASHIS, pairSlug } from "@/lib/rashi";

/** Members who are signed in go to their app, not the website. */
export function SignedInRedirect() {
  const router = useRouter();
  useEffect(() => {
    let live = true;
    (async () => { if (await api().signedIn() && live) router.replace(resumePath(await api().state())); })().catch(() => {});
    return () => { live = false; };
  }, [router]);
  return null;
}

export function CityUnlocks() {
  const [rows, setRows] = useState<CityCounter[] | null>(null);
  useEffect(() => { api().cityCounters().then(setRows).catch(() => setRows([])); }, []);
  if (!rows) return <div aria-busy="true" style={{ minHeight: 260 }} />;
  if (!rows.length) return null;
  const sample = rows.some((r) => r.sample);
  return (
    <div className="cities" aria-label="City unlocks">
      {[...rows].sort((a, b) => (a.status === "live" ? -1 : 0) - (b.status === "live" ? -1 : 0) || (b.members ?? 0) - (a.members ?? 0)).map((c) => (
        <Link key={c.slug} href={`/dating/${c.slug}`} className="city">
          <strong>{c.name}</strong>
          <span className={`n ${c.status === "live" ? "live" : ""}`}>{c.status === "live" ? "Open now" : c.members === null ? "Counting" : `${c.members.toLocaleString("en-IN")} of ${c.unlock_threshold.toLocaleString("en-IN")}`}</span>
          <span className="track" role="img" aria-label={c.status === "live" ? `${c.name} is open` : c.members === null ? `${c.name}: counting` : `${c.name}: ${c.members} of ${c.unlock_threshold}`}>
            <span className="fill" style={{ display: "block", width: c.status === "live" ? "100%" : c.members === null ? "3%" : `${Math.min(100, (c.members / c.unlock_threshold) * 100)}%` }} />
          </span>
        </Link>))}
      <p className="c-note">{sample ? "Sample numbers. Real counts show once a city passes 100 members." : "A city shows its count once it passes 100 members."}</p>
    </div>
  );
}

declare global { interface Window { turnstile?: { render(el: HTMLElement, o: Record<string, unknown>): string; reset(id?: string): void } } }

function Turnstile({ siteKey, onToken }: { siteKey: string; onToken(t: string | null): void }) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken); cb.current = onToken;
  useEffect(() => {
    let id: string | undefined;
    const draw = () => { if (box.current && window.turnstile && !id) id = window.turnstile.render(box.current, { sitekey: siteKey, theme: "light",
      callback: (t: string) => cb.current(t), "expired-callback": () => cb.current(null), "error-callback": () => cb.current(null) }); };
    if (window.turnstile) draw();
    else {
      const src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      let s = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
      if (!s) { s = document.createElement("script"); s.src = src; s.async = true; document.head.appendChild(s); }
      s.addEventListener("load", draw);
    }
  }, [siteKey]);
  return <div ref={box} style={{ minHeight: 65 }} />;
}

export function WaitlistForm() {
  const [cities, setCities] = useState<CityCounter[]>([]);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [city, setCity] = useState("");
  const [gender, setGender] = useState<Gender | null>(null); const [agree, setAgree] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null); const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<WaitlistResult | null>(null); const [copied, setCopied] = useState(false);

  useEffect(() => {
    api().cityCounters().then((c) => { setCities(c); }).catch(() => {});
    api().settings().then((s) => setSiteKey(s.public_keys?.turnstile_site_key ?? null)).catch(() => {});
    try {
      const q = new URLSearchParams(location.search);
      const code = q.get("invite"); if (code && /^[a-f0-9]{8}$/i.test(code)) setInvite(code.toLowerCase());
      const c = q.get("city"); if (c) setCity(c);
    } catch { /* no URL */ }
  }, []);

  const chosen = cities.find((c) => c.slug === city);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (!name.trim()) return setError("Enter your first name.");
    if (!phone.trim()) return setError("Enter your mobile number.");
    if (!city) return setError("Pick your city.");
    if (!gender) return setError("Pick one option for “I am”.");
    if (!agree) return setError("Tick the box to confirm you're 18+ and agree to the Terms and Privacy Policy.");
    if (siteKey && !token) return setError("Please complete the quick check above the button.");
    setBusy(true);
    try { setDone(await api().joinWaitlist({ first_name: name, phone, city, gender, consent: agree, invite, token })); }
    catch (err) { setError((err as Error).message); setToken(null); }
    finally { setBusy(false); }
  }

  if (done?.city_live) return (
    <div className="panel join" role="status">
      <span className="badge green">{done.city} is live</span>
      <h3>Good news: Likha is already open in {done.city}.</h3>
      <p className="sub">You can make your kundli and start meeting people right now.</p>
      <Link className="pill-btn lg" href="/start">Start now</Link>
    </div>);
  if (done) {
    const link = done.invite_code ? `${location.origin}/?invite=${done.invite_code}` : null;
    return (
      <div className="panel join" role="status">
        <span className="badge violet">Founding Member</span>
        {done.existing ? <><h3>You&apos;re already on the list.</h3><p className="sub">We&apos;ll send you an SMS the day your city opens.</p></>
          : <><h3>You&apos;re #{done.position?.toLocaleString("en-IN")} in {done.city}.</h3>
            <p className="sub">{done.city} opens at {done.unlock_threshold?.toLocaleString("en-IN")} Founding Members. We&apos;ll send you one SMS the day it opens.</p></>}
        {link && <div className="stack" style={{ gap: 10 }}>
          <strong style={{ fontSize: 15 }}>Invite friends{done.jump_per_invite ? `: each one who joins moves you up ${done.jump_per_invite} places` : ""}</strong>
          <div className="row"><input className="input" readOnly value={link} aria-label="Your invite link" onFocus={(e) => e.target.select()} />
            <button type="button" className="pill-btn ghost" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { /* blocked */ } }}>{copied ? "Copied" : "Copy"}</button></div>
          <a className="pill-btn" href={`https://wa.me/?text=${encodeURIComponent(`I just joined Likha, the kundli-first dating app. Join ${done.city} with me: ${link}`)}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
        </div>}
      </div>);
  }
  return (
    <form className="panel join" onSubmit={submit} aria-label="Join as a Founding Member" noValidate>
      <h3>Join as a Founding Member</h3>
      <div className="two">
        <label className="field"><span className="label">First name</span>
          <input className="input" name="first_name" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></label>
        <label className="field"><span className="label">Mobile number</span>
          <input className="input" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="98290 12345" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      </div>
      <label className="field"><span className="label">City</span>
        <select className="input" name="city" aria-label="City" value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">Pick your city</option>
          {cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}{c.status === "live" ? " (live now)" : ""}</option>)}
        </select></label>
      <div className="field" role="radiogroup" aria-label="I am"><span className="label">I am</span>
        <div className="chips fill">{(["woman", "man", "other"] as Gender[]).map((g) => (
          <button key={g} type="button" role="radio" aria-checked={gender === g} className="chip" onClick={() => setGender(g)}>{g === "woman" ? "Woman" : g === "man" ? "Man" : "Other"}</button>))}</div></div>
      <label className="check" style={{ padding: "12px 14px" }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span className="small" style={{ color: "var(--ink)", lineHeight: 1.5 }}>I&apos;m 18+ and agree to the <Link href="/legal/terms">Terms</Link> and <Link href="/legal/privacy">Privacy Policy</Link>.
          We&apos;ll send you an SMS when your city opens.</span>
      </label>
      {siteKey && <Turnstile siteKey={siteKey} onToken={setToken} />}
      {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}
      {chosen?.status === "live"
        ? <Link className="btn" href="/start">{chosen.name} is live: start now</Link>
        : <button className="btn" disabled={busy}>{busy ? "Joining…" : "Join as a Founding Member"}</button>}
      <span className="small" style={{ textAlign: "center" }}>{invite ? "You were invited by a friend: you'll both move up the list." : "Invite 3 friends after joining and jump the queue."}</span>
    </form>
  );
}

/** Moon sign from a date (and optional time, Indian time). Approximate; the app uses the exact time and place. */
export function MoonSignTool() {
  const [date, setDate] = useState(""); const [time, setTime] = useState("");
  const [out, setOut] = useState<{ signs: number[]; nak: string | null; timeGiven: boolean } | null>(null);
  const NAKS = ["Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni",
    "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana",
    "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati"];
  function find(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    if (time) {
      const lon = moonLongitude(new Date(`${date}T${time}:00+05:30`));
      const s = Math.floor(lon / 30), near = lon % 30 < 1 ? (s + 11) % 12 : lon % 30 > 29 ? (s + 1) % 12 : null;
      const n = Math.floor(lon / (360 / 27)), edge = (lon % (360 / 27)) < 0.5 || (lon % (360 / 27)) > (360 / 27) - 0.5;
      setOut({ signs: near === null ? [s] : [s, near], nak: edge ? null : NAKS[n], timeGiven: true });
    } else {
      const a = Math.floor(moonLongitude(new Date(`${date}T00:00:00+05:30`)) / 30), b = Math.floor(moonLongitude(new Date(`${date}T23:59:00+05:30`)) / 30);
      setOut({ signs: a === b ? [a] : [a, b], nak: null, timeGiven: false });
    }
  }
  return (
    <div className="panel stack" style={{ gap: 14 }}>
      <form className="join" onSubmit={find} aria-label="Find your Moon sign">
        <div className="two">
          <label className="field"><span className="label">Date of birth</span><input className="input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} max="2010-12-31" min="1930-01-01" /></label>
          <label className="field"><span className="label">Time of birth (optional, Indian time)</span><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        </div>
        <button className="btn">Find my Moon sign</button>
      </form>
      {out && <div role="status" className="stack" style={{ gap: 10 }}>
        {out.signs.length === 1
          ? <h3>Your Moon sign is most likely <Link href={`/rashi/${RASHIS[out.signs[0]].slug}`}>{RASHIS[out.signs[0]].hi} ({RASHIS[out.signs[0]].en})</Link></h3>
          : <h3>The Moon was moving between <Link href={`/rashi/${RASHIS[out.signs[0]].slug}`}>{RASHIS[out.signs[0]].hi}</Link> and <Link href={`/rashi/${RASHIS[out.signs[1]].slug}`}>{RASHIS[out.signs[1]].hi}</Link></h3>}
        {out.nak && <p className="sub">Nakshatra: most likely {out.nak}.</p>}
        <p className="small" style={{ margin: 0 }}>{out.timeGiven ? "Worked out from the date and time only, without your birthplace, so it can be off near a boundary."
          : out.signs.length > 1 ? "The Moon changed sign that day. Add your birth time to narrow it down." : "The Moon stayed in this sign all day, so the time doesn't change it."}
          {" "}Your Likha kundli uses your exact time and place.</p>
      </div>}
    </div>
  );
}

/** Two Moon signs -> their compatibility page. */
export function PairPicker() {
  const router = useRouter();
  const [a, setA] = useState(0); const [b, setB] = useState(11);
  return (
    <form className="panel join" onSubmit={(e) => { e.preventDefault(); router.push(`/compatibility/${pairSlug(a, b)}`); }} aria-label="Check two Moon signs">
      <div className="two">
        <label className="field"><span className="label">Your Moon sign</span>
          <select className="input" value={a} onChange={(e) => setA(Number(e.target.value))}>{RASHIS.map((r) => <option key={r.i} value={r.i}>{r.hi} ({r.en})</option>)}</select></label>
        <label className="field"><span className="label">Their Moon sign</span>
          <select className="input" value={b} onChange={(e) => setB(Number(e.target.value))}>{RASHIS.map((r) => <option key={r.i} value={r.i}>{r.hi} ({r.en})</option>)}</select></label>
      </div>
      <button className="btn">See our match</button>
      <span className="small" style={{ textAlign: "center" }}>Don&apos;t know your Moon sign? <Link href="/moon-sign-calculator">Find it from your birth date</Link>.</span>
    </form>
  );
}
