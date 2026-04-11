import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SubscriptionTier } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import type { ModuleEntitlementKey } from "./subscription.constants";

/**
 * v8.9 / v12.5: аварийный полный доступ к модулям только вне production (TZ §14.6).
 * В production не экспортируется реальный адрес — bypass отключён.
 */
const EMERGENCY_MODULE_ACCESS_EMAIL_DEV =
  process.env.NODE_ENV !== "production"
    ? "shirinov.chingiz@gmail.com"
    : "";

export const EMERGENCY_MODULE_ACCESS_EMAIL = EMERGENCY_MODULE_ACCESS_EMAIL_DEV;

export function isEmergencyModuleAccessEmail(
  email: string | null | undefined,
): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (!EMERGENCY_MODULE_ACCESS_EMAIL_DEV) return false;
  if (!email || typeof email !== "string") return false;
  return email.trim().toLowerCase() === EMERGENCY_MODULE_ACCESS_EMAIL_DEV;
}

const TIER_ORDER: Record<SubscriptionTier, number> = {
  STARTER: 0,
  BUSINESS: 1,
  ENTERPRISE: 2,
};

function tierGte(
  tier: SubscriptionTier,
  min: SubscriptionTier,
): boolean {
  return TIER_ORDER[tier] >= TIER_ORDER[min];
}

export type OrganizationModuleEntitlements = {
  manufacturing: boolean;
  fixedAssets: boolean;
  ifrsMapping: boolean;
  bankingPro: boolean;
  /** Расширенный HR (add-on); legacy без customConfig — true (без замка в UI). */
  hrFull: boolean;
};

/** v8.1: снимок поля custom_config (конструктор тарифа). */
export type SubscriptionCustomConfig = {
  modules?: string[];
  /** Явный флаг модуля кассы (v8.4); дублирует slug `kassa_pro` в `modules`. */
  kassaPro?: boolean;
  preset?: string;
  quotas?: Record<string, unknown>;
  [key: string]: unknown;
};

function parseCustomModules(raw: unknown): string[] | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as SubscriptionCustomConfig;
  const m = o.modules;
  let list: string[] = [];
  if (Array.isArray(m) && m.length > 0) {
    list = m.map((x) => String(x).trim()).filter(Boolean);
  }
  if (o.kassaPro === true && !list.includes("kassa_pro")) {
    list = [...list, "kassa_pro"];
  }
  if (list.length === 0) return null;
  return list;
}

function entitlementsFromConstructorModules(
  modules: string[],
): OrganizationModuleEntitlements {
  const set = new Set(modules);
  const has = (s: string) => set.has(s);
  return {
    manufacturing: has("manufacturing") || has("production"),
    fixedAssets: has("fixed_assets"),
    ifrsMapping: has("ifrs") || has("ifrs_mapping"),
    bankingPro: has("banking_pro") || has("kassa") || has("kassa_pro"),
    hrFull: has("hr_full"),
  };
}

function computeEntitlementsLegacy(sub: {
  tier: SubscriptionTier;
  activeModules: string[];
}): OrganizationModuleEntitlements {
  const modules = new Set(sub.activeModules);
  const has = (slug: string) => modules.has(slug);
  return {
    manufacturing:
      tierGte(sub.tier, "BUSINESS") ||
      has("production") ||
      has("manufacturing"),
    fixedAssets:
      tierGte(sub.tier, "BUSINESS") ||
      has("production") ||
      has("fixed_assets"),
    ifrsMapping: tierGte(sub.tier, "ENTERPRISE") || has("ifrs"),
    bankingPro:
      tierGte(sub.tier, "ENTERPRISE") ||
      has("banking_pro") ||
      has("kassa") ||
      has("kassa_pro"),
    /** Legacy: расширенный HR не блокировался отдельно — оставляем открытым. */
    hrFull: true,
  };
}

