import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  PaymentOrderStatus,
  Prisma,
  SubscriptionTier,
  TemplateGroup,
} from "@dayday/database";
import type { TierQuotas } from "../constants/quotas";
import { PrismaService } from "../prisma/prisma.service";
import { SystemConfigService } from "../system-config/system-config.service";
import type { AdminSubscriptionPatchDto } from "./dto/admin-subscription-patch.dto";
import type {
  CreatePricingBundleDto,
  UpdatePricingBundleDto,
} from "./dto/pricing-bundle.dto";
import type { PatchFoundationDto } from "./dto/patch-foundation.dto";
import type { PatchPricingModulePriceDto } from "./dto/patch-pricing-module-price.dto";
import type { PatchQuotaUnitPricingDto } from "./dto/patch-quota-unit-pricing.dto";
import type { PatchYearlyDiscountDto } from "./dto/patch-yearly-discount.dto";
import type { SetBillingPriceDto } from "./dto/set-billing-price.dto";
import type { SetTierQuotasDto } from "./dto/set-tier-quotas.dto";
import type { TranslationUpsertDto } from "./dto/translation-upsert.dto";
import type { UpsertChartTemplateEntryDto } from "./dto/upsert-chart-template-entry.dto";
import { getDefaultFlatTranslations } from "./i18n-default-catalog";
import { PricingService } from "./pricing.service";

const I18N_CACHE_KEY = "i18n.cacheVersion";

