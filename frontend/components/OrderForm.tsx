"use client";
import { useState } from "react";
import type { Dict, Locale } from "@/lib/i18n";
import { num, post, type Plan } from "@/lib/fmt";

export default function OrderForm({ locale, t, plans, initial, name: initialName }:
  { locale: Locale; t: Dict; plans: Plan[]; initial: string; name: string }) {
  const o = t.order;
  const [plan, setPlan] = useState(plans.some((p) => p.id === initial) ? initial : "standard");
  const [name, setName] = useState(initialName);
  const [province, setProvince] = useState("");
  const [address, setAddress] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const p = plans.find((x) => x.id === plan);
  const n = (v: number) => num(locale, v, 1);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!province || address.trim().length < 5) return setErr(t.dash.empty);
    setBusy(true); setErr("");
    try {
      const { r } = await post("/api/kit/order", { plan, province, address, name });
      if (r.ok || r.status === 409) location.href = "/dashboard";
      else setErr(t.dash.errGeneric);
    } catch { setErr(t.dash.errNet); }
    setBusy(false);
  };

  return (
    <section className="card glass reveal">
      <h1 className="title" style={{ fontSize: "clamp(1.8rem, 5vw, 2.4rem)", fontWeight: 900 }}>{o.title}</h1>
      <p className="muted">{o.sub}</p>
      <form className="form" onSubmit={submit} noValidate style={{ marginTop: 20 }}>
        <div className="seg" role="group" aria-label={t.calc.plan}>
          {plans.map((x) => (
            <button type="button" key={x.id} aria-pressed={x.id === plan} onClick={() => setPlan(x.id)}>{t.plans.names[x.id]}</button>
          ))}
        </div>
        {p && (
          <div className="banner good">
            {n(p.monthly)} {t.plans.unit} / {t.plans.monthly} · {t.plans.down} {n(p.down)} {t.plans.unit} · {t.plans.own} {n(p.months)} {t.plans.months}
          </div>
        )}
        <label>{t.auth.name}<input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>{o.province}
          <select className="input" value={province} onChange={(e) => setProvince(e.target.value)} required>
            <option value="" disabled>{o.choose}</option>
            {Object.entries(t.provinces).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label>{o.address}<textarea className="input" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} required /></label>
        <p className="msg err" role="status">{err}</p>
        <button className="btn primary" disabled={busy}>{o.submit}</button>
      </form>
    </section>
  );
}
