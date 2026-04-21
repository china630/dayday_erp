/**
 * Apply IFRS mapping template version to existing organizations.
 *
 * Stores per-org applied version in OrganizationSubscription.customConfig:
 *   { templates: { ifrsMapping: { version: number } } }
 */
import { LedgerType, AccountType } from "@prisma/client";
import { closePrismaPool, createPrismaClient } from "./prisma-client";
import { loadTemplateIfrsMappingPackage } from "./template-ifrs";

const prisma = createPrismaClient();

type TemplatesConfig = {
  templates?: {
    ifrsMapping?: { version?: number };
  };
};

function getAppliedVersion(customConfig: unknown): number {
  if (!customConfig || typeof customConfig !== "object") return 0;
  const cc = customConfig as TemplatesConfig;
  const v = cc.templates?.ifrsMapping?.version;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function withAppliedVersion(customConfig: unknown, version: number): object {
  const base =
    customConfig && typeof customConfig === "object" && !Array.isArray(customConfig)
      ? (customConfig as Record<string, unknown>)
      : {};
  const templates =
    base.templates && typeof base.templates === "object" && !Array.isArray(base.templates)
      ? (base.templates as Record<string, unknown>)
      : {};
  return {
    ...base,
    templates: {
      ...templates,
      ifrsMapping: { version },
    },
  };
}

async function ensureIfrsAccount(params: {
  organizationId: string;
  code: string;
  fallbackName: string;
  type: AccountType;
}) {
  const { organizationId, code, fallbackName, type } = params;
  const existing = await prisma.account.findFirst({
    where: { organizationId, ledgerType: LedgerType.IFRS, code },
  });
  if (existing) return existing;
  const catalog = await prisma.chartOfAccountsEntry.findUnique({ where: { code } });
  return prisma.account.create({
    data: {
      organizationId,
      ledgerType: LedgerType.IFRS,
      code,
      name: catalog?.name ?? fallbackName,
      type,
    },
  });
}

async function applyToOrganization(orgId: string, targetVersion: number) {
  const sub = await prisma.organizationSubscription.findUnique({
    where: { organizationId: orgId },
    select: { organizationId: true, customConfig: true },
  });
  if (!sub) {
    process.stdout.write(
      `[apply-ifrs-template] org=${orgId}: skipped (no organization_subscription)\n`,
    );
    return;
  }
  const current = getAppliedVersion(sub.customConfig);
  if (current >= targetVersion) {
    process.stdout.write(
      `[apply-ifrs-template] org=${orgId}: up-to-date (v${current})\n`,
    );
    return;
  }

  const pkg = await loadTemplateIfrsMappingPackage();
  const overrides = pkg.overrides;

  let applied = 0;
  let missingNas = 0;

  for (const o of overrides) {
    const nasCode = String(o.nasCode);
    const ifrsCode = String(o.ifrsCode);
    const ratio = String(o.ratio ?? pkg.defaultRule.ratio ?? "1");

    const nas = await prisma.account.findFirst({
      where: { organizationId: orgId, ledgerType: LedgerType.NAS, code: nasCode },
    });
    if (!nas) {
      missingNas += 1;
      continue;
    }

    const ifrs = await ensureIfrsAccount({
      organizationId: orgId,
      code: ifrsCode,
      fallbackName: `${nas.name} (IFRS)`,
      type: nas.type,
    });

    await prisma.accountMapping.upsert({
      where: {
        organizationId_nasAccountId: { organizationId: orgId, nasAccountId: nas.id },
      },
      create: {
        organizationId: orgId,
        nasAccountId: nas.id,
        ifrsAccountId: ifrs.id,
        ratio,
      },
      update: { ifrsAccountId: ifrs.id, ratio },
    });
    applied += 1;
  }

  await prisma.organizationSubscription.update({
    where: { organizationId: orgId },
    data: {
      customConfig: withAppliedVersion(sub.customConfig, targetVersion),
    },
  });

  process.stdout.write(
    `[apply-ifrs-template] org=${orgId}: applied overrides=${applied}, missingNas=${missingNas}, version ${current} → ${targetVersion}\n`,
  );
}

async function main() {
  const pkg = await loadTemplateIfrsMappingPackage();
  const target = pkg.version;
  const limit = process.env.ORG_LIMIT ? Number(process.env.ORG_LIMIT) : null;
  const orgId = process.env.ORG_ID?.trim() || null;

  const orgs = orgId
    ? [{ id: orgId }]
    : await prisma.organization.findMany({
        select: { id: true },
        ...(limit && Number.isFinite(limit) ? { take: limit } : null),
        orderBy: { createdAt: "asc" },
      });

  process.stdout.write(
    `[apply-ifrs-template] template=${pkg.templateKey}@v${pkg.version}, orgs=${orgs.length}\n`,
  );

  for (const o of orgs) {
    await applyToOrganization(o.id, target);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await closePrismaPool();
  });

