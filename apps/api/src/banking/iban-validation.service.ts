import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { AuditService } from "../audit/audit.service";
import { IntegrationReliabilityService } from "../integrations/integration-reliability.service";
import { validateAzIban } from "./iban.util";

@Injectable()
export class IbanValidationService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(
    private readonly config: ConfigService,
    private readonly reliability: IntegrationReliabilityService,
    private readonly audit: AuditService,
  ) {
    this.redis = new Redis(
      this.config.get<string>("REDIS_URL", "redis://127.0.0.1:6379"),
      {
        maxRetriesPerRequest: 2,
        enableReadyCheck: false,
      },
    );
  }

  async validateViaProvider(organizationId: string, ibanRaw: string) {
    const local = validateAzIban(ibanRaw);
    if (!local.isValid) {
      throw new BadRequestException({
        code: "IBAN_LOCAL_INVALID",
        message: local.reason ?? "Invalid IBAN",
      });
    }

    const apiKey = this.config.get<string>("IBAN_COM_API_KEY")?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException({
        code: "IBAN_PROVIDER_NOT_CONFIGURED",
        message: "IBAN provider is not configured",
      });
    }

    const cacheKey = `iban:deep:${organizationId}:${local.normalized}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      await this.reliability.trackCache("iban", true);
      try {
        return JSON.parse(cached) as Record<string, unknown>;
      } catch {
        await this.redis.del(cacheKey);
      }
    }
    await this.reliability.trackCache("iban", false);

    const query = new URLSearchParams({
      format: "json",
      api_key: apiKey,
      iban: local.normalized,
    });
    const url = `https://www.iban.com/validation-api?${query.toString()}`;
    let res: Response;
    try {
      res = await this.reliability.executeWithPolicies({
        provider: "iban",
        operation: "validate_iban",
        request: async () => {
          const ac = new AbortController();
          const timer = setTimeout(() => ac.abort(), 8000);
          try {
            return await fetch(url, { method: "GET", signal: ac.signal });
          } catch {
            throw new BadGatewayException({
              code: "IBAN_PROVIDER_UNAVAILABLE",
              message: "IBAN provider is unavailable",
            });
          } finally {
            clearTimeout(timer);
          }
        },
      });
    } catch (error) {
      await this.audit.logOrganizationSystemEvent({
        organizationId,
        entityType: "integration.failure",
        entityId: "iban",
        action: "VALIDATE_IBAN",
        payload: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }

    if (!res.ok) {
      await this.audit.logOrganizationSystemEvent({
        organizationId,
        entityType: "integration.failure",
        entityId: "iban",
        action: "VALIDATE_IBAN",
        payload: {
          status: res.status,
          rawResponse: await this.safeResponseBody(res),
        },
      });
      throw new BadGatewayException({
        code: "IBAN_PROVIDER_HTTP_ERROR",
        message: `IBAN provider HTTP ${res.status}`,
      });
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      await this.audit.logOrganizationSystemEvent({
        organizationId,
        entityType: "integration.failure",
        entityId: "iban",
        action: "VALIDATE_IBAN",
        payload: {
          status: res.status,
          message: "IBAN provider returned invalid JSON",
          rawResponse: await this.safeResponseBody(res),
        },
      });
      throw new BadGatewayException({
        code: "IBAN_PROVIDER_BAD_RESPONSE",
        message: "IBAN provider returned invalid JSON",
      });
    }

    const obj = (data ?? {}) as Record<string, unknown>;
    const bankData = ((obj.bank_data as Record<string, unknown> | undefined) ??
      {}) as Record<string, unknown>;
    const countryData = ((obj.country as Record<string, unknown> | undefined) ??
      {}) as Record<string, unknown>;
    const validations =
      (obj.validations as Record<string, unknown> | undefined) ?? undefined;
    const externalValid =
      typeof validations?.iban_valid === "boolean"
        ? validations.iban_valid
        : typeof validations?.iban_code === "boolean"
          ? validations.iban_code
          : typeof validations?.iban === "boolean"
            ? validations.iban
            : null;
    const accountExists =
      typeof validations?.account === "boolean"
        ? validations.account
        : typeof validations?.account_number === "boolean"
          ? validations.account_number
          : typeof validations?.account_exists === "boolean"
            ? validations.account_exists
            : null;
    const bankName =
      (typeof bankData.bank === "string" && bankData.bank.trim()) ||
      (typeof bankData.name === "string" && bankData.name.trim()) ||
      null;
    const bic =
      (typeof bankData.bic === "string" && bankData.bic.trim()) ||
      (typeof bankData.swift === "string" && bankData.swift.trim()) ||
      null;
    const country =
      (typeof countryData.country === "string" && countryData.country.trim()) ||
      (typeof countryData.country_iso === "string" && countryData.country_iso.trim()) ||
      (typeof obj.country === "string" && obj.country.trim()) ||
      null;

    const result = {
      iban: local.normalized,
      localValid: true,
      externalValid,
      bankName,
      bic,
      country,
      accountExists,
      provider: "iban.com",
      providerPayload: obj,
      cached: false,
    };
    if (externalValid === true) {
      await this.redis.set(
        cacheKey,
        JSON.stringify({ ...result, cached: true }),
        "EX",
        24 * 60 * 60,
      );
    }
    return result;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  private async safeResponseBody(res: Response): Promise<string | null> {
    try {
      const text = await res.clone().text();
      return text.slice(0, 1000);
    } catch {
      return null;
    }
  }
}

