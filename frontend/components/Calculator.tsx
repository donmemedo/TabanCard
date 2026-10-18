"use client";
import { useState } from "react";
import type { Dict, Locale } from "@/lib/i18n";
import { num, type Plan } from "@/lib/fmt";

// ponytail: rough generator assumptions (million toman, litres/hour), shown to users in calc.note.
const GEN: Record<string, { buy: number; lph: number; upkeep: number }> = {
  basic: { buy: 18, lph: 0.5, upkeep: 0.4 },
  standard: { buy: 28, lph: 0.8, upkeep: 0.6 },
  business: { buy: 55, lph: 1.4, upkeep: 1.0 },
};
const MONTHS = 120;
const KIT_UPKEEP = 0.15;
const W = 600, H = 240;

export default function Calculator({ plans, locale, t }: { plans: Plan[]; locale: Locale; t: Dict }) {
  const [planId, setPlanId] = useState("standard");
  const [hours, setHours] = useState(6);
  const [fuel, setFuel] = useState(5000);
  const p = plans.find((x) => x.id === planId) ?? plans[0];
  const g = GEN[p.id] ?? GEN.standard;
  const genMonthly = (hours * 30 * g.lph * fuel) / 1e6 + g.upkeep;

  const gen: number[] = [], solar: number[] = [];
  for (let m = 0; m <= MONTHS; m++) {
    gen.push(g.buy * (1 + Math.floor(m / 60)) + m * genMonthly);
    solar.push(p.down + Math.min(m, p.months) * p.monthly + Math.max(m - p.months, 0) * KIT_UPKEEP);
  }
  // Break-even = first month after which solar stays cheaper for good.
  let be = 0;
  solar.forEach((s, m) => { if (s > gen[m]) be = m + 1; });
  const diff = gen[MONTHS] - solar[MONTHS];
  const max = Math.max(gen[MONTHS], solar[MONTHS]) * 1.08;
  const rtl = locale === "fa";
  const x = (m: number) => (rtl ? W - (m / MONTHS) * W : (m / MONTHS) * W);
  const y = (v: number) => H - (v / max) * H;
  const line = (a: number[]) => a.map((v, m) => `${m ? "L" : "M"}${x(m).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  const n = (v: number, d = 0) => num(locale, v, d);

  return (
    <div className="calc">
      <div className="card glass reveal">
        <div className="field">
          <label>{t.calc.plan}</label>
          <div className="seg" role="group" aria-label={t.calc.plan}>
            {plans.map((x) => (
              <button key={x.id} aria-pressed={x.id === p.id} onClick={() => setPlanId(x.id)}>{t.plans.names[x.id]}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="hours">{t.calc.hours}<b className="num">{n(hours)}</b></label>
          <input id="hours" type="range" min={1} max={16} value={hours} onChange={(e) => setHours(+e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="fuel">{t.calc.fuel}<b className="num">{n(fuel)}</b></label>
          <input id="fuel" type="range" min={1500} max={15000} step={500} value={fuel} onChange={(e) => setFuel(+e.target.value)} />
        </div>
        <p className="muted" style={{ fontSize: ".85rem" }}>{t.calc.note}</p>
      </div>

      <div className="card glass reveal">
        <p className="muted">{diff >= 0 ? t.calc.save : t.calc.more}</p>
        <div className={`big num ${diff >= 0 ? "shine" : ""}`}>{n(Math.abs(diff))} <small style={{ fontSize: "1.1rem" }}>{t.plans.unit}</small></div>
        <p className="muted">{t.calc.breakeven}: <b>{be > MONTHS ? t.calc.never : `${n(be)} ${t.calc.month}`}</b></p>
        <div className="legend">
          <span><i style={{ background: "var(--ember)" }} />{t.calc.gen}</span>
          <span><i style={{ background: "var(--green)" }} />{t.calc.solar}</span>
        </div>
        <svg className="chart" viewBox={`0 -10 ${W} ${H + 34}`} role="img" aria-label={`${t.calc.gen} / ${t.calc.solar}`}>
          {[0, 2, 4, 6, 8, 10].map((yr) => (
            <g key={yr}>
              <line className="grid" x1={x(yr * 12)} x2={x(yr * 12)} y1={0} y2={H} />
              <text x={x(yr * 12)} y={H + 20} textAnchor="middle">{n(yr)} {t.calc.year}</text>
            </g>
          ))}
          <path key={`g${p.id}`} className="draw" pathLength={1} d={line(gen)} fill="none" stroke="var(--ember)" strokeWidth={3} strokeLinecap="round" />
          <path key={`s${p.id}`} className="draw" pathLength={1} d={line(solar)} fill="none" stroke="var(--green)" strokeWidth={4} strokeLinecap="round" />
          {be > 0 && be <= MONTHS && <circle cx={x(be)} cy={y(solar[be])} r={7} fill="var(--green)" stroke="var(--bg-2)" strokeWidth={3} />}
        </svg>
      </div>
    </div>
  );
}