function computeEntitlements(sub: {
  tier: SubscriptionTier;
  activeModules: string[];
  customConfig: unknown | null;
}): OrganizationModuleEntitlements {
  if (sub.tier === SubscriptionTier.ENTERPRISE) {
    return {
      manufacturing: true,
      fixedAssets: true,
      ifrsMapping: true,
      bankingPro: true,
      hrFull: true,
    };
  }
  const customList = parseCustomModules(sub.customConfig);
  if (customList && customList.length > 0) {
    return entitlementsFromConstructorModules(customList);
  }
  return computeEntitlementsLegacy(sub);
}

/**
 * Проверка slug из customConfig.modules (и алиасов) для assertModuleAccess.
 */
function isAllowedByConstructorModules(
  modules: string[],
  moduleKey: ModuleEntitlementKey | string,
): boolean {
  const key = String(moduleKey);
  const set = new Set(modules);
  const has = (s: string) => set.has(s);
  if (has(key)) return true;
  switch (key) {
    case "manufacturing":
      return has("production") || has("manufacturing");
    case "fixed_assets":
      return has("fixed_assets");
    case "ifrs_mapping":
      return has("ifrs") || has("ifrs_mapping");
    case "banking_pro":
      return has("banking_pro") || has("kassa") || has("kassa_pro");
    case "kassa_pro":
      return has("kassa_pro") || has("banking_pro") || has("kassa");
    case "hr_full":
      return has("hr_full");
    default:
      return has(key);
  }
}

