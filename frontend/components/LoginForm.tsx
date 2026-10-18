"use client";
import { useEffect, useState } from "react";
import type { Dict, Locale } from "@/lib/i18n";
import { digits, num, post } from "@/lib/fmt";

const DEMO_ACCOUNTS = [["customer", "09120000000"], ["admin", "09120000001"]] as const;

export default function LoginForm({ locale, t, next, demo }: { locale: Locale; t: Dict; next: string; demo: boolean }) {
  const a = t.auth;
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (!wait) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr("");
    try { await fn(); } catch { setErr(t.dash.errNet); }
    setBusy(false);
  };

  const send = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!phone.trim()) return setErr(t.dash.empty);
    run(async () => {
      const { r, j } = await post("/api/auth/otp", { phone });
      if (!r.ok) return setErr(r.status === 429 ? a.errWait : a.errPhone);
      setIsNew(j.is_new); setDemoCode(j.demo_code ?? null); setCode(""); setWait(60); setStep("code");
    });
  };

  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return setErr(t.dash.empty);
    run(async () => {
      const { r, j } = await post("/api/auth/verify", { phone, code, name: name.trim() || null });
      if (!r.ok) return setErr(r.status === 410 ? a.errExpired : a.errCode);
      location.href = j.role === "admin" && next === "/dashboard" ? "/admin" : next;
    });
  };

  return (
    <section className="card glass reveal">
      <h1 className="title" style={{ fontSize: "clamp(1.8rem, 5vw, 2.4rem)", fontWeight: 900 }}>{a.title}</h1>
      {step === "phone" ? (
        <form className="form" onSubmit={send} noValidate style={{ marginTop: 12 }}>
          <p className="muted">{a.sub}</p>
          <label>{a.phone}
            <input className="input" type="tel" inputMode="numeric" autoComplete="tel" dir="ltr" placeholder="09xx xxx xxxx"
              value={phone} onChange={(e) => { setPhone(e.target.value); setErr(""); }} aria-invalid={!!err || undefined} />
          </label>
          <p className="msg err" role="status">{err}</p>
          <button className="btn primary" disabled={busy}>{a.send}</button>
          {demo && (
            <div className="hint muted">{a.demoAccounts}:
              {DEMO_ACCOUNTS.map(([role, p]) => (
                <button type="button" key={p} className="chip-btn" onClick={() => setPhone(p)}>{a[role]} <span dir="ltr">{digits(locale, p)}</span></button>
              ))}
            </div>
          )}
        </form>
      ) : (
        <form className="form" onSubmit={verify} noValidate style={{ marginTop: 12 }}>
          <p className="muted">{a.codeSent} <b dir="ltr">{phone}</b> · <button type="button" className="link-btn" onClick={() => setStep("phone")}>{a.edit}</button></p>
          {demoCode && <div className="banner good">{a.demoCode}: <b dir="ltr" className="num">{demoCode}</b></div>}
          <label>{a.code}
            <input className="code-in" inputMode="numeric" autoComplete="one-time-code" maxLength={5} placeholder="•••••"
              value={code} onChange={(e) => { setCode(e.target.value); setErr(""); }} aria-invalid={!!err || undefined} autoFocus />
          </label>
          {isNew && <label>{a.name}<input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label>}
          <p className="msg err" role="status">{err}</p>
          <button className="btn primary" disabled={busy}>{a.verify}</button>
          <button type="button" className="btn ghost" disabled={busy || wait > 0} onClick={() => send()}>
            {wait > 0 ? `${a.resendIn} ${num(locale, wait)} ${a.sec}` : a.resend}
          </button>
        </form>
      )}
    </section>
  );
}
