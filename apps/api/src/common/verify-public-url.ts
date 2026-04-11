import { ConfigService } from "@nestjs/config";

/** База для QR на подписанных PDF: https://erp.dayday.az/verify/[logId] */
export function verifyQrPublicBase(config: ConfigService): string {
  const raw = config.get<string>("VERIFY_PUBLIC_BASE_URL");
  if (raw?.trim()) return raw.replace(/\/$/, "");
  return "https://erp.dayday.az";
}
