"use client";

import { useEffect } from "react";

/**
 * App Router `global-error` must not use `next/error` (`NextError`) — that is for the Pages Router
 * and can throw "Objects are not valid as a React child" (#31) during static prerender of /500.
 *
 * Без `@sentry/nextjs` здесь: иначе в клиентский чанк попадает `@sentry/node` → prisma-instrumentation.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
}) {
  useEffect(() => {
    // Ошибку логируем в консоль; Sentry для global-error отключён из-за тяжёлой
    // server-цепочки (prisma-instrumentation), которая тянется в клиентский бандл.
    console.error(error);
  }, [error]);

  const message = typeof error?.message === "string" ? error.message : "";
  const digest = error?.digest != null ? String(error.digest) : "";

  return (
    <html lang="ru">
      <body className="m-0 min-h-screen bg-white p-8 font-sans text-slate-900">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        {message ? <p className="mt-2 text-sm text-slate-600">{message}</p> : null}
        {digest ? <p className="mt-1 text-xs text-slate-500">Digest: {digest}</p> : null}
        <button
          type="button"
          className="mt-4 rounded border border-slate-300 bg-white px-3 py-2 text-sm"
          onClick={() => reset?.()}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
