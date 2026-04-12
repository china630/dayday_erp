import * as Sentry from "@sentry/nextjs";

/** Прокидывается в бандл при `next build` (Docker build args / NEXT_PUBLIC_SENTRY_DSN). */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  });
}
