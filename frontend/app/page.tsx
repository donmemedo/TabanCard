import Link from "next/link";
import Calculator from "@/components/Calculator";
import Icon from "@/components/Icon";
import { dicts, getLocale } from "@/lib/i18n";
import { num, pct } from "@/lib/fmt";
import { getPlans } from "@/lib/api";

const featureIcons = [["bolt", ""], ["pulse", "blue"], ["card", "green"], ["tool", "pink"]] as const;

export default async function Home() {
  const locale = await getLocale();
  const t = dicts[locale];
  const plans = await getPlans();
  const n = (x: number, d = 1) => num(locale, x, d);

  return (
    <main>
      <div className="wrap hero">
        <div>
          <p className="eyebrow">{t.hero.eyebrow}</p>
          <h1 className="display">{t.hero.title1}<br /><span className="shine">{t.hero.title2}</span></h1>
          <p className="lead">{t.hero.sub}</p>
          <div className="actions">
            <Link className="btn primary" href="/dashboard"><Icon name="bolt" />{t.hero.cta}</Link>
            <a className="btn ghost" href="#plans">{t.hero.cta2}</a>
          </div>
          <div className="stats">
            {t.hero.stats.map(([v, l]) => <div key={l}><strong className="shine">{v}</strong><span>{l}</span></div>)}
          </div>
        </div>
        <div className="sun" aria-hidden="true">
          <div className="halo" /><div className="rays" /><div className="core" />
          <div className="orbit">
            <span className="pill glass" dir="ltr">☀ {n(842)} W</span>
            <span className="pill glass">🔋 {pct(locale, 86)}</span>
            <span className="pill glass">⚡ {n(7)} {t.dash.d}</span>
          </div>
        </div>
      </div>

      <section className="wrap" id="features">
        <h2 className="title reveal">{t.features.title}</h2>
        <div className="bento">
          {t.features.items.map(([title, body], i) => (
            <article key={title} className="card glass reveal">
              <div className={`ico ${featureIcons[i][1]}`}><Icon name={featureIcons[i][0]} size={26} /></div>
              <h3>{title}</h3>
              <p className="muted">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="wrap" id="plans">
        <h2 className="title reveal">{t.plans.title}</h2>
        <p className="lead reveal">{t.plans.sub}</p>
        <div className="plans">
          {plans.map((p) => (
            <article key={p.id} className={`card glass plan reveal${p.id === "standard" ? " pop" : ""}`}>
              {p.id === "standard" && <span className="badge">{t.plans.popular}</span>}
              <h3>{t.plans.names[p.id]}</h3>
              <p className="muted">{t.plans.desc[p.id]}</p>
              <div className="price num">{n(p.monthly)} <small>{t.plans.unit} / {t.plans.monthly}</small></div>
              <p className="muted">{t.plans.down} {n(p.down)} {t.plans.unit} · {t.plans.own} {n(p.months)} {t.plans.months}</p>
              <ul className="specs">
                <li><span className="muted">{t.plans.panel}</span><b>{n(p.watts)} W</b></li>
                <li><span className="muted">{t.plans.battery}</span><b>{n(p.battery_kwh)} kWh</b></li>
                <li><span className="muted">{t.plans.lamps}</span><b>{n(p.lamps)}</b></li>
              </ul>
              <Link href={`/order?plan=${p.id}`} className={`btn ${p.id === "standard" ? "primary" : "ghost"}`}>{t.plans.choose}</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="wrap" id="calc">
        <h2 className="title reveal">{t.calc.title}</h2>
        <p className="lead reveal">{t.calc.sub}</p>
        {plans.length > 0 && <Calculator plans={plans} locale={locale} t={t} />}
      </section>
    </main>
  );
}
