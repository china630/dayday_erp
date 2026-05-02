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
  /** Обратная совместимость закладок и внешних ссылок после реорганизации меню (1C/SAP-иерархия). */
  async redirects() {
    return [
      { source: "/invoices", destination: "/sales/invoices", permanent: true },
      { source: "/invoices/:path*", destination: "/sales/invoices/:path*", permanent: true },
      { source: "/reporting/reconciliation", destination: "/sales/reconciliation", permanent: true },
      { source: "/inventory/purchase", destination: "/purchases", permanent: true },
      { source: "/counterparties", destination: "/crm/counterparties", permanent: true },
      { source: "/counterparties/:path*", destination: "/crm/counterparties/:path*", permanent: true },
      { source: "/products", destination: "/catalog/products", permanent: true },
      { source: "/manufacturing/recipe", destination: "/manufacturing/recipes", permanent: true },
      { source: "/manufacturing/recipe/:path*", destination: "/manufacturing/recipes/:path*", permanent: true },
      { source: "/manufacturing/release", destination: "/manufacturing/releases", permanent: true },
      { source: "/manufacturing/release/:path*", destination: "/manufacturing/releases/:path*", permanent: true },
      { source: "/settings/mapping", destination: "/accounting/mapping", permanent: true },
      { source: "/settings/chart", destination: "/accounting/chart", permanent: true },
      { source: "/settings/finance/ifrs-mapping", destination: "/accounting/ifrs-mapping", permanent: true },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT_WEB,
  tunnelRoute: resolveSentryTunnelRoute(),
  silent: !(
    process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT_WEB
  ),
  widenClientFileUpload: true,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
