"use client";
import { useEffect, useState } from "react";
import type { Dict, Locale } from "@/lib/i18n";
import { dateTag, post, type Ticket } from "@/lib/fmt";

export default function Support({ locale, t }: { locale: Locale; t: Dict }) {
  const s = t.support;
  const [items, setItems] = useState<Ticket[] | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => fetch("/api/tickets").then((r) => r.json()).then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (subject.trim().length < 3 || body.trim().length < 3) return setMsg({ ok: false, text: t.dash.empty });
    setBusy(true);
    try {
      const { r } = await post("/api/tickets", { subject, body });
      if (r.ok) { setSubject(""); setBody(""); setMsg({ ok: true, text: s.sent }); load(); }
      else setMsg({ ok: false, text: t.dash.errGeneric });
    } catch { setMsg({ ok: false, text: t.dash.errNet }); }
    setBusy(false);
  };

  const date = (v: string) => new Date(v).toLocaleString(dateTag(locale), { dateStyle: "medium", timeStyle: "short" });

  return (
    <main className="wrap">
      <div className="dash-head"><div><p className="eyebrow">{s.sub}</p><h1>{s.title}</h1></div></div>
      <div className="dash">
        <section className="card glass s5">
          <form className="form" onSubmit={submit} noValidate>
            <label>{s.subject}<input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} /></label>
            <label>{s.body}<textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} /></label>
            <p className={`msg ${msg?.ok ? "ok" : "err"}`} role="status">{msg?.text}</p>
            <button className="btn primary" disabled={busy}>{s.send}</button>
          </form>
        </section>
        <section className="card glass s7">
          <h2>{s.list}</h2>
          {items && items.length === 0 && <p className="muted">{s.empty}</p>}
          {items?.map((x) => (
            <article key={x.id} className="ticket">
              <header><b>{x.subject}</b><span className={`tag ${x.status}`}>{s.status[x.status]}</span></header>
              <span className="muted" style={{ fontSize: ".82rem" }}>{date(x.created)}</span>
              <p>{x.body}</p>
              {x.reply && <div className="reply"><b style={{ fontSize: ".85rem" }}>{s.reply}</b><p>{x.reply}</p></div>}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
