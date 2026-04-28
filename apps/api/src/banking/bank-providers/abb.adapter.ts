import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from "axios";
import Redis from "ioredis";
import { IntegrationReliabilityService } from "../../integrations/integration-reliability.service";
import { DataMaskingService } from "../../privacy/data-masking.service";
import type {
  BankBalanceItem,
  BankingProviderInterface,
  BankStatementItem,
  PaymentDraftRequest,
  PaymentDraftResult,
} from "./banking-provider.interface";

type AbbTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
};

type SalaryPaymentXmlRow = {
  rrn: string;
  account: string;
  amount: string;
  recipientAccount: string;
  description1: string;
  description2?: string;
  description3?: string;
  description4?: string;
};

export type SalaryBatchSubmitResult = {
  batchNumber: string;
  providerPayload: unknown;
};

@Injectable()
export class AbbAdapter implements BankingProviderInterface, OnModuleDestroy {
  private readonly logger = new Logger(AbbAdapter.name);
  private readonly http: AxiosInstance;
  private readonly redis: Redis;
  private readonly tokenPath: string;
  private readonly accountBalancePath: string;
  private readonly accountStatementPath: string;
  private readonly accountsByCifPath: string;
  private readonly salaryPaymentsPath: string;
  private readonly username: string;
  private readonly password: string;
  private readonly redisKey: string;
  private readonly devMockEnabled: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly reliability: IntegrationReliabilityService,
    private readonly dataMasking: DataMaskingService,
  ) {
    const baseUrl = this.config.get<string>(
      "ABB_API_BASE_URL",
      "https://api-test-c2b.abb-bank.az",
    );
    this.tokenPath = this.config.get<string>("ABB_TOKEN_PATH", "/payments/auth/token");
    this.accountBalancePath = this.config.get<string>(
      "ABB_ACCOUNT_BALANCE_PATH",
      "/payments/account/balance",
    );
    this.accountStatementPath = this.config.get<string>(
      "ABB_ACCOUNT_STATEMENT_PATH",
      "/payments/account/statement",
    );
    this.accountsByCifPath = this.config.get<string>(
      "ABB_ACCOUNTS_BY_CIF_PATH",
      "/payments/corporate-account-info",
    );
    this.salaryPaymentsPath = this.config.get<string>(
      "ABB_SALARY_PAYMENTS_PATH",
      "/payments/salary",
    );
    this.username = this.config.get<string>("ABB_USERNAME", "");
    this.password = this.config.get<string>("ABB_PASSWORD", "");
    this.redisKey = this.config.get<string>(
      "ABB_OAUTH_TOKEN_CACHE_KEY",
      "banking:abb:token",
    );
    this.devMockEnabled = this.config.get<string>("BANKING_DEV_MOCK") === "1";

    this.http = axios.create({ baseURL: baseUrl, timeout: 20_000 });
    this.redis = new Redis(
      this.config.get<string>("REDIS_URL", "redis://127.0.0.1:6379"),
      {
        maxRetriesPerRequest: 2,
        enableReadyCheck: false,
      },
    );
  }

  /**
   * ABB Business API references:
   * - B2B INTEGRATION REST API v1.6
   * - §4.1 Generate Token, §4.9 Get Balance, §4.10 Get Account Statement
   * - §5.3 Salary Payment XML Structure
   */
  async getBalances(): Promise<BankBalanceItem[]> {
    if (this.devMockEnabled) {
      return this.mockBalances();
    }
    const accountsResponse = await this.authorizedRequest<unknown>({
      method: "GET",
      url: this.accountsByCifPath,
    });
    const accounts = this.extractRows(accountsResponse.data, ["items", "data"]);
    const mapped = accounts.map((row, idx) => {
      const rec = this.asRecord(row);
      return {
        accountId:
          this.pickString(rec, ["accountNo", "accountNumber", "iban"]) ??
          `abb-account-${idx + 1}`,
        iban: this.pickString(rec, ["iban"], null),
        currency: this.pickString(rec, ["currency"], "AZN")!,
        amount: this.pickAmount(rec, [
          "availableBalance",
          "todayOpeningBalance",
          "todayIncome",
        ]),
      } as BankBalanceItem;
    });
    if (mapped.length > 0) return mapped;

    const accountNumbers = this.config
      .get<string>("ABB_ACCOUNT_NUMBERS", "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const balances: BankBalanceItem[] = [];
    for (const accountNumber of accountNumbers) {
      const response = await this.authorizedRequest<unknown>({
        method: "GET",
        url: this.accountBalancePath,
        params: { accountNumber },
      });
      const rec = this.asRecord(response.data);
      balances.push({
        accountId: this.pickString(rec, ["accountNumber"], accountNumber)!,
        iban: this.pickString(rec, ["accountNumber"], accountNumber),
        currency: this.pickString(rec, ["currency"], "AZN")!,
        amount: this.pickAmount(rec, ["availableBalance"]),
      });
    }
    return balances;
  }

  async getStatements(from: string, to: string): Promise<BankStatementItem[]> {
    if (this.devMockEnabled) {
      return this.mockStatements(from, to);
    }
    const balances = await this.getBalances();
    const statements: BankStatementItem[] = [];
    for (const acc of balances) {
      const response = await this.authorizedRequest<unknown>({
        method: "GET",
        url: this.accountStatementPath,
        params: {
          account: acc.iban ?? acc.accountId,
          "from-date": from,
          "to-date": to,
          "page-size": 100,
          page: 1,
          "operation-type": "A",
        },
      });
      const root = this.asRecord(response.data);
      const accountInfo = this.asRecord(root.accountInfo);
      const tx = this.asRecord(root.transaction);
      const rows = this.extractRows(tx, ["transactions", "items", "data"]);
      for (const row of rows) {
        const rec = this.asRecord(row);
        const drAmount = this.toNumber(rec.drAmount);
        const crAmount = this.toNumber(rec.crAmount);
        const signed = crAmount > 0 ? crAmount : drAmount > 0 ? -drAmount : 0;
        statements.push({
          externalId:
            this.pickString(rec, ["trnRef", "transactionReference"]) ??
            `abb-tx-${statements.length + 1}`,
          amount: signed.toFixed(2),
          currency: this.pickString(accountInfo, ["currency"], acc.currency)!,
          date: this.normalizeAbbDate(this.pickString(rec, ["trnDate", "paymentTime"], from)!),
          description: this.pickString(rec, ["trnDesc", "description"], null),
          counterpartyIban: this.pickString(rec, ["counterParty"], null),
          counterpartyName: null,
        });
      }
    }
    return statements;
  }

  async sendPaymentDraft(payload: PaymentDraftRequest): Promise<PaymentDraftResult> {
    if (this.devMockEnabled) {
      return {
        draftId: `ABB-MOCK-${Date.now()}`,
        status: "CREATED",
        providerPayload: payload,
      };
    }
    const xml = this.buildSalaryPaymentXml([
      {
        rrn: `HR-${Date.now()}`,
        account: payload.fromAccountIban,
        amount: payload.amount,
        recipientAccount: payload.toIban,
        description1: payload.purpose.slice(0, 35),
      },
    ]);
    const base64aDoc = Buffer.from(xml).toString("base64");
    const response = await this.authorizedRequest<{ data?: { batchNumber?: string } }>(
      {
        method: "POST",
        url: this.salaryPaymentsPath,
        data: {
          base64aDoc,
          externalReference: payload.reference ?? `dayday-${Date.now()}`,
        },
      },
      true,
      createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32),
    );
    return {
      draftId: response.data?.data?.batchNumber ?? "",
      status: "CREATED",
      providerPayload: response.data,
    };
  }

  async sendSalaryRegistryXml(
    xml: string,
    externalReference?: string,
  ): Promise<SalaryBatchSubmitResult> {
    const response = await this.authorizedRequest<{ data?: { batchNumber?: string } }>(
      {
        method: "POST",
        url: this.salaryPaymentsPath,
        data: {
          base64aDoc: Buffer.from(xml).toString("base64"),
          externalReference: externalReference ?? `salary-registry-${Date.now()}`,
        },
      },
      true,
      createHash("sha256").update(xml).digest("hex").slice(0, 32),
    );
    return {
      batchNumber: response.data?.data?.batchNumber ?? "",
      providerPayload: response.data,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  /** ABB API v1.6 §5.3 Salary Payment XML */
  buildSalaryPaymentXml(payments: SalaryPaymentXmlRow[]): string {
    const sanitize = (v: string) =>
      v
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    const rows = payments
      .map((p) => {
        const optional = [p.description2, p.description3, p.description4]
          .map((d, idx) =>
            d ? `<description${idx + 2}>${sanitize(d.slice(0, 35))}</description${idx + 2}>` : "",
          )
          .join("");
        return `<payment><rrn>${sanitize(p.rrn)}</rrn><account>${sanitize(
          p.account,
        )}</account><amount>${sanitize(p.amount)}</amount><recipientAccount>${sanitize(
          p.recipientAccount,
        )}</recipientAccount><description1>${sanitize(
          p.description1.slice(0, 35),
        )}</description1>${optional}</payment>`;
      })
      .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?><root><payments>${rows}</payments></root>`;
  }

  private async authorizedRequest<T>(
    config: AxiosRequestConfig,
    retryOnTokenError = true,
    writeIdempotencyKey?: string,
  ): Promise<AxiosResponse<T>> {
    const token = await this.getAccessToken();
    try {
      return await this.reliability.executeWithPolicies({
        provider: "abb",
        operation: `http_${String(config.method ?? "GET").toUpperCase()}:${String(config.url ?? "")}`,
        writeIdempotencyKey,
        request: () =>
          this.http.request<T>({
            ...config,
            headers: {
              ...(config.headers ?? {}),
              Authorization: `Bearer ${token}`,
            },
          }),
      });
    } catch (error) {
      const shouldRetry = retryOnTokenError && this.isInvalidTokenError(error);
      if (shouldRetry) {
        await this.redis.del(this.redisKey);
        const fresh = await this.getAccessToken();
        return this.http.request<T>({
          ...config,
          headers: {
            ...(config.headers ?? {}),
            Authorization: `Bearer ${fresh}`,
          },
        });
      }
      this.handleApiError(error);
      throw error;
    }
  }

  private async getAccessToken(): Promise<string> {
    const cached = await this.redis.get(this.redisKey);
    if (cached) return cached;
    if (!this.username || !this.password) {
      throw new UnauthorizedException(
        "ABB credentials are missing (ABB_USERNAME / ABB_PASSWORD)",
      );
    }
    try {
      const response = await this.reliability.executeWithPolicies({
        provider: "abb",
        operation: "oauth_token",
        request: () =>
          this.http.post<AbbTokenResponse>(
            this.tokenPath,
            {
              username: this.username,
              password: this.password,
            },
            {
              headers: {
                "Content-Type": "application/json",
                Charset: "UTF-8",
              },
            },
          ),
      });
      const token = response.data?.access_token;
      if (!token) {
        throw new UnauthorizedException("ABB token missing in response");
      }
      const ttl = Math.max(30, (response.data?.expires_in ?? 600) - 30);
      await this.redis.set(this.redisKey, token, "EX", ttl);
      return token;
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  private isInvalidTokenError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;
    if (error.response?.status === 401) return true;
    const body = error.response?.data;
    const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
    return /unauthorized|invalid[_\s-]?token|expired/i.test(text);
  }

  private handleApiError(error: unknown): never {
    if (!axios.isAxiosError(error)) throw error;
    const status = error.response?.status;
    const body = error.response?.data;
    const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
    if (status === 429 || /rate[_\s-]?limit|too many requests/i.test(text)) {
      throw new HttpException("ABB API rate limit exceeded", HttpStatus.TOO_MANY_REQUESTS);
    }
    if (status === 401 || /unauthorized|invalid[_\s-]?token|expired/i.test(text)) {
      throw new UnauthorizedException("ABB API token is invalid or expired");
    }
    const safeBody = this.dataMasking.maskForLogSnippet(body, 400);
    this.logger.warn(`ABB API error status=${status ?? "n/a"} body=${safeBody}`);
    throw error;
  }

  private extractRows(payload: unknown, keys: string[]): unknown[] {
    if (Array.isArray(payload)) return payload;
    const root = this.asRecord(payload);
    for (const key of keys) {
      const value = root[key];
      if (Array.isArray(value)) return value;
      if (value && typeof value === "object") {
        const nested = this.asRecord(value);
        if (Array.isArray(nested.items)) return nested.items;
        if (Array.isArray(nested.data)) return nested.data;
      }
    }
    return [];
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private pickString(
    source: Record<string, unknown>,
    keys: string[],
    fallback: string | null = "",
  ): string | null {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
    return fallback;
  }

  private pickAmount(source: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
    }
    return "0";
  }

  private toNumber(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const n = Number(value.replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
    return 0;
  }

  private normalizeAbbDate(raw: string): string {
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) {
      const [d, m, y] = raw.split(".");
      return `${y}-${m}-${d}T00:00:00.000Z`;
    }
    return raw.includes("T") ? raw : `${raw}T00:00:00.000Z`;
  }

  private mockBalances(): BankBalanceItem[] {
    return [
      {
        accountId: "ABB-CIF-001-AZN",
        iban: "AZ33IBAZ00000000000000000001",
        currency: "AZN",
        amount: "98000.25",
      },
      {
        accountId: "ABB-CIF-001-USD",
        iban: "AZ33IBAZ00000000000000000002",
        currency: "USD",
        amount: "11000.00",
      },
      {
        accountId: "ABB-CIF-001-EUR",
        iban: "AZ33IBAZ00000000000000000003",
        currency: "EUR",
        amount: "7600.10",
      },
    ];
  }

  private mockStatements(from: string, _to: string): BankStatementItem[] {
    return [
      {
        externalId: "ABB-MOCK-TX-1",
        amount: "-1500.00",
        currency: "AZN",
        date: `${from}T09:00:00.000Z`,
        description: "Mock ABB statement row",
        counterpartyIban: "AZ33IBAZ00000000000000000999",
        counterpartyName: "Mock ABB Counterparty",
      },
    ];
  }
}

