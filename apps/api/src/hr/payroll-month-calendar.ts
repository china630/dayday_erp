import { isAzWorkingDay } from "./calendar/az-2026";

/** Ayda (1–12) istehsal təqvimi üzrə iş günlərinin sayı. */
export function countAzWorkingDaysInMonth(year: number, month1to12: number): number {
  const last = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  let n = 0;
  for (let d = 1; d <= last; d++) {
    if (isAzWorkingDay(year, month1to12 - 1, d)) n += 1;
  }
  return n;
}

/** Ayın sonuncu günü (UTC noon). */
export function monthEndUtc(year: number, month1to12: number): Date {
  const last = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  return new Date(Date.UTC(year, month1to12 - 1, last, 12, 0, 0, 0));
}
