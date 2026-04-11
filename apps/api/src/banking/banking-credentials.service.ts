import {
  BadRequestException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

/** Префикс зашифрованного значения в organization.settings */
const ENC_PREFIX = "dd:v1:";

/**
 * Шифрование Bearer-токенов банка в БД (AES-256-GCM).
 * Ключ: BANKING_CREDENTIALS_ENCRYPTION_KEY — 64 hex-символа (32 байта).
 * Без ключа сохранение нового токена через API запрещено; чтение старых незашифрованных значений допускается (миграция).
 */
@Injectable()
export class BankingCredentialsService {
  private readonly logger = new Logger(BankingCredentialsService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return this.getKeyBuffer() !== null;
  }

  private getKeyBuffer(): Buffer | null {
    const hex = this.config
      .get<string>("BANKING_CREDENTIALS_ENCRYPTION_KEY", "")
      ?.trim();
    if (!hex || hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
      return null;
    }
    return Buffer.from(hex, "hex");
  }

  /**
   * Сохранение токена: всегда шифрует, если ключ задан.
   * Пустая строка → undefined (не сохранять поле).
   */
  encryptForStorage(plain: string | undefined | null): string | undefined {
    const t = plain?.trim();
    if (!t) return undefined;
    const key = this.getKeyBuffer();
    if (!key) {
      throw new BadRequestException(
        "Задайте BANKING_CREDENTIALS_ENCRYPTION_KEY (64 hex-символа) в .env для хранения токенов банка.",
      );
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([cipher.update(t, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENC_PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
  }

  /**
   * Расшифровка для синхронизации. Незашифрованные значения возвращаются как есть (legacy).
   */
  decryptFromStorage(stored: string | undefined | null): string {
    const s = stored?.trim();
    if (!s) return "";
    if (!s.startsWith(ENC_PREFIX)) {
      return s;
    }
    const key = this.getKeyBuffer();
    if (!key) {
      this.logger.error(
        "Зашифрованный токен банка в БД, но BANKING_CREDENTIALS_ENCRYPTION_KEY не задан",
      );
      return "";
    }
    try {
      const rest = s.slice(ENC_PREFIX.length);
      const [ivB, tagB, dataB] = rest.split(":");
      if (!ivB || !tagB || !dataB) return "";
      const iv = Buffer.from(ivB, "base64url");
      const tag = Buffer.from(tagB, "base64url");
      const data = Buffer.from(dataB, "base64url");
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString(
        "utf8",
      );
    } catch (e) {
      this.logger.warn(`decryptFromStorage failed: ${String(e)}`);
      return "";
    }
  }

  looksEncrypted(stored: string | undefined | null): boolean {
    return Boolean(stored?.trim().startsWith(ENC_PREFIX));
  }
}
