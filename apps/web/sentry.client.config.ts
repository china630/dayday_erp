import * as Sentry from "@sentry/nextjs";

/** Прокидывается в бандл при `next build` (Docker build args / NEXT_PUBLIC_SENTRY_DSN). */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (!dsn) {
  console.warn("Sentry DSN is missing in client config");
} else {
  Sentry.init({
    dsn,
    enabled: true,
    /** Редкий ложный срабатывание в встроенных WebView / расширениях отключает весь SDK. */
    skipBrowserExtensionCheck: true,
    debug: process.env.NEXT_PUBLIC_SENTRY_DEBUG === "1",
    environment:
      process.env.NODE_ENV === "development" ? "development" : "production",
    tracesSampleRate: 0.1,
  });
}
