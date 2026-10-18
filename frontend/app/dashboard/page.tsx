import Link from "next/link";
import Dashboard from "@/components/Dashboard";
import { requireMe } from "@/lib/api";
import { dicts, getLocale } from "@/lib/i18n";

export default async function Page() {
  const me = await requireMe("/dashboard");
  const locale = await getLocale();
  const t = dicts[locale];
  const k = t.kit;

  if (!me.kit) {
    return (
      <main className="wrap narrow">
        <section className="card glass reveal" style={{ textAlign: "center" }}>
          <div className="sun" aria-hidden="true" style={{ width: 160, order: 0 }}><div className="halo" /><div className="core" /></div>
          <h1 className="title" style={{ fontSize: "clamp(1.6rem, 5vw, 2.2rem)" }}>{k.noneTitle}</h1>
          <p className="muted" style={{ marginBottom: 24 }}>{k.noneSub}</p>
          <Link className="btn primary" href="/#plans">{k.noneCta}</Link>
        </section>
      </main>
    );
  }

  if (me.kit.status === "pending") {
    return (
      <main className="wrap narrow">
        <section className="card glass reveal">
          <p className="eyebrow">{t.dash.serial} {me.kit.serial} · {t.plans.names[me.kit.plan.id]}</p>
          <h1 className="title" style={{ fontSize: "clamp(1.6rem, 5vw, 2.2rem)" }}>{k.pendingTitle}</h1>
          <p className="muted">{k.pendingSub}</p>
          <ol className="steps">
            {k.steps.map((s, i) => <li key={s} className={i === 0 ? "done" : i === 1 ? "now" : ""}>{s}</li>)}
          </ol>
          <Link className="btn ghost" href="/support" style={{ marginTop: 16 }}>{t.nav.support}</Link>
        </section>
      </main>
    );
  }

  return <Dashboard locale={locale} t={t} me={me} />;
}