@Injectable()
export class SubscriptionAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Доступ к модулю по подписке. Для `ENTERPRISE` всегда `true` (в т.ч. kassa_pro).
   */
  async hasModule(
    organizationId: string,
    moduleKey: ModuleEntitlementKey | string,
    userEmail?: string | null,
    isSuperAdmin?: boolean,
  ): Promise<boolean> {
    if (isSuperAdmin) {
      return true;
    }
    if (isEmergencyModuleAccessEmail(userEmail)) {
      return true;
    }
    const sub = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
    });
    if (!sub) return false;
    if (sub.tier === SubscriptionTier.ENTERPRISE) return true;
    try {
      await this.assertModuleAccess(organizationId, moduleKey, { userEmail });
      return true;
    } catch {
      return false;
    }
  }

  async assertModuleAccess(
    organizationId: string,
    moduleKey: ModuleEntitlementKey | string,
    opts?: { userEmail?: string | null; isSuperAdmin?: boolean },
  ): Promise<void> {
    if (opts?.isSuperAdmin) {
      return;
    }
    if (isEmergencyModuleAccessEmail(opts?.userEmail)) {
      return;
    }
    const sub = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
    });
    if (!sub) {
      throw new ForbiddenException({
        statusCode: 403,
        code: "SUBSCRIPTION_MISSING",
        message: "Organization has no subscription record.",
      });
    }

    const om = await this.prisma.organizationModule.findUnique({
      where: {
        organizationId_moduleKey: {
          organizationId,
          moduleKey: String(moduleKey),
        },
      },
    });
    if (
      om?.cancelledAt &&
      om.accessUntil &&
      new Date().getTime() > om.accessUntil.getTime()
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        code: "MODULE_NOT_ENTITLED",
        message:
          "This module subscription has ended; renew or enable it again.",
        module: moduleKey,
        tier: sub.tier,
      });
    }

    if (sub.tier === SubscriptionTier.ENTERPRISE) {
      return;
    }

    const customList = parseCustomModules(sub.customConfig);
    if (customList && customList.length > 0) {
      if (isAllowedByConstructorModules(customList, moduleKey)) {
        return;
      }
      throw new ForbiddenException({
        statusCode: 403,
        code: "MODULE_NOT_ENTITLED",
        message:
          "This feature is not included in the current plan or add-ons.",
        module: moduleKey,
        tier: sub.tier,
      });
    }

    const ent = computeEntitlements(sub);
    let allowed = false;
    switch (moduleKey) {
      case "manufacturing":
        allowed = ent.manufacturing;
        break;
      case "fixed_assets":
        allowed = ent.fixedAssets;
        break;
      case "ifrs_mapping":
        allowed = ent.ifrsMapping;
        break;
      case "banking_pro":
      case "kassa_pro":
        allowed = ent.bankingPro;
        break;
      case "hr_full":
        allowed = ent.hrFull;
        break;
      default:
        allowed = new Set(sub.activeModules).has(String(moduleKey));
    }

    if (!allowed) {
      throw new ForbiddenException({
        statusCode: 403,
        code: "MODULE_NOT_ENTITLED",
        message:
          "This feature is not included in the current plan or add-ons.",
        module: moduleKey,
        tier: sub.tier,
      });
    }
  }

  async getOrganizationSnapshot(organizationId: string): Promise<{
    tier: SubscriptionTier;
    activeModules: string[];
    customConfig: unknown | null;
    modules: OrganizationModuleEntitlements;
    expiresAt: Date | null;
    isTrial: boolean;
  }> {
    let sub = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
    });
    if (!sub) {
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }
      const demoExpiresAt = new Date();
      demoExpiresAt.setUTCDate(demoExpiresAt.getUTCDate() + 14);
      sub = await this.prisma.organizationSubscription.create({
        data: {
          organizationId,
          tier: SubscriptionTier.BUSINESS,
          activeModules: [],
          customConfig: undefined,
          isTrial: true,
          expiresAt: demoExpiresAt,
          isBlocked: false,
        },
      });
    }

    const now = new Date();
    if (
      sub.expiresAt &&
      sub.expiresAt.getTime() < now.getTime() &&
      sub.isTrial
    ) {
      await this.prisma.organizationSubscription.update({
        where: { organizationId },
        data: {
          tier: SubscriptionTier.STARTER,
          isTrial: false,
          activeModules: [],
        },
      });
      sub = await this.prisma.organizationSubscription.findUniqueOrThrow({
        where: { organizationId },
      });
    }

    return {
      tier: sub.tier,
      activeModules: sub.activeModules,
      customConfig: sub.customConfig ?? null,
      modules: computeEntitlements(sub),
      expiresAt: sub.expiresAt,
      isTrial: sub.isTrial,
    };
  }

  async updateTier(
    organizationId: string,
    tier: SubscriptionTier,
  ): Promise<void> {
    await this.prisma.organizationSubscription.update({
      where: { organizationId },
      data: { tier },
    });
  }

  async updateModuleAddons(
    organizationId: string,
    patch: {
      production?: boolean;
      ifrs?: boolean;
      kassa_pro?: boolean;
      banking_pro?: boolean;
      inventory?: boolean;
      manufacturing?: boolean;
      hr_full?: boolean;
      ifrs_mapping?: boolean;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<{ activeModules: string[] }> {
    const db = tx ?? this.prisma;
    const sub = await db.organizationSubscription.findUnique({
      where: { organizationId },
    });
    if (!sub) {
      throw new NotFoundException("Organization subscription not found");
    }
    const set = new Set(sub.activeModules);

    const apply = (slug: string, v: boolean | undefined) => {
      if (v === undefined) return;
      if (v) set.add(slug);
      else set.delete(slug);
    };

    apply("kassa_pro", patch.kassa_pro);
    apply("banking_pro", patch.banking_pro);
    apply("inventory", patch.inventory);
    apply("manufacturing", patch.manufacturing);
    apply("hr_full", patch.hr_full);
    apply("ifrs_mapping", patch.ifrs_mapping);

    if (patch.production === true) {
      set.add("production");
    }
    if (patch.production === false) {
      set.delete("production");
    }

    if (patch.ifrs === true) {
      set.add("ifrs");
    }
    if (patch.ifrs === false) {
      set.delete("ifrs");
    }

    if (patch.manufacturing === false) {
      set.delete("production");
    }

    if (patch.ifrs_mapping === false) {
      set.delete("ifrs");
    }

    const activeModules = Array.from(set);
    await db.organizationSubscription.update({
      where: { organizationId },
      data: { activeModules },
    });
    await db.organization.update({
      where: { id: organizationId },
      data: { activeModules },
    });
    return { activeModules };
  }
}
