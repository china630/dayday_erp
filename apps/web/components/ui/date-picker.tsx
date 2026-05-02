"use client";

import * as Popover from "@radix-ui/react-popover";
import { format, isAfter, parse, startOfDay } from "date-fns";
import { Calendar } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DayPicker, type Matcher } from "react-day-picker";
import { useTranslation } from "react-i18next";
import { useLedgerPeriodLock } from "../../lib/ledger-period-lock-context";
import { MODAL_INPUT_CLASS } from "../../lib/design-system";
import { FORM_INPUT_CLASS } from "../../lib/form-styles";

import "react-day-picker/style.css";

function parseIsoDate(s: string): Date | undefined {
  const t = s.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return undefined;
  try {
    const d = parse(t, "yyyy-MM-dd", new Date());
    return Number.isNaN(d.getTime()) ? undefined : d;
  } catch {
    return undefined;
  }
}

export type DatePickerProps = {
  value: string;
  onChange: (isoYyyyMmDd: string) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  /** Если `false`, не блокируем даты по Period Lock (например, экран настройки самого lock). */
  respectPeriodLock?: boolean;
  /** `form` — триггер как поле на страницах кассы/отчётов (`FORM_INPUT_CLASS`). */
  fieldVariant?: "modal" | "form";
  /** Если задан — полностью заменяет базовые классы триггера (например настройки орг.: `INPUT_BORDERED_CLASS`). */
  triggerClassName?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-label"?: string;
};

/**
 * Выбор даты с календарём; при `respectPeriodLock` дни **≤** {@link useLedgerPeriodLock} серые и не выбираются.
 */
export function DatePicker({
  value,
  onChange,
  className = "",
  disabled = false,
  required,
  id,
  respectPeriodLock = true,
  fieldVariant = "modal",
  triggerClassName,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const { t } = useTranslation();
  const { lockedPeriodUntil } = useLedgerPeriodLock();
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => parseIsoDate(value), [value]);

  const lockedMatcher: Matcher | undefined = useMemo(() => {
    if (!respectPeriodLock || !lockedPeriodUntil) return undefined;
    const lockDay = startOfDay(parse(lockedPeriodUntil.slice(0, 10), "yyyy-MM-dd", new Date()));
    return (day: Date) => !isAfter(startOfDay(day), lockDay);
  }, [respectPeriodLock, lockedPeriodUntil]);

  const labelText = selected ? format(selected, "yyyy-MM-dd") : "";

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const dayPickerDisabled = useMemo(() => {
    if (disabled) return true;
    if (lockedMatcher) return lockedMatcher;
    return undefined;
  }, [disabled, lockedMatcher]);

  const triggerBaseClass =
    triggerClassName ?? (fieldVariant === "form" ? FORM_INPUT_CLASS : MODAL_INPUT_CLASS);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-invalid={ariaInvalid === true || ariaInvalid === "true" ? true : undefined}
          aria-label={ariaLabel ?? t("ui.datePickerChoose")}
          aria-required={required ? true : undefined}
          className={[
            triggerBaseClass,
            "flex w-full min-w-0 items-center justify-between gap-2 text-left",
            disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className={labelText ? "text-[#34495E]" : "text-[#7F8C8D]"}>
            {labelText || t("ui.datePickerPlaceholder")}
          </span>
          <Calendar className="h-4 w-4 shrink-0 text-[#7F8C8D]" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={4}
          align="start"
          className="z-[200] rounded-[2px] border border-[#D5DADF] bg-white p-2 shadow-md"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DayPicker
            mode="single"
            selected={selected}
            defaultMonth={selected ?? new Date()}
            disabled={dayPickerDisabled}
            onSelect={(d) => {
              if (!d || disabled) return;
              onChange(format(d, "yyyy-MM-dd"));
              setOpen(false);
            }}
            showOutsideDays
            fixedWeeks
          />
          <Popover.Close className="sr-only">{t("common.close")}</Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
