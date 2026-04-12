import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NODE_ENV === "development" ? "development" : "production",
    tracesSampleRate: 0.1,
  });
}
