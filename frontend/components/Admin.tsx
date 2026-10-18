"use client";
import { useEffect, useState } from "react";
import type { Dict, Locale } from "@/lib/i18n";
import { dateTag, digits, num, pct, post, type Kit, type Ticket } from "@/lib/fmt";

type Stats = {
  customers: number; kits: number; status: Record<string, number>; collection_rate: number; revenue_30d: number;
  revenue_by_month: { month: string; amount: number }[]; provinces: { id: string; count: number }[]; open_tickets: number;
};
type Row = { id: number; name: string; phone: string; province: string | null; kit: Kit | null };
type ATicket = Ticket & { name: string; phone: string };

const FILTERS = ["", "active", "expired", "pending", "owned"];
const get = (u: string) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));

export default function Admin({ locale, t }: { locale: Locale; t: Dict }) {
  const a = t.admin;
  const n = (v: number, d = 0) => num(locale, v, d);
  const tag = dateTag(locale);
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [rev, setRev] = useState(0);
  const [tickets, setTickets] = useState<ATicket[]>([]);
  const [replies, setReplies] = useState<Record<number, string>>({});
  const [count, setCount] = useState(10);
  const [weeks, setWeeks] = useState(1);
  const [batch, setBatch] = useState<{ codes: string[]; weeks: number } | null>(null);

  const refresh = () => { get("/api/admin/stats").then(setStats).catch(() => {}); get("/api/admin/tickets").then(setTickets).catch(() => {}); };
  useEffect(refresh, []);
  useEffect(() => {
    const id = setTimeout(() => get(`/api/admin/customers?status=${filter}&q=${encodeURIComponent(q)}`).then(setRows).catch(() => {}), 250);
    return () => clearTimeout(id);
  }, [filter, q, rev]);

  const install = async (serial: string) => { await post(`/api/admin/kits/${serial}/install`, {}); setRev((x) => x + 1); refresh(); };
  const answer = async (id: number, status: string) => {
    await post(`/api/admin/tickets/${id}`, { status, reply: replies[id] || null }, "PATCH");
    setReplies((r) => ({ ...r, [id]: "" })); refresh();
  };
  const makeCodes = async () => { const { r, j } = await post("/api/admin/codes", { count, weeks }); if (r.ok) setBatch(j); };
  const csv = () => {
    if (!batch) return;
    const url = URL.createObjectURL(new Blob([`code,weeks\n${batch.codes.map((c) => `${c},${batch.weeks}`).join("\n")}\n`], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: `charge-cards-${batch.weeks}w.csv` }).click();
    URL.revokeObjectURL(url);
  };

  const st = stats?.status ?? {};
  const maxRev = Math.max(...(stats?.revenue_by_month.map((m) => m.amount) ?? [1]), 1);
  const maxProv = Math.max(...(stats?.provinces.map((p) => p.count) ?? [1]), 1);
  const kpis: [string, string, string?][] = stats ? [
    [a.customers, n(stats.customers)],
    [a.active, n((st.active ?? 0) + (st.owned ?? 0))],
    [a.collection, pct(locale, stats.collection_rate), a.target],
    [a.revenue, `${n(stats.revenue_30d, 1)} ${t.plans.unit}`],
    [a.pending, n(st.pending ?? 0)],
    [a.openTickets, n(stats.open_tickets)],
  ] : [];

  return (
    <main className="wrap">
      <div className="dash-head"><div><p className="eyebrow">{a.sub}</p><h1>{a.title}</h1></div></div>
      <div className="dash">
        <section className="kpis s12">
          {kpis.map(([label, value, note]) => (
            <div key={label} className="tile glass"><span className="muted">{label}</span><strong className="num">{value}</strong>{note && <small className="muted">{note}</small>}</div>
          ))}
        </section>

        <section className="card glass s8">
          <h2>{a.revenueChart} <span className="muted" style={{ fontWeight: 500 }}>({t.plans.unit})</span></h2>
          <div className="bars">
            {stats?.revenue_by_month.map((m, i) => (
              <div key={m.month}>
                <em className="num">{n(m.amount)}</em>
                <b style={{ height: `${(m.amount / maxRev) * 72}%`, animationDelay: `${i * 70}ms` }} />
                <span>{new Date(`${m.month}-15T12:00`).toLocaleDateString(tag, { month: "short" })}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card glass s4">
          <h2>{a.byProvince}</h2>
          {stats?.provinces.map((p) => (
            <div key={p.id} className="hbar">
              <span>{t.provinces[p.id] ?? p.id}</span><b className="num">{n(p.count)}</b>
              <i style={{ width: `${(p.count / maxProv) * 100}%` }} />
            </div>
          ))}
        </section>

        <section className="card glass s12">
          <h2>{a.customers}</h2>
          <div className="toolbar">
            <div className="seg" role="group" aria-label={a.status}>
              {FILTERS.map((f) => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f ? t.status[f] : a.all}</button>)}
            </div>
            <input className="input" type="search" placeholder={a.search} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{a.name}</th><th>{a.phone}</th><th>{a.province}</th><th>{a.plan}</th><th>{a.status}</th><th>{a.credit}</th><th /></tr></thead>
              <tbody>
                {rows?.map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.name || "—"}</b></td>
                    <td dir="ltr" className="num">{digits(locale, r.phone)}</td>
                    <td>{r.province ? t.provinces[r.province] : "—"}</td>
                    <td>{r.kit ? t.plans.names[r.kit.plan.id] : "—"}</td>
                    <td>{r.kit ? <span className={`tag ${r.kit.status}`}>{t.status[r.kit.status]}</span> : "—"}</td>
                    <td className="num">{r.kit?.status === "active" ? `${n(r.kit.credit_seconds / 86400, 1)} ${a.days}` : "—"}</td>
                    <td>{r.kit?.status === "pending" && <button className="btn primary sm" onClick={() => install(r.kit!.serial)}>{a.install}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows?.length === 0 && <p className="muted" style={{ padding: 12 }}>{a.none}</p>}
          </div>
        </section>

        <section className="card glass s7">
          <h2>{a.tickets}</h2>
          {tickets.length === 0 && <p className="muted">{a.none}</p>}
          {tickets.map((x) => (
            <article key={x.id} className="ticket">
              <header><b>{x.subject}</b><span className={`tag ${x.status}`}>{t.support.status[x.status]}</span></header>
              <span className="muted" style={{ fontSize: ".82rem" }}>
                {x.name} · <span dir="ltr">{digits(locale, x.phone)}</span> · {new Date(x.created).toLocaleString(tag, { dateStyle: "medium", timeStyle: "short" })}
              </span>
              <p>{x.body}</p>
              {x.reply && <div className="reply"><p>{x.reply}</p></div>}
              {x.status !== "closed" && (
                <>
                  <textarea className="input" style={{ minHeight: 70 }} placeholder={a.replyPh} value={replies[x.id] ?? ""}
                    onChange={(e) => setReplies((r) => ({ ...r, [x.id]: e.target.value }))} maxLength={2000} />
                  <div className="chips">
                    <button className="btn primary sm" disabled={!replies[x.id]?.trim()} onClick={() => answer(x.id, "answered")}>{a.sendReply}</button>
                    <button className="btn ghost sm" onClick={() => answer(x.id, "closed")}>{a.close}</button>
                  </div>
                </>
              )}
            </article>
          ))}
        </section>

        <section className="card glass s5">
          <h2>{a.codes}</h2>
          <div className="form">
            <label>{a.count}<input className="input" type="number" min={1} max={100} value={count}
              onChange={(e) => setCount(Math.min(100, Math.max(1, +e.target.value || 1)))} /></label>
            <div className="seg" role="group" aria-label={t.dash.weeks}>
              {[1, 2, 4].map((w) => <button key={w} aria-pressed={weeks === w} onClick={() => setWeeks(w)}>{n(w)} {t.dash.wk}</button>)}
            </div>
            <div className="chips">
              <button className="btn primary sm" onClick={makeCodes}>{a.make}</button>
              {batch && <button className="btn ghost sm" onClick={csv}>{a.csv}</button>}
            </div>
          </div>
          {batch && <div className="codes">{batch.codes.map((c) => <span key={c}>{c.replace(/(\d{4})(?=\d)/g, "$1-")}</span>)}</div>}
        </section>
      </div>
    </main>
  );
}
