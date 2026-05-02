"use client";

import { ReactNode } from "react";

type BadgeVariant =
  | "neutral"
  | "owner"
  | "admin"
  | "accountant"
  | "user"
  | "success";

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  neutral: "border-[#D5DADF] bg-[#EBEDF0] text-[#34495E]",
  owner: "border-[#2980B9]/30 bg-[#2980B9]/10 text-[#34495E]",
  admin: "border-[#34495E]/25 bg-[#34495E]/10 text-[#34495E]",
  accountant: "border-[#7F8C8D]/30 bg-[#7F8C8D]/10 text-[#34495E]",
  user: "border-[#D5DADF] bg-white text-[#34495E]",
  success:
    "border-green-600/20 bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20",
};

export function Badge({
  children,
  variant = "neutral",
  title,
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-[2px] border px-2 py-0.5 text-[11px] font-semibold leading-4 ${VARIANT_CLASS[variant]}`}
    >
      {children}
    </span>
  );
}

