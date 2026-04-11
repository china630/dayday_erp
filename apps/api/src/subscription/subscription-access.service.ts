import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, SubscriptionTier } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { type ModuleEntitlementKey } from "./subscription.constants";

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

function normalizeActiveModules(m: unknown): string[] {
  if (!Array.isArray(m)) return [];
  return m.map((x) => String(x).trim()).filter(Boolean);
}

/** Prisma @db.Uuid: пустая строка / мусор дают ошибку клиента («пустой where» / невалидный UUID). */
const ORG_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isOrganizationUuid(id: string): boolean {
  return ORG_ID_UUID_RE.test(id);
}

/**
 * Допустимый organizationId для запросов в БД; иначе — не вызывать Prisma.
 */
function parseOrganizationId(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || t === "undefined" || t === "null") return null;
  return t;
}

function isSubscriptionTier(v: unknown): v is SubscriptionTier {
  return (
    v === SubscriptionTier.STARTER ||
    v === SubscriptionTier.BUSINESS ||
    v === SubscriptionTier.ENTERPRISE
  );
}

/** Минимальный снимок без строки подписки (в схеме нет tier FREE — STARTER = базовый доступ). */
function emptyOrganizationSnapshot(): {
  tier: SubscriptionTier;
  activeModules: string[];
  customConfig: unknown | null;
  modules: OrganizationModuleEntitlements;
  expiresAt: Date | null;
  isTrial: boolean;
} {
  return {
    tier: SubscriptionTier.STARTER,
    activeModules: [],
    customConfig: null,
    modules: {
      manufacturing: false,
      fixedAssets: false,
      ifrsMapping: false,
      bankingPro: false,
      hrFull: false,
    },
    expiresAt: null,
    isTrial: false,
  };
}

function computeEntitlementsLegacy(sub: {
  tier: SubscriptionTier;
  activeModules: string[];
}): OrganizationModuleEntitlements {
  const modules = new Set(normalizeActiveModules(sub.activeModules));
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
  const tier = isSubscriptionTier(sub.tier)
    ? sub.tier
    : SubscriptionTier.STARTER;
  const safe = {
    tier,
    activeModules: normalizeActiveModules(sub.activeModules),
    customConfig: sub.customConfig ?? null,
  };
  if (safe.tier === SubscriptionTier.ENTERPRISE) {
    return {
      manufacturing: true,
      fixedAssets: true,
      ifrsMapping: true,
      bankingPro: true,
      hrFull: true,
    };
  }
  const customList = parseCustomModules(safe.customConfig);
  if (customList && customList.length > 0) {
    return entitlementsFromConstructorModules(customList);
  }
  return computeEntitlementsLegacy(safe);
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
  private readonly logger = new Logger(SubscriptionAccessService.name);

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

    const ent = computeEntitlements({
      tier: sub.tier,
      activeModules: normalizeActiveModules(sub.activeModules),
      customConfig: sub.customConfig ?? null,
    });
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
        allowed = new Set(normalizeActiveModules(sub.activeModules)).has(
          String(moduleKey),
        );
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
    const id = parseOrganizationId(organizationId);
    if (!id || !isOrganizationUuid(id)) {
      if (organizationId !== undefined && organizationId !== null && organizationId !== "") {
        this.logger.warn(
          `getOrganizationSnapshot: invalid organizationId (no DB query), raw=${String(organizationId)}`,
        );
      }
      return emptyOrganizationSnapshot();
    }

    try {
      let sub: Awaited<
        ReturnType<PrismaService["organizationSubscription"]["findUnique"]>
      >;
      try {
        sub = await this.prisma.organizationSubscription.findUnique({
          where: { organizationId: id },
        });
      } catch (e) {
        this.logger.warn(
          `getOrganizationSnapshot: subscription findUnique failed for ${id}: ${e instanceof Error ? e.message : String(e)}`,
        );
        return emptyOrganizationSnapshot();
      }

      if (!sub) {
        this.logger.warn(
          `getOrganizationSnapshot: no subscription row for org ${id}, returning default snapshot`,
        );
        return emptyOrganizationSnapshot();
      }

      const now = new Date();
      if (
        sub.expiresAt &&
        sub.expiresAt.getTime() < now.getTime() &&
        sub.isTrial
      ) {
        await this.prisma.organizationSubscription.update({
          where: { organizationId: id },
          data: {
            tier: SubscriptionTier.STARTER,
            isTrial: false,
            activeModules: [],
          },
        });
        const refreshed = await this.prisma.organizationSubscription.findUnique({
          where: { organizationId: id },
        });
        if (!refreshed) {
          this.logger.warn(
            `getOrganizationSnapshot: subscription row missing after trial rollover for ${id}`,
          );
          return emptyOrganizationSnapshot();
        }
        sub = refreshed;
      }

      const tier = isSubscriptionTier(sub.tier)
        ? sub.tier
        : SubscriptionTier.STARTER;
      const activeModules = normalizeActiveModules(sub.activeModules);
      const customConfig = sub.customConfig ?? null;

      return {
        tier,
        activeModules,
        customConfig,
        modules: computeEntitlements({
          tier,
          activeModules,
          customConfig,
        }),
        expiresAt: sub.expiresAt ?? null,
        isTrial: Boolean(sub.isTrial),
      };
    } catch (e) {
      this.logger.warn(
        `getOrganizationSnapshot failed for ${id}: ${e instanceof Error ? e.stack ?? e.message : String(e)}`,
      );
      return emptyOrganizationSnapshot();
    }
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
