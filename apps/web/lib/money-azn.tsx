"use client";

import { formatMoneyAzn } from "./format-money";
import type { ReactNode } from "react";

function splitAznSymbol(formatted: string): { amount: string; symbol: ReactNode } {
  // formatMoneyAzn returns: "<number> ₼"
  const m = formatted.match(/^(.*?)(\s)₼$/);
  if (!m) {
    return {
      amount: formatted,
      symbol: (
        <span className="text-accent font-semibold text-lg align-middle">₼</span>
      ),
    };
  }
  return {
    amount: m[1].trim(),
    symbol: (
      <span className="text-accent font-semibold text-lg align-middle">₼</span>
    ),
  };
}

export function MoneyAzn(props: { value: unknown; className?: string }) {
  const formatted = formatMoneyAzn(props.value);
  const { amount, symbol } = splitAznSymbol(formatted);

  return (
    <span className={props.className ?? ""}>
      {amount} {symbol}
    </span>
  );
}

