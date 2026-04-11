"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type ApiErrorDetail = {
  status: number;
  message: string;
};

/**
 * Слушает глобальные ошибки API (событие из {@link ../lib/api-client}) и показывает Sonner-toast.
 */
export function ApiErrorToaster() {
  const { t } = useTranslation();

  useEffect(() => {
    const onErr = (ev: Event) => {
      const e = ev as CustomEvent<ApiErrorDetail>;
      const d = e.detail;
      if (!d || typeof d.message !== "string") return;
      toast.error(t("common.apiErrorTitle"), {
        description: `${d.status}: ${d.message}`,
        duration: 8000,
      });
    };
    window.addEventListener("dayday:api-error", onErr);
    return () => window.removeEventListener("dayday:api-error", onErr);
  }, [t]);

  return null;
}