function parseExpiresAtFromDto(raw: string): Date {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException("Invalid expiresAt: could not parse as date");
  }
  return d;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
    private readonly pricing: PricingService,
  ) {}

  async getStats() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [totalOrganizations, revenueAgg, newUsers24h, activeTrials] =
      await Promise.all([
        this.prisma.organization.count(),
        this.prisma.paymentOrder.aggregate({
          where: { status: PaymentOrderStatus.PAID },
          _sum: { amountAzn: true },
        }),
        this.prisma.user.count({ where: { createdAt: { gte: since } } }),
        this.prisma.organizationSubscription.count({
          where: {
            isTrial: true,
            isBlocked: false,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        }),
      ]);
    return {
      totalOrganizations,
      revenueTotalAzn: revenueAgg._sum.amountAzn?.toString() ?? "0",
      newUsers24h,
      activeTrials,
    };
  }

  async listUsers(
    q: string | undefined,
    page: number,
    pageSize: number,
  ) {
    const skip = (page - 1) * pageSize;
    const trimmed = q?.trim();
    const where: Prisma.UserWhereInput = trimmed
      ? {
          OR: [
            { email: { contains: trimmed, mode: "insensitive" } },
            { fullName: { contains: trimmed, mode: "insensitive" } },
            { firstName: { contains: trimmed, mode: "insensitive" } },
            { lastName: { contains: trimmed, mode: "insensitive" } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          fullName: true,
          isSuperAdmin: true,
          createdAt: true,
          _count: { select: { memberships: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      page,
      pageSize,
      total,
      items: rows.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        fullName: u.fullName,
        isSuperAdmin: u.isSuperAdmin,
        membershipCount: u._count.memberships,
        createdAt: u.createdAt.toISOString(),
      })),
    };
  }

  async listOrganizations(
    q: string | undefined,
    page: number,
    pageSize: number,
  ) {
    const skip = (page - 1) * pageSize;
    const trimmed = q?.trim();
    const where: Prisma.OrganizationWhereInput = trimmed
      ? {
          OR: [
            { taxId: { contains: trimmed, mode: "insensitive" } },
            { name: { contains: trimmed, mode: "insensitive" } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          subscription: true,
          memberships: {
            take: 1,
            orderBy: { joinedAt: "asc" },
            select: { userId: true, role: true },
          },
        },
      }),
      this.prisma.organization.count({ where }),
    ]);
    return {
      page,
      pageSize,
      total,
      items: rows.map((o) => ({
        id: o.id,
        name: o.name,
        taxId: o.taxId,
        currency: o.currency,
        createdAt: o.createdAt.toISOString(),
        primaryUserId: o.memberships[0]?.userId ?? null,
        subscription: o.subscription
          ? {
              tier: o.subscription.tier,
              expiresAt: o.subscription.expiresAt?.toISOString() ?? null,
              isTrial: o.subscription.isTrial,
              isBlocked: o.subscription.isBlocked,
              activeModules: o.subscription.activeModules,
            }
          : null,
      })),
    };
  }

  async patchSubscription(
    organizationId: string,
    dto: AdminSubscriptionPatchDto,
  ) {
    const existing = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { subscription: true },
    });
    if (!existing) {
      throw new NotFoundException("Organization not found");
    }

    let expiresAt: Date | null | undefined = undefined;
    if (dto.expiresAt !== undefined) {
      expiresAt =
        dto.expiresAt === null || dto.expiresAt === ""
          ? null
          : parseExpiresAtFromDto(String(dto.expiresAt).trim());
    }
    if (dto.extendMonths != null && dto.extendMonths > 0) {
      const sub = existing.subscription;
      const base =
        sub?.expiresAt && sub.expiresAt > new Date()
          ? sub.expiresAt
          : new Date();
      const d = new Date(base);
      d.setMonth(d.getMonth() + dto.extendMonths);
      expiresAt = d;
    }

    const data: Prisma.OrganizationSubscriptionUncheckedUpdateInput = {};
    if (dto.isBlocked !== undefined) {
      data.isBlocked = dto.isBlocked;
    }
    if (dto.tier !== undefined) {
      data.tier = dto.tier;
    }
    if (expiresAt !== undefined) {
      data.expiresAt = expiresAt;
    }
    if (dto.activeModules !== undefined) {
      data.activeModules = dto.activeModules;
    }

    if (existing.subscription) {
      if (Object.keys(data).length === 0) {
        throw new BadRequestException("Nothing to update");
      }
      return this.prisma.organizationSubscription.update({
        where: { organizationId },
        data,
      });
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException("Nothing to update");
    }
    return this.prisma.organizationSubscription.create({
      data: {
        organizationId,
        tier: dto.tier ?? "STARTER",
        isTrial: false,
        isBlocked: dto.isBlocked ?? false,
        expiresAt: expiresAt ?? null,
        activeModules: dto.activeModules ?? [],
      },
    });
  }

  async getUserOrganizations(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    const rows = await this.prisma.organizationMembership.findMany({
      where: { userId },
      include: {
        organization: {
          include: { subscription: true },
        },
      },
      orderBy: { joinedAt: "asc" },
    });
    return {
      userId: user.id,
      email: user.email,
      items: rows.map((m) => ({
        organizationId: m.organizationId,
        organizationName: m.organization.name,
        taxId: m.organization.taxId,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
        subscription: m.organization.subscription
          ? {
              tier: m.organization.subscription.tier,
              expiresAt:
                m.organization.subscription.expiresAt?.toISOString() ?? null,
              isTrial: m.organization.subscription.isTrial,
              isBlocked: m.organization.subscription.isBlocked,
              activeModules: m.organization.subscription.activeModules,
            }
          : null,
      })),
    };
  }

  async getBillingConfig() {
    const prices = await this.systemConfig.getAllBillingPrices();
    const tiers = Object.keys(prices) as SubscriptionTier[];
    const quotas: Record<string, TierQuotas> = {};
    for (const t of tiers) {
      quotas[t] = await this.systemConfig.getTierQuotas(t);
    }
    const constructorData = await this.pricing.getConstructorData();
    const [yearlyDiscountPercent, quotaPricing, pricingBundles] =
      await Promise.all([
        this.systemConfig.getYearlyDiscountPercent(),
        this.systemConfig.getQuotaUnitPricing(),
        this.prisma.pricingBundle.findMany({ orderBy: { updatedAt: "desc" } }),
      ]);
    return {
      prices,
      quotas,
      foundationMonthlyAzn: constructorData.basePrice,
      yearlyDiscountPercent,
      quotaPricing,
      basePrice: constructorData.basePrice,
      pricingModules: constructorData.modules.map((m) =>
        serializePricingModule({
          id: m.id,
          key: m.key,
          name: m.name,
          pricePerMonth: m.pricePerMonth,
          sortOrder: m.sortOrder,
        }),
      ),
      pricingBundles: pricingBundles.map(serializePricingBundle),
    };
  }

  async seedPricingCatalogDefaults() {
    const modules = await this.pricing.resetPricingCatalogToDefaults();
    return {
      ok: true as const,
      pricingModules: modules.map((m) =>
        serializePricingModule({
          id: m.id,
          key: m.key,
          name: m.name,
          pricePerMonth: m.pricePerMonth,
          sortOrder: m.sortOrder,
        }),
      ),
    };
  }

  async patchFoundation(dto: PatchFoundationDto) {
    await this.systemConfig.setFoundationMonthlyAzn(dto.amountAzn);
    return { ok: true, foundationMonthlyAzn: dto.amountAzn };
  }

  async patchYearlyDiscount(dto: PatchYearlyDiscountDto) {
    await this.systemConfig.setYearlyDiscountPercent(dto.percent);
    return { ok: true, yearlyDiscountPercent: dto.percent };
  }

  async patchQuotaUnitPricing(dto: PatchQuotaUnitPricingDto) {
    const quotaPricing = await this.systemConfig.setQuotaUnitPricing(dto);
    return { ok: true, quotaPricing };
  }

  async patchPricingModulePrice(id: string, dto: PatchPricingModulePriceDto) {
    const row = await this.prisma.pricingModule.update({
      where: { id },
      data: { pricePerMonth: dto.pricePerMonth },
    });
    return serializePricingModule(row);
  }

  async createPricingBundle(dto: CreatePricingBundleDto) {
    const row = await this.prisma.pricingBundle.create({
      data: {
        name: dto.name.trim(),
        discountPercent: dto.discountPercent,
        moduleKeys: dto.moduleKeys,
      },
    });
    return serializePricingBundle(row);
  }

  async updatePricingBundle(id: string, dto: UpdatePricingBundleDto) {
    const data: {
      name?: string;
      discountPercent?: number;
      moduleKeys?: string[];
    } = {};
    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.discountPercent !== undefined) {
      data.discountPercent = dto.discountPercent;
    }
    if (dto.moduleKeys !== undefined) {
      data.moduleKeys = dto.moduleKeys;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException("Nothing to update");
    }
    const row = await this.prisma.pricingBundle.update({
      where: { id },
      data,
    });
    return serializePricingBundle(row);
  }

  async deletePricingBundle(id: string) {
    await this.prisma.pricingBundle.delete({ where: { id } });
    return { ok: true };
  }

  async setBillingPrice(dto: SetBillingPriceDto) {
    await this.systemConfig.setBillingPriceAzn(dto.tier, dto.amountAzn);
    return { ok: true, tier: dto.tier, amountAzn: dto.amountAzn };
  }

  async setTierQuotas(dto: SetTierQuotasDto) {
    const current = await this.systemConfig.getTierQuotas(dto.tier);
    const merged: TierQuotas = {
      maxOrganizations:
        dto.quotas.maxOrganizations !== undefined
          ? dto.quotas.maxOrganizations
          : current.maxOrganizations,
      maxEmployees:
        dto.quotas.maxEmployees !== undefined
          ? dto.quotas.maxEmployees
          : current.maxEmployees,
      maxInvoicesPerMonth:
        dto.quotas.maxInvoicesPerMonth !== undefined
          ? dto.quotas.maxInvoicesPerMonth
          : current.maxInvoicesPerMonth,
      maxStorageGb:
        dto.quotas.maxStorageGb !== undefined
          ? dto.quotas.maxStorageGb
          : current.maxStorageGb,
    };
    await this.systemConfig.setTierQuotas(dto.tier, merged);
    return { ok: true, tier: dto.tier, quotas: merged };
  }

  async listTranslations(
    locale: string,
    q: string | undefined,
    skip: number,
    take: number,
  ) {
    const loc = locale.trim().toLowerCase();
    const trimmed = q?.trim();
    const defaults = getDefaultFlatTranslations(loc);

    const overrideRows = await this.prisma.translationOverride.findMany({
      where: { locale: loc },
      orderBy: { key: "asc" },
    });
    const overrideByKey = new Map(overrideRows.map((r) => [r.key, r]));

    const allKeys = new Set<string>([
      ...Object.keys(defaults),
      ...overrideRows.map((r) => r.key),
    ]);

    let keys = [...allKeys].sort((a, b) => a.localeCompare(b));

    if (trimmed) {
      const L = trimmed.toLowerCase();
      keys = keys.filter(
        (k) =>
          k.toLowerCase().includes(L) ||
          (defaults[k] ?? "").toLowerCase().includes(L) ||
          (overrideByKey.get(k)?.value ?? "").toLowerCase().includes(L),
      );
    }

    const total = keys.length;
    const pageKeys = keys.slice(skip, skip + take);

    const items = pageKeys.map((key) => {
      const o = overrideByKey.get(key);
      const defaultVal = defaults[key] ?? "";
      return {
        id: o?.id ?? null,
        key,
        value: o ? o.value : defaultVal,
        isOverride: !!o,
        updatedAt: o?.updatedAt.toISOString() ?? null,
      };
    });

    return {
      locale: loc,
      total,
      items,
    };
  }

  async upsertTranslation(dto: TranslationUpsertDto) {
    const locale = dto.locale.trim().toLowerCase();
    const row = await this.prisma.translationOverride.upsert({
      where: {
        locale_key: { locale, key: dto.key },
      },
      create: { locale, key: dto.key, value: dto.value },
      update: { value: dto.value },
    });
    return row;
  }

  async deleteTranslation(id: string) {
    const r = await this.prisma.translationOverride.deleteMany({
      where: { id },
    });
    if (r.count === 0) {
      throw new NotFoundException("Translation override not found");
    }
    return { ok: true };
  }

  async syncTranslationsCache() {
    const v = Date.now();
    await this.systemConfig.setJson(I18N_CACHE_KEY, v);
    return { ok: true, cacheVersion: v };
  }

  async getTranslationCacheVersion(): Promise<number> {
    const v = await this.systemConfig.getJson(I18N_CACHE_KEY);
    if (typeof v === "number" && Number.isFinite(v)) {
      return v;
    }
    return 0;
  }

  async publicTranslationsFlat(locale: string): Promise<Record<string, string>> {
    const loc = locale.trim().toLowerCase();
    const rows = await this.prisma.translationOverride.findMany({
      where: { locale: loc },
      select: { key: true, value: true },
    });
    const out: Record<string, string> = {};
    for (const r of rows) {
      out[r.key] = r.value;
    }
    return out;
  }

  async globalAuditLogs(params: {
    organizationId?: string;
    userId?: string;
    from?: string;
    to?: string;
    take: number;
    skip: number;
  }) {
    const where: Prisma.AuditLogWhereInput = {};
    if (params.organizationId) {
      where.organizationId = params.organizationId;
    }
    if (params.userId) {
      where.userId = params.userId;
    }
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) {
        where.createdAt.gte = new Date(params.from);
      }
      if (params.to) {
        where.createdAt.lte = new Date(params.to);
      }
    }
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: params.take,
        skip: params.skip,
        select: {
          id: true,
          organizationId: true,
          userId: true,
          entityType: true,
          entityId: true,
          action: true,
          createdAt: true,
          changes: true,
          oldValues: true,
          newValues: true,
          hash: true,
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      total,
      items: items.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Глобальный шаблон NAS (`chart_of_accounts_entries`) — источник для новых организаций
   * (`syncAzChartForOrganization` читает БД, если в каталоге есть строки).
   */
  listChartTemplateEntries() {
    return this.prisma.chartOfAccountsEntry.findMany({
      orderBy: [
        { templateGroup: "asc" },
        { sortOrder: "asc" },
        { code: "asc" },
      ],
    });
  }

  async upsertChartTemplateEntry(dto: UpsertChartTemplateEntryDto) {
    const templateGroup = dto.templateGroup ?? TemplateGroup.COMMERCIAL;
    const code = dto.code.trim();
    const nameAz = dto.nameAz.trim();
    const nameRu = dto.nameRu.trim();
    const nameEn = dto.nameEn.trim();
    const parentRaw = dto.parentCode?.trim();
    const parentCode = parentRaw && parentRaw.length > 0 ? parentRaw : null;
    if (parentCode === code) {
      throw new BadRequestException("parentCode не может совпадать с code");
    }
    if (parentCode) {
      const parent = await this.prisma.chartOfAccountsEntry.findFirst({
        where: { templateGroup, code: parentCode },
      });
      if (!parent) {
        throw new BadRequestException(
          `Unknown parentCode in ${templateGroup}: ${parentCode}`,
        );
      }
    }
    let cashProfile = dto.cashProfile?.trim() || null;
    if (!cashProfile) {
      if (code === "101" || code.startsWith("101.")) {
        cashProfile = "AZN";
      } else if (code === "102" || code.startsWith("102.")) {
        cashProfile = "FX";
      }
    }
    const sortOrder = dto.sortOrder ?? 0;
    const isDeprecated = dto.isDeprecated ?? false;
    return this.prisma.chartOfAccountsEntry.upsert({
      where: {
        templateGroup_code: {
          templateGroup,
          code,
        },
      },
      create: {
        templateGroup,
        code,
        nameAz,
        nameRu,
        nameEn,
        accountType: dto.accountType,
        parentCode,
        cashProfile,
        sortOrder,
        isDeprecated,
      },
      update: {
        nameAz,
        nameRu,
        nameEn,
        accountType: dto.accountType,
        parentCode,
        cashProfile,
        sortOrder,
        isDeprecated,
      },
    });
  }
}

function serializePricingModule(m: {
  id: string;
  key: string;
  name: string;
  pricePerMonth: unknown;
  sortOrder: number;
}) {
  return {
    id: m.id,
    key: m.key,
    name: m.name,
    pricePerMonth: Number(m.pricePerMonth),
    sortOrder: m.sortOrder,
  };
}

function serializePricingBundle(b: {
  id: string;
  name: string;
  discountPercent: unknown;
  moduleKeys: unknown;
}) {
  const keys = b.moduleKeys;
  return {
    id: b.id,
    name: b.name,
    discountPercent: Number(b.discountPercent),
    moduleKeys: Array.isArray(keys) ? keys.map(String) : [],
  };
}
