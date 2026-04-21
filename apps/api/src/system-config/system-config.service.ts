import { Injectable } from "@nestjs/common";
import { SubscriptionTier } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import type { TierQuotas } from "../constants/quotas";
import { TIER_QUOTAS } from "../constants/quotas";

const BILLING_PRICE_KEYS: Record<SubscriptionTier, string> = {
  STARTER: "billing.price.STARTER",
  BUSINESS: "billing.price.BUSINESS",
  ENTERPRISE: "billing.price.ENTERPRISE",
};

const QUOTA_KEY = (tier: SubscriptionTier) => `quota.tier.${tier}`;

const FOUNDATION_MONTHLY_KEY = "billing.foundation_monthly_azn";
const YEARLY_DISCOUNT_KEY = "billing.yearly_discount_percent";
const QUOTA_UNIT_PRICING_KEY = "billing.quota_unit_pricing_v1";

export type QuotaUnitPricing = {
  employeeBlockSize: number;
  pricePerEmployeeBlockAzn: number;
  documentPackSize: number;
  pricePerDocumentPackAzn: number;
};

@Injectable()
export class SystemConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getJson(key: string): Promise<unknown | null> {
    const row = await this.prisma.systemConfig.findUnique({
      where: { key },
      select: { value: true },
    });
    return row?.value ?? null;
  }

  async setJson(key: string, value: unknown): Promise<void> {
    await this.prisma.systemConfig.upsert({
      where: { key },
      create: { key, value: value as object },
      update: { value: value as object },
    });
  }

  async getBillingPriceAzn(tier: SubscriptionTier): Promise<number> {
    const key = BILLING_PRICE_KEYS[tier];
    const row = await this.prisma.systemConfig.findUnique({
      where: { key },
      select: { value: true },
    });
    if (row?.value === null || row?.value === undefined) {
      return this.defaultPrice(tier);
    }
    const v = row.value as unknown;
    if (typeof v === "number") {
      return v;
    }
    if (typeof v === "string") {
      return Number.parseFloat(v) || this.defaultPrice(tier);
    }
    return this.defaultPrice(tier);
  }

  async setBillingPriceAzn(
    tier: SubscriptionTier,
    amountAzn: number,
  ): Promise<void> {
    const key = BILLING_PRICE_KEYS[tier];
    await this.setJson(key, amountAzn);
  }

  async getAllBillingPrices(): Promise<
    Record<SubscriptionTier, number>
  > {
    const out = {} as Record<SubscriptionTier, number>;
    for (const tier of Object.keys(BILLING_PRICE_KEYS) as SubscriptionTier[]) {
      out[tier] = await this.getBillingPriceAzn(tier);
    }
    return out;
  }

  private defaultPrice(tier: SubscriptionTier): number {
    const defaults: Record<SubscriptionTier, number> = {
      STARTER: 49,
      BUSINESS: 149,
      ENTERPRISE: 499,
    };
    return defaults[tier];
  }

  /**
   * Квоты по тиру: из SystemConfig (JSON) или константы TIER_QUOTAS.
   */
  async getTierQuotas(tier: SubscriptionTier): Promise<TierQuotas> {
    const key = QUOTA_KEY(tier);
    const raw = await this.getJson(key);
    const base = TIER_QUOTAS[tier];
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const o = raw as Record<string, unknown>;
      return {
        maxOrganizations:
          o.maxOrganizations !== undefined
            ? toNullableNum(o.maxOrganizations)
            : base.maxOrganizations,
        maxEmployees:
          o.maxEmployees !== undefined ? toNullableNum(o.maxEmployees) : base.maxEmployees,
        maxInvoicesPerMonth:
          o.maxInvoicesPerMonth !== undefined
            ? toNullableNum(o.maxInvoicesPerMonth)
            : base.maxInvoicesPerMonth,
        maxStorageGb:
          o.maxStorageGb !== undefined ? toNullableNum(o.maxStorageGb) : base.maxStorageGb,
      };
    }
    return base;
  }

  async setTierQuotas(tier: SubscriptionTier, quotas: TierQuotas): Promise<void> {
    await this.setJson(QUOTA_KEY(tier), quotas);
  }

  async getFoundationMonthlyAzn(): Promise<number> {
    const raw = await this.getJson(FOUNDATION_MONTHLY_KEY);
    const n = toPositiveNum(raw, 29);
    return n;
  }

  async setFoundationMonthlyAzn(amountAzn: number): Promise<void> {
    await this.setJson(FOUNDATION_MONTHLY_KEY, amountAzn);
  }

  async getYearlyDiscountPercent(): Promise<number> {
    const raw = await this.getJson(YEARLY_DISCOUNT_KEY);
    const n = toPositiveNum(raw, 20);
    return Math.min(100, n);
  }

  async setYearlyDiscountPercent(percent: number): Promise<void> {
    await this.setJson(YEARLY_DISCOUNT_KEY, percent);
  }

  async getQuotaUnitPricing(): Promise<QuotaUnitPricing> {
    const raw = await this.getJson(QUOTA_UNIT_PRICING_KEY);
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const o = raw as Record<string, unknown>;
      return {
        employeeBlockSize: Math.max(1, toPositiveNum(o.employeeBlockSize, 10)),
        pricePerEmployeeBlockAzn: toPositiveNum(o.pricePerEmployeeBlockAzn, 15),
        documentPackSize: Math.max(1, toPositiveNum(o.documentPackSize, 1000)),
        pricePerDocumentPackAzn: toPositiveNum(o.pricePerDocumentPackAzn, 5),
      };
    }
    return {
      employeeBlockSize: 10,
      pricePerEmployeeBlockAzn: 15,
      documentPackSize: 1000,
      pricePerDocumentPackAzn: 5,
    };
  }

  async setQuotaUnitPricing(patch: Partial<QuotaUnitPricing>): Promise<QuotaUnitPricing> {
    const current = await this.getQuotaUnitPricing();
    const next: QuotaUnitPricing = {
      employeeBlockSize:
        patch.employeeBlockSize !== undefined
          ? Math.max(1, patch.employeeBlockSize)
          : current.employeeBlockSize,
      pricePerEmployeeBlockAzn:
        patch.pricePerEmployeeBlockAzn !== undefined
          ? Math.max(0, patch.pricePerEmployeeBlockAzn)
          : current.pricePerEmployeeBlockAzn,
      documentPackSize:
        patch.documentPackSize !== undefined
          ? Math.max(1, patch.documentPackSize)
          : current.documentPackSize,
      pricePerDocumentPackAzn:
        patch.pricePerDocumentPackAzn !== undefined
          ? Math.max(0, patch.pricePerDocumentPackAzn)
          : current.pricePerDocumentPackAzn,
    };
    await this.setJson(QUOTA_UNIT_PRICING_KEY, next);
    return next;
  }
}

function toPositiveNum(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return fallback;
}

function toNullableNum(v: unknown): number | null {
  if (v === null || v === undefined) {
    return null;
  }
  if (typeof v === "number") {
    return Number.isFinite(v) ? v : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
