import { Decimal } from "@dayday/database";

/** İş stajı (tam illər): əmək müqaviləsi başlanğıcından hesabla. */
export function totalServiceWholeYears(
  employmentStartUtc: Date,
  asOfUtc: Date,
): number {
  const ms = asOfUtc.getTime() - employmentStartUtc.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / (365.25 * 24 * 3600 * 1000));
}

/**
 * Xəstəlik ödənişi faizi (işəgötürən 14 günə qədər) — TK AR üzrə yuvarlaq qaydalar.
 * <5 il: 60%, 5–8 il: 80%, 8+ il: 100% orta gündəlikdən.
 */
export function sickLeaveEmployerPercent(years: number): Decimal {
  if (years < 5) return new Decimal("0.6");
  if (years < 8) return new Decimal("0.8");
  return new Decimal("1.0");
}

export const SICK_LEAVE_EMPLOYER_CALENDAR_DAYS = 14;
