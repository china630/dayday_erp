import * as Sentry from "@sentry/nextjs";

/**
 * Клиентская инициализация Sentry (ранее `sentry.client.config.ts`).
 * Next.js 15+ / Turbopack: см. https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (!dsn) {
  console.warn("Sentry DSN is missing in client instrumentation");
} else {
  Sentry.init({
    dsn,
    enabled: true,
    /** Редкий ложный срабатывание в встроенных WebView / расширениях отключает весь SDK. */
    skipBrowserExtensionCheck: true,
    debug: false,
    environment:
      process.env.NODE_ENV === "development" ? "development" : "production",
    tracesSampleRate: 0.1,
  });
}

/** Навигация App Router → транзакции / breadcrumbs в Sentry. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
