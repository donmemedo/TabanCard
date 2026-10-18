export type Plan = {
  id: string; watts: number; battery_kwh: number; lamps: number;
  down: number; monthly: number; months: number;
};

export const num = (locale: string, n: number, digits = 0) =>
  new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { maximumFractionDigits: digits }).format(n);

export const pct = (locale: string, n: number) =>
  new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { style: "percent" }).format(n / 100);

export type Kit = {
  serial: string; plan: Plan; status: "pending" | "active" | "expired" | "owned";
  credit_seconds: number; months_paid: number; created: string; installed: string | null;
};
export type Me = { id: number; phone: string; name: string; role: "customer" | "admin"; province: string | null; kit: Kit | null; demo: boolean };
export type Ticket = { id: number; subject: string; body: string; status: string; reply: string | null; created: string; updated: string };

export const dateTag = (locale: string) => (locale === "fa" ? "fa-IR" : "en-US");

export async function post(url: string, body: unknown, method = "POST") {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { r, j: await r.json().catch(() => ({})) };
}

export const digits = (locale: string, s: string) => (locale === "fa" ? s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]) : s);
