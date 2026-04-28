import { Injectable } from "@nestjs/common";

export const MASKED = "***MASKED***";

/** Normalized key: lowercase, no `_` or `-`. */
export function normalizeSensitiveKey(key: string): string {
  return key.replace(/[_-]/g, "").toLowerCase();
}

const DEFAULT_SENSITIVE_KEYS: readonly string[] = [
  "password",
  "adminpassword",
  "passwordhash",
  "currentpassword",
  "refreshtoken",
  "refresh_token",
  "token",
  "accesstoken",
  "access_token",
  "idtoken",
  "authorization",
  "apikey",
  "api_key",
  "secret",
  "clientsecret",
  "client_secret",
  "pin",
  "fin",
  "iban",
  "balance",
  "balances",
  "accountnumber",
  "account_number",
  "creditcard",
  "cardnumber",
  "cvv",
];

@Injectable()
export class DataMaskingService {
  private readonly sensitive: ReadonlySet<string>;

  constructor() {
    this.sensitive = new Set(DEFAULT_SENSITIVE_KEYS.map(normalizeSensitiveKey));
  }

  isSensitiveKey(key: string): boolean {
    return this.sensitive.has(normalizeSensitiveKey(key));
  }

  /**
   * Рекурсивно маскирует значения по имени ключа (без учёта регистра и `_`/`-`).
   * JSON-строки (объект/массив) в строковых полях разбираются и маскируются внутри.
   */
  maskDeep(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === "string") {
      const t = value.trim();
      if (
        (t.startsWith("{") && t.endsWith("}")) ||
        (t.startsWith("[") && t.endsWith("]"))
      ) {
        try {
          return this.maskDeep(JSON.parse(value) as unknown);
        } catch {
          return value;
        }
      }
      return value;
    }
    if (typeof value !== "object") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.maskDeep(item));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (this.isSensitiveKey(k)) {
        out[k] = MASKED;
      } else {
        out[k] = this.maskDeep(v);
      }
    }
    return out;
  }

  /** Короткая строка для application logs (не БД). */
  maskForLogSnippet(value: unknown, maxLen: number): string {
    const masked = this.maskDeep(value);
    const s =
      typeof masked === "string" ? masked : JSON.stringify(masked ?? null);
    return s.length <= maxLen ? s : `${s.slice(0, maxLen)}…`;
  }
}
