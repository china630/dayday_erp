"use client";

import {
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "../../lib/currencies";
import { Select, SelectContent, SelectItem, SelectTrigger } from "./select";

type CurrencySelectProps = {
  value: string;
  onValueChange: (v: SupportedCurrency) => void;
  className?: string;
  disabled?: boolean;
  name?: string;
  id?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-label"?: string;
};

/** Выпадающий список валют из {@link SUPPORTED_CURRENCIES}; по умолчанию родитель задаёт `AZN`. */
export function CurrencySelect({
  value,
  onValueChange,
  className = "",
  disabled,
  name,
  id,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
}: CurrencySelectProps) {
  const v = SUPPORTED_CURRENCIES.includes(value as SupportedCurrency)
    ? (value as SupportedCurrency)
    : DEFAULT_CURRENCY;

  return (
    <Select
      id={id}
      name={name}
      value={v}
      disabled={disabled}
      className={className}
      aria-invalid={ariaInvalid}
      aria-label={ariaLabel}
      onValueChange={(next) => onValueChange(next as SupportedCurrency)}
    >
      <SelectTrigger className="" />
      <SelectContent>
        {SUPPORTED_CURRENCIES.map((code) => (
          <SelectItem key={code} value={code}>
            {code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
