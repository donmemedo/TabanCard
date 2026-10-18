import Admin from "@/components/Admin";
import { requireMe } from "@/lib/api";
import { dicts, getLocale } from "@/lib/i18n";

export default async function Page() {
  await requireMe("/admin", true);
  const locale = await getLocale();
  return <Admin locale={locale} t={dicts[locale]} />;
}
