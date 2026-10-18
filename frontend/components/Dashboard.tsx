"use client";
import { useCallback, useEffect, useState } from "react";
import type { Dict, Locale } from "@/lib/i18n";
import { dateTag, num, pct, post, type Kit, type Me } from "@/lib/fmt";

type Device = Kit & { active: boolean; battery: number; solar_w: number; load_w: number; temp_c: number; co2_saved_kg: number };
type Tx = { id: number; at: string; weeks: number; amount: number; code: string };

const C = 2 * Math.PI * 110;
const toAscii = (v: string) =>
  v.replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
const fmtCode = (v: string) => toAscii(v).replace(/\D/g, "").slice(0, 12).replace(/(\d{4})(?=\d)/g, "$1-");
const COLORS = ["#ffd60a", "#ff9f0a", "#ff453a", "#30d158", "#0a84ff", "#bf5af2"];

export default function Dashboard({ locale, t, me }: { locale: Locale; t: Dict; me: Me }) {
  const d = t.dash;
  const n = (v: number, dg = 0) => num(locale, v, dg);
  const [dev, setDev] = useState<Device | null>(null);
  const [at, setAt] = useState(0);
  const [now, setNow] = useState(0);
  const [energy, setEnergy] = useState<{ date: string; kwh: number }[]>([]);
  const [tx, setTx] = useState<Tx[]>([]);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/device", { cache: "no-store" });
      if (r.ok) { setDev(await r.json()); setAt(Date.now()); }
    } catch {}
  }, []);

  useEffect(() => {
    load();
    fetch("/api/energy").then((r) => r.json()).then(setEnergy).catch(() => {});
    fetch("/api/transactions").then((r) => r.json()).then(setTx).catch(() => {});
    const poll = setInterval(load, 4000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    setNow(Date.now());
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [load]);

  const owned = dev?.status === "owned";
  const left = dev ? Math.max(dev.credit_seconds - Math.max(now - at, 0) / 1000, 0) : 0;
  const parts: [number, string][] = [
    [Math.floor(left / 86400), d.d], [Math.floor(left / 3600) % 24, d.h],
    [Math.floor(left / 60) % 60, d.m], [Math.floor(left) % 60, d.s],
  ];
  const banner = !dev ? null : owned ? ["good", d.ownedMsg] : !left ? ["bad", d.expiredMsg] : left < 2 * 86400 ? ["warn", d.lowCredit] : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return setMsg({ ok: false, text: d.empty });
    setBusy(true);
    try {
      const { r, j } = await post("/api/topup", { code });
      if (r.ok) {
        setTx((x) => [j.tx, ...x]);
        setCode(""); setMsg({ ok: true, text: d.ok }); setBurst(Date.now());
        setTimeout(() => setBurst(0), 1200);
        load();
      } else {
        const text = r.status === 429 ? d.errTooMany : j.detail === "used_code" ? d.errUsed : j.detail === "invalid_code" ? d.errInvalid : d.errGeneric;
        setMsg({ ok: false, text });
      }
    } catch { setMsg({ ok: false, text: d.errNet }); }
    setBusy(false);
  };

  const demo = async (weeks: number) => {
    try { const { j } = await post("/api/demo-code", { weeks }); setCode(fmtCode(j.code)); setMsg(null); }
    catch { setMsg({ ok: false, text: d.errNet }); }
  };

  const fa = locale === "fa";
  const P = fa ? [320, 180, 40] : [40, 180, 320];
  const s = fa ? -1 : 1;
  const wire = (a: number, b: number) => `M${a + 30 * s} 50 L${b - 30 * s} 50`;
  const maxK = Math.max(...energy.map((e) => e.kwh), 1);
  const tag = dateTag(locale);
  const months = me.kit?.plan.months ?? 1;
  const paid = dev?.months_paid ?? me.kit?.months_paid ?? 0;

  return (
    <main className="wrap">
      <div className="dash-head">
        <div>
          <p className="eyebrow">{me.name || me.phone}{dev && ` · ${d.serial} ${dev.serial}`}</p>
          <h1>{d.title}</h1>
        </div>
        {dev && <span className={`status${dev.active ? "" : " off"}`}><i />{t.status[dev.status]}</span>}
      </div>

      <div className="dash">
        {banner && <div className={`banner ${banner[0]} s12`} role="status">{banner[1]}</div>}

        <section className="card glass s5" aria-label={d.battery}>
          <div className="ring-wrap">
            <svg className="ring" viewBox="0 0 260 260" aria-hidden="true">
              <defs>
                <linearGradient id="rg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#30d158" /><stop offset="1" stopColor="#ffd60a" />
                </linearGradient>
              </defs>
              <circle className="track" cx="130" cy="130" r="110" />
              <circle className="val" cx="130" cy="130" r="110" stroke="url(#rg)"
                strokeDasharray={C} strokeDashoffset={C * (1 - (dev?.battery ?? 0) / 100)} />
            </svg>
            <div className="ring-label">
              <strong className="num">{dev ? pct(locale, dev.battery) : "—"}</strong>
              <span className="muted">{dev ? d.battery : d.offline}</span>
            </div>
          </div>
          {owned ? <p className="big shine" style={{ textAlign: "center", marginTop: 18 }}>∞</p> : (
            <>
              <p className="muted" style={{ marginTop: 18 }}>{d.left}</p>
              <div className="countdown" aria-live="off">
                {parts.map(([v, l]) => <div key={l}><strong className="num">{n(v)}</strong><span>{l}</span></div>)}
              </div>
            </>
          )}
        </section>

        <section className="card glass s7">
          <div className="tiles">
            <div className="tile"><span className="muted">☀ {d.solar}</span><strong className="num">{n(dev?.solar_w ?? 0)} <small>W</small></strong></div>
            <div className="tile"><span className="muted">⚡ {d.load}</span><strong className="num">{n(dev?.load_w ?? 0)} <small>W</small></strong></div>
            <div className="tile"><span className="muted">🌡 {d.temp}</span><strong className="num">{n(dev?.temp_c ?? 0, 1)} <small>°C</small></strong></div>
            <div className="tile"><span className="muted">🌿 {d.co2}</span><strong className="num">{n(dev?.co2_saved_kg ?? 0)} <small>{d.kg}</small></strong></div>
          </div>
          <h2 style={{ marginTop: 22 }}>{d.flow}</h2>
          <svg className="flow" viewBox="0 0 360 100" role="img" aria-label={d.flow}>
            <path className="wire" d={wire(P[0], P[1])} />
            <path className="wire" d={wire(P[1], P[2])} />
            {!!dev?.solar_w && <path className="pulse" d={wire(P[0], P[1])} />}
            {!!dev?.active && !!dev.load_w && <path className="pulse g" d={wire(P[1], P[2])} />}
            {[["☀", d.panel], ["🔋", d.battery], ["🏠", d.home]].map(([ic, l], i) => (
              <g key={l}>
                <circle className="node" cx={P[i]} cy={50} r={28} />
                <text x={P[i]} y={57} style={{ fontSize: 20 }}>{ic}</text>
                <text x={P[i]} y={97}>{l}</text>
              </g>
            ))}
          </svg>
        </section>

        <section className="card glass s8">
          <h2>{d.week} <span className="muted" style={{ fontWeight: 500 }}>({d.kwh})</span></h2>
          <div className="bars">
            {energy.map((e, i) => (
              <div key={e.date}>
                <em className="num">{n(e.kwh, 1)}</em>
                <b style={{ height: `${(e.kwh / maxK) * 72}%`, animationDelay: `${i * 70}ms` }} />
                <span>{new Date(`${e.date}T12:00`).toLocaleDateString(tag, { weekday: "short" })}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card glass s4">
          <h2>{d.own}</h2>
          <div className="big num shine">{pct(locale, Math.round((paid / months) * 100))}</div>
          <div className="progress"><b style={{ width: `${(paid / months) * 100}%` }} /></div>
          <p className="muted">{n(paid)} {d.ownOf} {n(months)} {d.ownMonths} · {me.kit && t.plans.names[me.kit.plan.id]}</p>
        </section>

        {!owned && (
          <section className="card glass s5">
            <h2>{d.topup}</h2>
            <form onSubmit={submit} noValidate>
              <label htmlFor="code" className="muted" style={{ display: "block", marginBottom: 8 }}>{d.codeLabel}</label>
              <input id="code" className="code-in" inputMode="numeric" autoComplete="off" placeholder="0000-0000-0000"
                value={code} onChange={(e) => { setCode(fmtCode(e.target.value)); setMsg(null); }}
                aria-invalid={msg ? !msg.ok : undefined} aria-describedby="code-msg" />
              <p id="code-msg" className={`msg ${msg?.ok ? "ok" : "err"}`} role="status">{msg?.text}</p>
              <button className="btn primary" disabled={busy} style={{ width: "100%" }}>{d.submit}</button>
              {me.demo && (
                <div className="hint muted">{d.demoCards}:
                  {[1, 2, 4].map((w) => <button type="button" key={w} className="chip-btn" onClick={() => demo(w)}>{n(w)} {d.wk}</button>)}
                </div>
              )}
            </form>
          </section>
        )}

        <section className={`card glass ${owned ? "s12" : "s7"}`}>
          <h2>{d.history}</h2>
          {tx.length === 0 ? <p className="muted">{d.noTx}</p> : (
            <ul className="tx">
              {tx.map((x) => (
                <li key={x.id}>
                  <div>
                    <b>+{n(x.weeks)} {d.wk}</b>
                    <div className="muted" style={{ fontSize: ".85rem" }}>
                      {new Date(x.at).toLocaleString(tag, { dateStyle: "medium", timeStyle: "short" })} · <span dir="ltr">{x.code}</span>
                    </div>
                  </div>
                  <b className="num">{n(x.amount, 2)} {t.plans.unit}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {burst > 0 && (
        <div className="burst" aria-hidden="true">
          {Array.from({ length: 36 }, (_, i) => {
            const a = (i / 36) * Math.PI * 2, r = 160 + (i % 5) * 50;
            return <i key={i} style={{ background: COLORS[i % 6], "--x": `${Math.cos(a) * r}px`, "--y": `${Math.sin(a) * r}px` } as React.CSSProperties} />;
          })}
        </div>
      )}
    </main>
  );
}
