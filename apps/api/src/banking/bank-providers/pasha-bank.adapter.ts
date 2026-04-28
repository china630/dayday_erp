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

type PashaTokenResponse = {
  access_token?: string;
  token?: string;
  expires_in?: number;
};

@Injectable()
export class PashaBankAdapter implements BankingProviderInterface, OnModuleDestroy {
  private readonly logger = new Logger(PashaBankAdapter.name);
  private readonly http: AxiosInstance;
  private readonly redis: Redis;
  private readonly tokenPath: string;
  private readonly accountsPath: string;
  private readonly transactionsPath: string;
  private readonly paymentDraftsPath: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly scope: string | null;
  private readonly redisKey: string;
  private readonly devMockEnabled: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly reliability: IntegrationReliabilityService,
    private readonly dataMasking: DataMaskingService,
  ) {
    const baseUrl = this.config.get<string>(
      "PASHA_API_BASE_URL",
      "https://developer.pashabank.digital",
    );
    this.tokenPath = this.config.get<string>("PASHA_OAUTH_TOKEN_PATH", "/oauth/token");
    this.accountsPath = this.config.get<string>("PASHA_ACCOUNTS_PATH", "/v1/accounts");
    this.transactionsPath = this.config.get<string>(
      "PASHA_TRANSACTIONS_PATH",
      "/v1/transactions",
    );
    this.paymentDraftsPath = this.config.get<string>(
      "PASHA_PAYMENT_DRAFTS_PATH",
      "/v1/payments/drafts",
    );
    this.clientId = this.config.get<string>("PASHA_CLIENT_ID", "");
    this.clientSecret = this.config.get<string>("PASHA_CLIENT_SECRET", "");
    this.scope = this.config.get<string>("PASHA_OAUTH_SCOPE") ?? null;
    this.redisKey = this.config.get<string>(
      "PASHA_OAUTH_TOKEN_CACHE_KEY",
      "banking:pasha:oauth:token",
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
   * PAŞA Bank Open API docs:
   * - https://developer.pashabank.digital/
   * - B2B portal: https://b2bpayments.pashabank.digital/en
   */
  async getBalances(): Promise<BankBalanceItem[]> {
    if (this.devMockEnabled) {
      return this.mockBalances();
    }
    const response = await this.authorizedRequest<unknown>({
      method: "GET",
      url: this.accountsPath,
    });
    return this.mapBalances(response.data);
  }

  async getStatements(from: string, to: string): Promise<BankStatementItem[]> {
    if (this.devMockEnabled) {
      return this.mockStatements(from, to);
    }
    const response = await this.authorizedRequest<unknown>({
      method: "GET",
      url: this.transactionsPath,
      params: { from, to },
    });
    return this.mapStatements(response.data);
  }

  async sendPaymentDraft(payload: PaymentDraftRequest): Promise<PaymentDraftResult> {
    if (this.devMockEnabled) {
      return {
        draftId: `PASHA-MOCK-${Date.now()}`,
        status: "CREATED",
        providerPayload: payload,
      };
    }
    const response = await this.authorizedRequest<{
      id?: string | number;
      draftId?: string | number;
      status?: string;
    }>(
      {
        method: "POST",
        url: this.paymentDraftsPath,
        data: payload,
      },
      true,
      createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32),
    );
    return {
      draftId: String(response.data?.draftId ?? response.data?.id ?? ""),
      status: response.data?.status ?? "CREATED",
      providerPayload: response.data,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  private async authorizedRequest<T>(
    config: AxiosRequestConfig,
    retryOnTokenError = true,
    writeIdempotencyKey?: string,
  ): Promise<AxiosResponse<T>> {
    const token = await this.getAccessToken();
    try {
      return await this.reliability.executeWithPolicies({
        provider: "pasha",
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
        const freshToken = await this.getAccessToken();
        return this.http.request<T>({
          ...config,
          headers: {
            ...(config.headers ?? {}),
            Authorization: `Bearer ${freshToken}`,
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
    if (!this.clientId || !this.clientSecret) {
      throw new UnauthorizedException(
        "Pasha OAuth credentials are missing (PASHA_CLIENT_ID / PASHA_CLIENT_SECRET)",
      );
    }
    const body = new URLSearchParams();
    body.set("grant_type", "client_credentials");
    body.set("client_id", this.clientId);
    body.set("client_secret", this.clientSecret);
    if (this.scope) body.set("scope", this.scope);
    try {
      const response = await this.reliability.executeWithPolicies({
        provider: "pasha",
        operation: "oauth_token",
        request: () =>
          this.http.post<PashaTokenResponse>(
            this.tokenPath,
            body.toString(),
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
          ),
      });
      const token = response.data?.access_token ?? response.data?.token;
      if (!token) {
        throw new UnauthorizedException("Pasha OAuth token is missing in response");
      }
      const ttl = Math.max(30, (response.data?.expires_in ?? 300) - 30);
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
    const text =
      typeof error.response?.data === "string"
        ? error.response.data
        : JSON.stringify(error.response?.data ?? {});
    return /invalid[_\s-]?token|token.*expired|unauthorized/i.test(text);
  }

  private handleApiError(error: unknown): never {
    if (!axios.isAxiosError(error)) throw error;
    const status = error.response?.status;
    const text =
      typeof error.response?.data === "string"
        ? error.response.data
        : JSON.stringify(error.response?.data ?? {});
    if (status === 429 || /rate[_\s-]?limit|too many requests/i.test(text)) {
      throw new HttpException("Pasha API rate limit exceeded", HttpStatus.TOO_MANY_REQUESTS);
    }
    if (status === 401 || /unauthorized|invalid[_\s-]?token|expired/i.test(text)) {
      throw new UnauthorizedException("Pasha API token is invalid or expired");
    }
    const safeBody = this.dataMasking.maskForLogSnippet(error.response?.data, 400);
    this.logger.warn(`Pasha API error status=${status ?? "n/a"} body=${safeBody}`);
    throw error;
  }

  private mapBalances(payload: unknown): BankBalanceItem[] {
    const rows = this.extractRows(payload, ["accounts", "items", "data"]);
    return rows.map((row, idx) => {
      const rec = this.asRecord(row);
      return {
        accountId:
          this.pickString(rec, ["accountId", "id", "account_number", "accountNo"]) ??
          `pasha-account-${idx + 1}`,
        iban: this.pickString(rec, ["iban", "account_iban", "accountIban"]) ?? null,
        currency: this.pickString(rec, ["currency", "currency_code"], "AZN")!,
        amount: this.pickAmount(rec, ["available_balance", "balance", "amount"]),
      };
    });
  }

  private mapStatements(payload: unknown): BankStatementItem[] {
    const rows = this.extractRows(payload, ["transactions", "items", "data"]);
    return rows.map((row, idx) => {
      const rec = this.asRecord(row);
      return {
        externalId:
          this.pickString(rec, ["transaction_id", "id", "reference", "trnRef"]) ??
          `pasha-tx-${idx + 1}`,
        amount: this.pickAmount(rec, ["amount", "transaction_amount"]),
        currency: this.pickString(rec, ["currency", "currency_code"], "AZN")!,
        date:
          this.pickString(rec, ["transaction_date", "date", "created_at"], new Date().toISOString())!,
        description: this.pickString(rec, ["description", "details", "purpose"], null),
        counterpartyIban: this.pickString(
          rec,
          ["counterparty_iban", "beneficiary_iban", "iban"],
          null,
        ),
        counterpartyName: this.pickString(
          rec,
          ["counterparty_name", "beneficiary_name", "name"],
          null,
        ),
      };
    });
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

  private mockBalances(): BankBalanceItem[] {
    return [
      {
        accountId: "PASHA-CIF-001-AZN",
        iban: "AZ36PAHA00000000000000000001",
        currency: "AZN",
        amount: "125000.00",
      },
      {
        accountId: "PASHA-CIF-001-USD",
        iban: "AZ36PAHA00000000000000000002",
        currency: "USD",
        amount: "12000.50",
      },
      {
        accountId: "PASHA-CIF-001-EUR",
        iban: "AZ36PAHA00000000000000000003",
        currency: "EUR",
        amount: "8900.75",
      },
    ];
  }

  private mockStatements(from: string, to: string): BankStatementItem[] {
    return [
      {
        externalId: "PASHA-MOCK-TX-1",
        amount: "2500.00",
        currency: "AZN",
        date: `${from}T10:00:00.000Z`,
        description: `Mock salary transfer window ${from}..${to}`,
        counterpartyIban: "AZ36PAHA00000000000000000111",
        counterpartyName: "Mock Employee Batch",
      },
    ];
  }
}

