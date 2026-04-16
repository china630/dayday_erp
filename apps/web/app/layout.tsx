import type { Metadata } from "next";
import "./globals.css";
import { cookies, headers } from "next/headers";
import { Providers } from "./providers";
import { AppShell } from "./app-shell";
import LoginPage from "./login/page";

/** SSR-заглушка; актуальный title/description по языку выставляет SeoHeadSync в Providers. */
export const metadata: Metadata = {
  title: "DayDay ERP",
  description: "SaaS accounting for businesses in Azerbaijan",
};
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const token = cookieStore.get("dayday_access_token")?.value;
  const pathname = headerStore.get("x-dayday-pathname") ?? "";
  const publicPath =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/register-org" ||
    pathname.startsWith("/verify/");

  return (
    <html lang="ru" suppressHydrationWarning>
      <body style={{ fontFamily: "system-ui", margin: 0 }}>
        <Providers>
          {!token && !publicPath ? <LoginPage /> : <AppShell>{children}</AppShell>}
        </Providers>
      </body>
    </html>
  );
}
