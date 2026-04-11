import type { NextConfig } from "next";

const apiDest = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000").replace(
  /\/$/,
  "",
);

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

export default nextConfig;
