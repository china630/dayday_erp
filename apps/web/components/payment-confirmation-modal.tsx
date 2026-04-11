"use client";

import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "../lib/design-system";

type Mode = "enable" | "disable";

export function PaymentConfirmationModal(props: {
  open: boolean;
  mode: Mode;
  monthlyAzn: string;
  proRataAzn: string;
  onClose: () => void;
  onConfirmPay: () => void;
  confirmDisabled?: boolean;
  extra?: ReactNode;
}) {
  const { t } = useTranslation();
  if (!props.open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-confirm-title"
    >
      <div className={`${CARD_CONTAINER_CLASS} max-w-md w-full p-6 space-y-4`}>
        <h2
          id="payment-confirm-title"
          className="text-lg font-semibold text-[#34495E]"
        >
          {props.mode === "enable"
            ? t("billing.subscription.confirmEnableTitle")
            : t("billing.subscription.confirmDisableTitle")}
        </h2>

        {props.mode === "enable" ? (
          <p className="text-[13px] text-[#34495E] leading-relaxed">
            {t("billing.subscription.proRataExplain", {
              monthly: props.monthlyAzn,
              prorata: props.proRataAzn,
            })}
          </p>
        ) : (
          <div className="flex gap-3 rounded-[2px] border border-amber-200 bg-amber-50/90 p-3 text-[13px] text-amber-950">
            <AlertTriangle
              className="h-5 w-5 shrink-0 text-amber-700"
              aria-hidden
            />
            <p>{t("billing.subscription.disableWarning")}</p>
          </div>
        )}

        {props.extra}
        <div className="flex flex-wrap gap-3 justify-end pt-2">
          <button
            type="button"
            className="rounded-[2px] border border-[#D5DADF] bg-white px-4 py-2 text-[13px] font-medium text-[#34495E] hover:bg-[#F8F9FA]"
            onClick={props.onClose}
          >
            {t("common.cancel")}
          </button>
          {props.mode === "enable" ? (
            <button
              type="button"
              className={PRIMARY_BUTTON_CLASS}
              disabled={props.confirmDisabled}
              onClick={props.onConfirmPay}
            >
              {t("billing.subscription.payButtonAz")}
            </button>
          ) : (
            <button
              type="button"
              className="rounded-[2px] border border-red-200 bg-red-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-red-700"
              onClick={props.onConfirmPay}
            >
              {t("billing.subscription.confirmDisableAz")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
