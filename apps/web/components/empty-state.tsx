"use client";

import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Компактный вид для строк таблиц и виджетов (v11 Dashboard). */
  compact?: boolean;
};

/**
 * Единый пустой экран для таблиц и списков (Production Polish).
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className = "",
  compact = false,
}: EmptyStateProps) {
  const box = compact
    ? "px-4 py-5 border-dashed bg-[#EBEDF0]/60 text-center"
    : "px-6 py-12 text-center border-dashed bg-white shadow-sm";
  const iconWrap = compact ? "mb-2" : "mb-3";
  const defaultIcon = compact ? (
    <Inbox className="h-6 w-6 mx-auto stroke-[1.5]" />
  ) : (
    <Inbox className="h-12 w-12 mx-auto stroke-[1.5]" />
  );
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-[2px] border border-[#D5DADF] ${box} ${className}`}
    >
      <div className={`${iconWrap} text-[#62707E]`} aria-hidden>
        {icon ?? defaultIcon}
      </div>
      <p
        className={
          compact
            ? "text-[12px] font-semibold text-[#34495E]"
            : "text-[13px] font-semibold text-[#34495E]"
        }
      >
        {title}
      </p>
      {description ? (
        <p
          className={
            compact
              ? "mt-1 max-w-md text-center text-[12px] leading-snug text-[#5D6D7E]"
              : "mt-2 max-w-md text-[13px] leading-snug text-[#5D6D7E]"
          }
        >
          {description}
        </p>
      ) : null}
      {action ? <div className={compact ? "mt-3" : "mt-6"}>{action}</div> : null}
    </div>
  );
}
