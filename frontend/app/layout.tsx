import "@fontsource-variable/vazirmatn";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import Nav from "@/components/Nav";
import { dicts, getLocale } from "@/lib/i18n";
import { getMe } from "@/lib/api";

export const metadata: Metadata = {
  title: "خورشیدکارت · KhorshidCard",
  description: "Pay-as-you-go solar power for Iran",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

// Runs before paint so a saved theme never flashes the wrong colours.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const t = dicts[locale];
  const me = await getMe();
  return (
    <html lang={locale} dir={locale === "fa" ? "rtl" : "ltr"} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="aurora" aria-hidden="true"><i /><i /><i /></div>
        <Nav locale={locale} t={t} me={me} />
        {children}
        <footer>{t.footer}</footer>
      </body>
    </html>
  );
}
