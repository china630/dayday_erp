import { HttpException, HttpStatus } from "@nestjs/common";

export type QuotaKind =
  | "maxEmployees"
  | "maxInvoicesPerMonth"
  | "maxOrganizations"
  | "maxStorageGb";

export type QuotaExceededBody = {
  /** HTTP 402 — см. PRD §7.12.3.1 / TZ §14.8.7 */
  statusCode: number;
  code: "QUOTA_EXCEEDED";
  quota: QuotaKind;
  limit: number;
  current: number;
  message: { az: string; ru: string };
};

function messages(
  quota: QuotaKind,
  limit: number,
  current: number,
): { az: string; ru: string } {
  switch (quota) {
    case "maxEmployees":
      return {
        az: `Bu tarif üzrə işçi limiti dolub (${current}/${limit}). Daha yüksək tarifə keçin.`,
        ru: `Достигнут лимит сотрудников по тарифу (${current}/${limit}). Перейдите на более высокий тариф.`,
      };
    case "maxInvoicesPerMonth":
      return {
        az: `Bu ay üçün hesab-faktura limiti dolub (${current}/${limit}). Növbəti ay və ya daha yüksək tarif.`,
        ru: `Достигнут лимит инвойсов за текущий месяц (${current}/${limit}). Дождитесь следующего месяца или смените тариф.`,
      };
    case "maxOrganizations":
      return {
        az: `Təşkilat limiti dolub (${current}/${limit}). Daha yüksək tarifə keçin.`,
        ru: `Достигнут лимит организаций по тарифу (${current}/${limit}). Перейдите на более высокий тариф.`,
      };
    case "maxStorageGb":
      return {
        az: `Yaddaş limiti dolub (~${current} GB / ${limit} GB). Daha yüksək tarifə keçin.`,
        ru: `Достигнут лимит хранилища (~${current} GB из ${limit} GB). Перейдите на более высокий тариф.`,
      };
    default:
      return {
        az: "Limit aşılıb.",
        ru: "Превышен лимит.",
      };
  }
}

export class QuotaExceededException extends HttpException {
  constructor(
    quota: QuotaKind,
    limit: number,
    current: number,
  ) {
    const body: QuotaExceededBody = {
      statusCode: HttpStatus.PAYMENT_REQUIRED,
      code: "QUOTA_EXCEEDED",
      quota,
      limit,
      current,
      message: messages(quota, limit, current),
    };
    super(body, HttpStatus.PAYMENT_REQUIRED);
  }
}
