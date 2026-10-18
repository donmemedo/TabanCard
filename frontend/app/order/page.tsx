import { redirect } from "next/navigation";
import OrderForm from "@/components/OrderForm";
import { getPlans, requireMe } from "@/lib/api";
import { dicts, getLocale } from "@/lib/i18n";

export default async function Page({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan = "" } = await searchParams;
  const me = await requireMe(`/order${plan ? `?plan=${plan}` : ""}`);
  if (me.kit) redirect("/dashboard");
  const locale = await getLocale();
  return (
    <main className="wrap narrow">
      <OrderForm locale={locale} t={dicts[locale]} plans={await getPlans()} initial={plan} name={me.name} />
    </main>
  );
}
