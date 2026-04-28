/** Ключ периода YYYY-MM по UTC-календарю даты проводки. */
export function monthKeyUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function parseIsoDateOnly(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) {
    throw new Error(`Invalid date (expected YYYY-MM-DD): ${s}`);
  }
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0));
}

/** Конец календарного дня UTC для сравнения с DateTime. */
export function endOfUtcDay(dateFromParse: Date): Date {
  return new Date(
    Date.UTC(
      dateFromParse.getUTCFullYear(),
      dateFromParse.getUTCMonth(),
      dateFromParse.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

/** Первый и последний календарный день месяца (UTC 00:00, для сравнения с @db.Date). */
export function monthRangeUtc(year: number, month1to12: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month1to12 - 1, 1, 0, 0, 0, 0));
  const lastDay = new Date(Date.UTC(year, month1to12, 0, 0, 0, 0, 0)).getUTCDate();
  const end = new Date(Date.UTC(year, month1to12 - 1, lastDay, 0, 0, 0, 0));
  return { start, end };
}

export function getClosedPeriodKeys(settingsJson: unknown): string[] {
  if (!settingsJson || typeof settingsJson !== "object") return [];
  const r = (settingsJson as Record<string, unknown>).reporting;
  if (!r || typeof r !== "object") return [];
  const cp = (r as Record<string, unknown>).closedPeriods;
  if (!Array.isArray(cp)) return [];
  return cp.filter((x): x is string => typeof x === "string");
}

export function getLockedPeriodUntil(settingsJson: unknown): Date | null {
  if (!settingsJson || typeof settingsJson !== "object") return null;
  const ledger = (settingsJson as Record<string, unknown>).ledger;
  if (!ledger || typeof ledger !== "object") return null;
  const value = (ledger as Record<string, unknown>).lockedPeriodUntil;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return parseIsoDateOnly(value);
  } catch {
    return null;
  }
}

/** YYYY-MM-DD по UTC-календарю (для API отчётов). */
export function dateToIsoYmdUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Нарезка периода [dateFrom, dateTo] по календарным месяцам (UTC).
 * Для каждого куска — границы включительно и дата курса (конец куска).
 */
export function accrualMonthSlices(
  dateFrom: Date,
  dateTo: Date,
): Array<{ fromStr: string; toStr: string; fxAsOf: Date }> {
  if (dateFrom.getTime() > dateTo.getTime()) {
    return [];
  }
  const out: Array<{ fromStr: string; toStr: string; fxAsOf: Date }> = [];
  let y = dateFrom.getUTCFullYear();
  let m = dateFrom.getUTCMonth();
  let cursor = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  while (cursor.getTime() <= dateTo.getTime()) {
    const y0 = cursor.getUTCFullYear();
    const m0 = cursor.getUTCMonth();
    const lastDay = new Date(Date.UTC(y0, m0 + 1, 0, 0, 0, 0, 0)).getUTCDate();
    const monthStart = new Date(Date.UTC(y0, m0, 1, 0, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(y0, m0, lastDay, 0, 0, 0, 0));
    const sliceFrom =
      dateFrom.getTime() > monthStart.getTime() ? dateFrom : monthStart;
    const sliceTo = dateTo.getTime() < monthEnd.getTime() ? dateTo : monthEnd;
    if (sliceFrom.getTime() <= sliceTo.getTime()) {
      out.push({
        fromStr: dateToIsoYmdUtc(sliceFrom),
        toStr: dateToIsoYmdUtc(sliceTo),
        fxAsOf: sliceTo,
      });
    }
    cursor = new Date(Date.UTC(y0, m0 + 1, 1, 0, 0, 0, 0));
  }
  return out;
}

export function mergeClosedPeriod(
  settingsJson: unknown,
  key: string,
): Record<string, unknown> {
  const base =
    settingsJson && typeof settingsJson === "object"
      ? { ...(settingsJson as Record<string, unknown>) }
      : {};
  const rep =
    base.reporting && typeof base.reporting === "object"
      ? { ...(base.reporting as Record<string, unknown>) }
      : {};
  const prev = Array.isArray(rep.closedPeriods)
    ? [...(rep.closedPeriods as string[])]
    : [];
  if (!prev.includes(key)) prev.push(key);
  rep.closedPeriods = prev.sort();
  base.reporting = rep;
  return base;
}

export function mergeLockedPeriodUntil(
  settingsJson: unknown,
  lockedPeriodUntil: string | null,
): Record<string, unknown> {
  const base =
    settingsJson && typeof settingsJson === "object"
      ? { ...(settingsJson as Record<string, unknown>) }
      : {};
  const ledger =
    base.ledger && typeof base.ledger === "object"
      ? { ...(base.ledger as Record<string, unknown>) }
      : {};
  if (lockedPeriodUntil) {
    ledger.lockedPeriodUntil = lockedPeriodUntil;
  } else {
    delete ledger.lockedPeriodUntil;
  }
  base.ledger = ledger;
  return base;
}
