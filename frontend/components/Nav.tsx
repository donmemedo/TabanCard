"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Icon, { type IconName } from "./Icon";
import type { Dict, Locale } from "@/lib/i18n";
import type { Me } from "@/lib/fmt";

const order = ["system", "light", "dark"] as const;
type Theme = (typeof order)[number];

export default function Nav({ locale, t, me }: { locale: Locale; t: Dict; me: Me | null }) {
  const path = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try { setTheme((localStorage.getItem("theme") as Theme) || "system"); } catch {}
    // Spotlight that follows the pointer over any .card.
    const move = (e: PointerEvent) => {
      const card = (e.target as Element).closest?.(".card") as HTMLElement | null;
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    document.addEventListener("pointermove", move);
    return () => document.removeEventListener("pointermove", move);
  }, []);

  const cycleTheme = () => {
    const next = order[(order.indexOf(theme) + 1) % 3];
    setTheme(next);
    const root = document.documentElement;
    if (next === "system") delete root.dataset.theme; else root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
  };

  const toggleLang = () => {
    document.cookie = `lang=${locale === "fa" ? "en" : "fa"};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  };

  const logout = () => fetch("/api/auth/logout", { method: "POST" }).finally(() => { location.href = "/"; });

  const links: [string, string, IconName][] = [["/", t.nav.home, "home"]];
  if (me) {
    links.push(["/dashboard", t.nav.dashboard, "grid"], ["/support", t.nav.support, "chat"]);
    if (me.role === "admin") links.push(["/admin", t.nav.admin, "shield"]);
  } else links.push(["/login", t.auth.login, "user"]);
  const current = (href: string) => (path === href ? "page" : undefined);

  return (
    <>
      <nav className="nav glass">
        <Link href="/" className="logo"><b aria-hidden="true" />{t.brand}</Link>
        {links.map(([href, label]) => (
          <Link key={href} href={href} className="link" aria-current={current(href)}>{label}</Link>
        ))}
        <button className="chip-btn" onClick={cycleTheme} aria-label={t.theme[theme]} title={t.theme[theme]}>
          <Icon name={theme === "system" ? "auto" : theme === "light" ? "sun" : "moon"} size={18} />
          <span className="lbl">{t.theme[theme]}</span>
        </button>
        <button className="chip-btn" onClick={toggleLang} lang={locale === "fa" ? "en" : "fa"}>
          <Icon name="globe" size={18} />{locale === "fa" ? "EN" : "فا"}
        </button>
        {me && (
          <button className="chip-btn" onClick={logout} aria-label={t.auth.logout} title={t.auth.logout}>
            <span className="flip" style={{ display: "inline-flex" }}><Icon name="logout" size={18} /></span>
          </button>
        )}
      </nav>
      <nav className="tabbar glass" aria-label={t.brand}>
        {links.map(([href, label, icon]) => (
          <Link key={href} href={href} aria-current={current(href)}><Icon name={icon} size={22} />{label}</Link>
        ))}
      </nav>
    </>
  );
}
