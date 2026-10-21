"use client";
// I1 + I3: what needs a person today, and how the app is doing.
import { Kpi, Page, Status, ago, rupees, useLoad } from "@/components/ui";
import { api } from "@/lib/api";

export default function Dashboard() {
  const { data: o, err } = useLoad(() => api().overview());
  if (err) return <div className="note warn">{err}</div>;
  if (!o) return <div className="skel" style={{ height: 400 }} />;
  const q = o.queues, t = o.today;
  const max = Math.max(1, ...o.signups_14d.map((d) => d.n));
  const top = o.funnel[0]?.n || 1;
  const change = t.signups_yesterday ? Math.round(((t.signups - t.signups_yesterday) / t.signups_yesterday) * 100) : null;
  return (
    <Page title="Dashboard" sub={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}>
      <section className="stack" aria-label="Needs a person">
        <h2>Needs a person</h2>
        <div className="kpis">
          <Kpi k="Reports" v={q.reports} s={q.reports_urgent ? `${q.reports_urgent} urgent` : "none urgent"} alert={q.reports_urgent > 0} href="/moderation" />
          <Kpi k="Selfie reviews" v={q.selfies} s={q.selfie_oldest ? `oldest ${ago(q.selfie_oldest)}` : "queue empty"} href="/selfies" />
          <Kpi k="Grievances" v={q.grievances} s={q.grievances_ack_overdue ? `${q.grievances_ack_overdue} past 24 h` : "on time"} alert={q.grievances_ack_overdue > 0} href="/grievances" />
          <Kpi k="Support" v={q.tickets} s="open tickets" href="/support" />
          <Kpi k="Paid, not credited" v={q.not_credited} s="fix within 1 hour" alert={q.not_credited > 0} href="/payments?filter=not_credited" />
          <Kpi k="Refunds to approve" v={q.refunds_waiting} href="/payments" />
          <Kpi k="Stuck readings" v={q.readings_stuck} s="over 15 min" alert={q.readings_stuck > 0} href="/readings" />
          <Kpi k="Appeals" v={q.appeals} href="/moderation?tab=appeals" />
          <Kpi k="Data requests" v={q.data_requests} s="7-day target" href="/data-requests" />
        </div>
      </section>
      <section className="stack" aria-label="Today">
        <h2>Today</h2>
        <div className="kpis">
          <Kpi k="Sign-ups" v={t.signups} s={change === null ? "" : `${change >= 0 ? "+" : ""}${change}% vs yesterday`} />
          <Kpi k="Women share" v={t.women_pct === null ? "–" : `${t.women_pct}%`} s="of active members" />
          <Kpi k="Revenue" v={rupees(t.revenue_paise)} s={`${t.payments} payments · AI ${rupees(t.ai_paise)}`} />
          <Kpi k="Matches" v={t.matches} />
          <Kpi k="Paying" v={t.paying_pct === null ? "–" : `${t.paying_pct}%`} s="of weekly actives" />
        </div>
      </section>
      <div className="split">
        <section className="card stack" aria-label="Sign-ups, 14 days">
          <h2>Sign-ups, last 14 days</h2>
          <svg viewBox="0 0 560 170" role="img" aria-label="Daily sign-ups bar chart" style={{ width: "100%", height: "auto" }}>
            {o.signups_14d.map((d, i) => { const h = (d.n / max) * 130; return (
              <g key={d.day}><rect x={i * 40 + 6} y={140 - h} width={28} height={h} rx={5} fill={i === o.signups_14d.length - 1 ? "#7E5BEF" : "#CFC3F5"}><title>{`${d.day}: ${d.n}`}</title></rect>
                {(i % 3 === 0 || i === o.signups_14d.length - 1) && <text x={i * 40 + 20} y={160} textAnchor="middle" fontSize="11" fill="#5E5780">{new Date(d.day).getDate()}</text>}</g>); })}
          </svg>
        </section>
        <section className="card stack" aria-label="Funnel, last 30 days">
          <h2>Funnel, sign-ups in the last 30 days</h2>
          {o.funnel.map((f) => (
            <div key={f.step} className="stack" style={{ gap: 4 }}>
              <div className="row" style={{ justifyContent: "space-between" }}><span>{f.step}</span><span className="small">{f.n.toLocaleString("en-IN")} · {Math.round((f.n / top) * 100)}%</span></div>
              <div className="bar"><span style={{ width: `${(f.n / top) * 100}%` }} /></div>
            </div>))}
        </section>
      </div>
      <section className="card flush" aria-label="Cities">
        <table className="t"><thead><tr><th>City</th><th>Members</th><th>Women</th><th>Matches today</th><th>Revenue today</th></tr></thead>
          <tbody>{o.cities.map((c) => <tr key={c.slug}><td><strong>{c.name}</strong> <Status s={c.status} /></td><td>{c.members.toLocaleString("en-IN")}</td>
            <td>{c.women_pct === null ? "–" : `${c.women_pct}%`}</td><td>{c.status === "live" ? c.matches_today : "–"}</td><td>{c.status === "live" ? rupees(c.revenue_today_paise) : "–"}</td></tr>)}</tbody></table>
      </section>
    </Page>
  );
}
