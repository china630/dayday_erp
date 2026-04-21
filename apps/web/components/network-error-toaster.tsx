"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

const MSG =
  "Сервер DayDay временно недоступен. Проверьте интернет-соединение";

function isFetchNetworkTypeError(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false;
  const msg = (err.message ?? "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("error in input stream")
  );
}

/**
 * Global network error handler for fetch() failures surfaced as unhandled rejections.
 *
 * Goal: avoid cryptic "TypeError: Failed to fetch" / "NetworkError ..." in monitoring and show
 * a user-friendly message.
 */
export function NetworkErrorToaster() {
  const lastShownAt = useRef<number>(0);

  useEffect(() => {
    const maybeShow = (err: unknown) => {
      if (!isFetchNetworkTypeError(err)) return;
      const now = Date.now();
      // Debounce bursts (RSC + multiple API calls).
      if (now - lastShownAt.current < 10_000) return;
      lastShownAt.current = now;
      toast.error(MSG, { duration: 8000 });
    };

    const onUnhandledRejection = (ev: PromiseRejectionEvent) => {
      maybeShow(ev.reason);
    };

    // Some environments surface network errors on window "error".
    const onError = (ev: ErrorEvent) => {
      maybeShow(ev.error ?? new TypeError(ev.message));
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}

