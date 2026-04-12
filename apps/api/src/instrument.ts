/**
 * Загружается до NestFactory (см. main.ts). Локально задайте SENTRY_DSN_API в shell или через
 * `dotenv -e .env -- npm run start:dev -w @dayday/api` из корня монорепо.
 */
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import * as Sentry from "@sentry/nestjs";

const dsn = process.env.SENTRY_DSN_API?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: 0.1,
    profilesSampleRate: 0.1,
  });
}
