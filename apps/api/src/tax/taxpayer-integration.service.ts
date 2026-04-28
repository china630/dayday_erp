import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { type AxiosResponse } from "axios";
import { load } from "cheerio";
import Redis from "ioredis";
import { AuditService } from "../audit/audit.service";
import { IntegrationReliabilityService } from "../integrations/integration-reliability.service";

export type TaxpayerLookupResult = {
  name: string;
  isVatPayer: boolean;
  address: string | null;
  isRiskyTaxpayer: boolean | null;
};

const DEFAULT_TAXPAYER_URL =
  "https://new.e-taxes.gov.az/etaxes/services/taxpayer-info";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "az-AZ,az;q=0.9,en;q=0.8",
};

@Injectable()
export class TaxpayerIntegrationService implements OnModuleDestroy {
  private readonly logger = new Logger(TaxpayerIntegrationService.name);
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

  async lookupTaxpayerByVoen(rawVoen: string): Promise<TaxpayerLookupResult> {
    const voen = rawVoen.replace(/\D/g, "");
    if (voen.length !== 10) {
      throw new BadRequestException("VÖEN must be 10 digits");
    }
    const cacheKey = `tax:lookup:${voen}`;
    let cached: string | null = null;
    try {
      cached = await this.redis.get(cacheKey);
    } catch (e) {
      this.logger.warn(
        `taxpayer cache read failed for ${voen}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (cached) {
      await this.reliability.trackCache("tax", true);
      return JSON.parse(cached) as TaxpayerLookupResult;
    }
    await this.reliability.trackCache("tax", false);

    if (this.config.get<string>("TAX_LOOKUP_MOCK") === "1") {
      return {
        name: `Demo Vergi Ödəyicisi ${voen}`,
        isVatPayer: true,
        address: "Bakı şəh.",
        isRiskyTaxpayer: false,
      };
    }

    const baseUrl =
      this.config.get<string>("E_TAXES_TAXPAYER_INFO_URL") ?? DEFAULT_TAXPAYER_URL;

    const attempts: Array<() => Promise<AxiosResponse<unknown>>> = [
      () =>
        axios.post(
          baseUrl,
          { tin: voen, voen, TIN: voen },
          {
            timeout: 15_000,
            headers: { ...BROWSER_HEADERS, "Content-Type": "application/json" },
            validateStatus: () => true,
          },
        ),
      () =>
        axios.post(
          baseUrl,
          new URLSearchParams({ tin: voen, voen }).toString(),
          {
            timeout: 15_000,
            headers: {
              ...BROWSER_HEADERS,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            validateStatus: () => true,
          },
        ),
      () =>
        axios.get(`${baseUrl}?tin=${encodeURIComponent(voen)}`, {
          timeout: 15_000,
          headers: BROWSER_HEADERS,
          validateStatus: () => true,
        }),
      () =>
        axios.get(`${baseUrl}?voen=${encodeURIComponent(voen)}`, {
          timeout: 15_000,
          headers: BROWSER_HEADERS,
          validateStatus: () => true,
        }),
    ];

    let lastProbe: Record<string, unknown> | null = null;

    for (let i = 0; i < attempts.length; i++) {
      try {
        const res = await this.reliability.executeWithPolicies({
          provider: "tax",
          operation: `lookup_${i + 1}`,
          request: attempts[i],
        });
        const ct = String(res.headers["content-type"] ?? "");
        lastProbe = {
          attempt: i + 1,
          status: res.status,
          contentType: ct,
          responseSample:
            typeof res.data === "string"
              ? (res.data as string).slice(0, 2000)
              : res.data,
        };
        if (res.status >= 200 && res.status < 300) {
          const parsed = this.parseResponse(res.data, ct);
          if (parsed) {
            try {
              await this.redis.set(cacheKey, JSON.stringify(parsed), "EX", 24 * 60 * 60);
            } catch (e) {
              this.logger.warn(
                `taxpayer cache write failed for ${voen}: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
            return parsed;
          }
        }
      } catch (e) {
        this.logger.warn(`taxpayer lookup attempt ${i + 1} failed: ${String(e)}`);
      }
    }

    await this.audit.logOrganizationSystemEvent({
      organizationId: null,
      entityType: "integration.failure",
      entityId: "tax",
      action: "LOOKUP_TAXPAYER",
      payload: {
        voen,
        ...(lastProbe ?? {}),
      },
    });

    throw new ServiceUnavailableException(
      "VÖEN yoxlanılmadı: e-taxes.gov.az cavab vermədi və ya format dəyişib. TAX_LOOKUP_MOCK=1 ilə inkişaf rejimi aktiv edə bilərsiniz.",
    );
  }

  private parseResponse(data: unknown, contentType: string): TaxpayerLookupResult | null {
    if (data == null) return null;

    if (typeof data === "object" && !Array.isArray(data)) {
      const o = data as Record<string, unknown>;
      const name = this.pickString(o, [
        "name",
        "fullName",
        "companyName",
        "payerName",
        "taxpayerName",
        "voenName",
        "legalName",
        "ad",
      ]);
      if (!name) return null;
      const isVatPayer = this.pickVatFlag(o);
      const address = this.pickString(o, [
        "address",
        "legalAddress",
        "registeredAddress",
        "unvan",
      ]);
      const isRiskyTaxpayer = this.pickRiskFlag(o);
      return { name, isVatPayer, address: address ?? null, isRiskyTaxpayer };
    }

    if (typeof data === "string") {
      const trimmed = data.trim();
      if (trimmed.startsWith("{")) {
        try {
          return this.parseResponse(JSON.parse(trimmed) as unknown, "application/json");
        } catch {
          /* fall through */
        }
      }
      if (contentType.includes("html") || trimmed.includes("<html")) {
        return this.parseHtmlSnippet(trimmed);
      }
    }

    return null;
  }

  private pickString(o: Record<string, unknown>, keys: string[]): string | undefined {
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "string" && v.trim().length > 0) return v.trim();
    }
    return undefined;
  }

  private pickVatFlag(o: Record<string, unknown>): boolean {
    const keys = [
      "isVatPayer",
      "vatPayer",
      "isVATPayer",
      "nds",
      "vatStatus",
      "payerVat",
    ];
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "boolean") return v;
      if (typeof v === "number") return v !== 0;
      if (typeof v === "string") {
        const s = v.toLowerCase();
        if (s.includes("vat") && (s.includes("yes") || s.includes("bəli"))) return true;
        if (s === "1" || s === "true" || s === "bəli" || s === "var") return true;
        if (s === "0" || s === "false" || s === "yox" || s === "yoxdur") return false;
      }
    }
    return false;
  }

  private pickRiskFlag(o: Record<string, unknown>): boolean | null {
    const keys = [
      "isRiskyTaxpayer",
      "riskyTaxpayer",
      "riskliVergiOdeyicisi",
      "riskStatus",
      "isRisk",
    ];
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "boolean") return v;
      if (typeof v === "number") return v !== 0;
      if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        if (["1", "true", "bəli", "var", "riskli"].includes(s)) return true;
        if (["0", "false", "yox", "yoxdur", "risksiz"].includes(s)) return false;
      }
    }
    return null;
  }

  private parseHtmlSnippet(html: string): TaxpayerLookupResult | null {
    try {
      const $ = load(html);
      const text = $("body").text().replace(/\s+/g, " ").trim();
      if (text.length < 5) return null;

      let name: string | undefined;
      $("td, th, div, span, p, li").each((_, el) => {
        const t = $(el).text().trim();
        if (t.length > 5 && t.length < 400 && !name && /LLC|MMC|OJSC|ASC|VK|İstifadəçi|VÖEN/i.test(t)) {
          name = t;
          return false;
        }
        return undefined;
      });

      if (!name) {
        const m = text.match(
          /([A-ZƏÖÜİĞŞÇa-zəöüığşç0-9\s.,&'"()-]{10,120}(?:MMC|LLC|VK|ASC|OJSC)?)/u,
        );
        if (m) name = m[1].trim();
      }
      if (!name) return null;

      const lower = text.toLowerCase();
      const isVatPayer =
        /ədv\s*payer|vat\s*payer|nds|ədv\s*ödəyicisi|ədv\s*ödəyən/i.test(lower) &&
        !/ədv\s*yox|vat\s*no|non[\s-]*vat/i.test(lower);
      const isRiskyTaxpayer =
        /riskli\s+vergi\s+ödəyicisi|riskli\s+vergi\s+odeyicisi/i.test(lower)
          ? true
          : /riskli\s+deyil|risk\s+yoxdur|risk\s*0/i.test(lower)
            ? false
            : null;

      let address: string | null = null;
      const addrMatch = text.match(
        /(Bakı|Gəncə|Sumqayıt|Naxçıvan|Şəki|Lənkəran)[^,]{0,80}/iu,
      );
      if (addrMatch) address = addrMatch[0].trim();

      return { name, isVatPayer, address, isRiskyTaxpayer };
    } catch (e) {
      this.logger.warn(`HTML parse failed: ${String(e)}`);
      return null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}

