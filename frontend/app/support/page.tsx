import Support from "@/components/Support";
import { requireMe } from "@/lib/api";
import { dicts, getLocale } from "@/lib/i18n";

export default async function Page() {
  await requireMe("/support");
  const locale = await getLocale();
  return <Support locale={locale} t={dicts[locale]} />;
}
