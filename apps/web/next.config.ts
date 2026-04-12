import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const apiDest = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000").replace(
  /\/$/,
  "",
);

/** Проксирование событий через тот же origin (обход adblock / фильтров по ingest.sentry.io). См. tunnel.js в @sentry/nextjs. */
function resolveSentryTunnelRoute(): string | boolean | undefined {
  const raw = process.env.SENTRY_TUNNEL_PATH?.trim();
  if (raw === "" || raw === "0" || raw?.toLowerCase() === "false") {
    return undefined;
  }
  if (raw) {
    return raw.startsWith("/") ? raw : `/${raw}`;
  }
  return true;
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** Клиент ходит на тот же origin (`/api/...`), Next проксирует на бэкенд — меньше проблем с CORS и блокировками. */
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiDest}/api/:path*`,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT_WEB,
  // По умолчанию включён: resolveSentryTunnelRoute() → true (случайный путь), пока SENTRY_TUNNEL_PATH не false/0.
  tunnelRoute: resolveSentryTunnelRoute(),
  // При наличии токена показываем логи плагина (upload source maps); без токена — тише.
  silent: !(
    process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT_WEB
  ),
  widenClientFileUpload: true,
  // В @sentry/nextjs v10 нет `hideSourceMaps` в типах (устарело). Клиентские .map после upload
  // удаляются через deleteSourcemapsAfterUpload; «hidden» source maps задаёт сам плагин.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
