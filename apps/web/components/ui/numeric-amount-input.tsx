"use client";

import { NumericFormat } from "react-number-format";
import { MODAL_INPUT_NUMERIC_CLASS } from "../../lib/design-system";
import { FORM_INPUT_CLASS } from "../../lib/form-styles";

export type NumericAmountInputProps = {
  /** Неформатированное значение: цифры и опционально `.` как разделитель дроби (`1500000`, `12.5`). */
  value: string;
  onValueChange: (plain: string) => void;
  /** `form` — те же отступы/бордер, что у `FORM_INPUT_CLASS` на страницах (касса и т.п.). */
  fieldVariant?: "modal" | "form";
  className?: string;
  decimalScale?: number;
  allowNegative?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  placeholder?: string;
  required?: boolean;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-label"?: string;
  autoComplete?: string;
};

/**
 * Финансовый ввод: разделитель тысяч пробелом (`1 500 000`), в `onValueChange` — строка без пробелов.
 * Выравнивание вправо — {@link MODAL_INPUT_NUMERIC_CLASS}.
 */
export function NumericAmountInput({
  value,
  onValueChange,
  fieldVariant = "modal",
  className = "",
  decimalScale = 4,
  allowNegative = false,
  disabled,
  name,
  id,
  placeholder,
  required,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  autoComplete = "off",
}: NumericAmountInputProps) {
  const baseClass =
    fieldVariant === "form" ? `${FORM_INPUT_CLASS} text-right tabular-nums` : MODAL_INPUT_NUMERIC_CLASS;
  return (
    <NumericFormat
      value={value}
      onValueChange={(vals) => onValueChange(vals.value)}
      thousandSeparator=" "
      decimalSeparator="."
      allowedDecimalSeparators={[",", "."]}
      decimalScale={decimalScale}
      allowNegative={allowNegative}
      allowLeadingZeros
      disabled={disabled}
      name={name}
      id={id}
      placeholder={placeholder}
      required={required}
      aria-invalid={ariaInvalid === true || ariaInvalid === "true" ? true : undefined}
      aria-label={ariaLabel}
      autoComplete={autoComplete}
      className={[baseClass, className].filter(Boolean).join(" ")}
      inputMode="decimal"
    />
  );
}
