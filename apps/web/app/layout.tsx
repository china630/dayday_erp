import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "./app-shell";

/** SSR-заглушка; актуальный title/description по языку выставляет SeoHeadSync в Providers. */
export const metadata: Metadata = {
  title: "DayDay ERP",
  description: "SaaS accounting for businesses in Azerbaijan",
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body style={{ fontFamily: "system-ui", margin: 0 }}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
