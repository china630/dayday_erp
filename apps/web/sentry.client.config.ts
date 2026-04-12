import * as Sentry from "@sentry/nextjs";

/** Прокидывается в бандл при `next build` (Docker build args / NEXT_PUBLIC_SENTRY_DSN). */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (!dsn) {
  console.warn("Sentry DSN is missing in client config");
} else {
  Sentry.init({
    dsn,
    debug: true,
    environment:
      process.env.NODE_ENV === "development" ? "development" : "production",
    tracesSampleRate: 0.1,
  });
}
