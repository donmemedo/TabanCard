import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { BACKEND, getMe } from "@/lib/api";
import { dicts, getLocale } from "@/lib/i18n";

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: raw } = await searchParams;
  // Only same-site paths: blocks open redirects like //evil.com or /\evil.com.
  const next = raw && /^\/(?![\\/])/.test(raw) ? raw : "/dashboard";
  const me = await getMe();
  if (me) redirect(me.role === "admin" && next === "/dashboard" ? "/admin" : next);
  const locale = await getLocale();
  const demo = await fetch(`${BACKEND}/api/health`, { cache: "no-store" }).then((r) => r.json()).then((j) => !!j.demo).catch(() => false);
  return (
    <main className="wrap narrow">
      <LoginForm locale={locale} t={dicts[locale]} next={next} demo={demo} />
    </main>
  );
}
