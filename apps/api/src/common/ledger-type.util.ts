import { BadRequestException } from "@nestjs/common";
import { LedgerType } from "@dayday/database";

export function parseLedgerTypeQuery(value: string | undefined): LedgerType {
  if (value == null || value === "") {
    return LedgerType.NAS;
  }
  const u = value.trim().toUpperCase();
  if (u === "NAS") return LedgerType.NAS;
  if (u === "IFRS") return LedgerType.IFRS;
  throw new BadRequestException(
    'Invalid ledgerType (expected "NAS" or "IFRS")',
  );
}
