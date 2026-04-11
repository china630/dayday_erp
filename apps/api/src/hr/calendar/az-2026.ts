/**
 * Нерабочие дни АР по производственному календарю 2026 (гос. праздники и переносы).
 * Суббота/воскресенье обрабатываются отдельно в isAzWorkingDay().
 * @see оперативные сводки календаря АР на 2026 г.
 */
export const AZ_2026_EXTRA_NON_WORKING_ISO = new Set<string>([
  "2026-01-01",
  "2026-01-02",
  "2026-01-20",
  "2026-03-08",
  "2026-03-09",
  "2026-03-20",
  "2026-03-21",
  "2026-03-22",
  "2026-03-23",
  "2026-03-24",
  "2026-03-25",
  "2026-03-26",
  "2026-03-27",
  "2026-03-30",
  "2026-05-09",
  "2026-05-11",
  "2026-05-27",
  "2026-05-28",
  "2026-05-29",
  "2026-06-15",
  "2026-06-26",
  "2026-11-08",
  "2026-11-09",
  "2026-11-10",
  "2026-12-31",
]);

function isoUtc(y: number, m0: number, d: number): string {
  return `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** true = рабочий день (не выходной и не праздник). Для года ≠ 2026 — только пн–пт. */
export function isAzWorkingDay(year: number, monthIndex0: number, day: number): boolean {
  const t = Date.UTC(year, monthIndex0, day);
  const dow = new Date(t).getUTCDay();
  if (dow === 0 || dow === 6) {
    return false;
  }
  if (year !== 2026) {
    return true;
  }
  const iso = isoUtc(year, monthIndex0, day);
  if (AZ_2026_EXTRA_NON_WORKING_ISO.has(iso)) {
    return false;
  }
  return true;
}
