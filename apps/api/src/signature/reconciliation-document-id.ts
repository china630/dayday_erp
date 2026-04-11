import { createHash } from "node:crypto";

/**
 * Стабильный UUID для «документа» акта сверки (орг + контрагент + период).
 * Совпадает с documentId в DigitalSignatureLog при подписи акта (будущий сценарий).
 */
export function reconciliationDocumentUuid(
  organizationId: string,
  counterpartyId: string,
  dateFrom: string,
  dateTo: string,
): string {
  const h = createHash("sha256")
    .update(
      `reconciliation|v1|${organizationId}|${counterpartyId}|${dateFrom}|${dateTo}`,
    )
    .digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
