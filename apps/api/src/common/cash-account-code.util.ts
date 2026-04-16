import { BadRequestException } from "@nestjs/common";
import {
  CASH_OPERATIONAL_ACCOUNT_CODE,
  FOREIGN_CASH_OPERATIONAL_ACCOUNT_CODE,
} from "../ledger.constants";

/** Счета, которые нельзя использовать как кассу (частая путаница с 101/102). */
const DISALLOWED_AS_CASH = new Set(["211", "531", "538"]);

/**
 * Проверка: касса только под 101* (AZN) или 102* (ин. валюта), не 211/531/538.
 */
export function assertValidCashDeskAccountCode(code: string): void {
  const c = code.trim();
  if (DISALLOWED_AS_CASH.has(c)) {
    throw new BadRequestException(
      `Счёт ${c} не может быть кассовым; используйте 101 / 101.xx (AZN) или 102 / 102.xx (ин. валюта).`,
    );
  }
  const ok =
    c === "101" ||
    c.startsWith("101.") ||
    c === "102" ||
    c.startsWith("102.");
  if (!ok) {
    throw new BadRequestException(
      "Кассовый счёт должен быть в группе 101 (манаты) или 102 (ин. валюта) по плану счетов АР.",
    );
  }
}

/**
 * Если код не передан — 101.01 для AZN, иначе 102.01; иначе валидация явного кода.
 */
export function resolveCashAccountCodeForCurrency(
  currency: string | undefined,
  explicit?: string | null,
): string {
  const trimmed = explicit?.trim();
  if (trimmed) {
    assertValidCashDeskAccountCode(trimmed);
    return trimmed;
  }
  const cur = (currency ?? "AZN").toUpperCase();
  if (cur === "AZN") {
    return CASH_OPERATIONAL_ACCOUNT_CODE;
  }
  return FOREIGN_CASH_OPERATIONAL_ACCOUNT_CODE;
}
