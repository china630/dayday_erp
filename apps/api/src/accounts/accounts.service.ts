import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { TemplateAccount } from "@prisma/client";
import {
  AccountType,
  CoaTemplateProfile,
  LedgerType,
  pickAccountDisplayName,
  Prisma,
  TemplateGroup,
} from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateAccountMappingDto } from "./dto/create-account-mapping.dto";
import type { CreateBankAccountDto } from "./dto/create-bank-account.dto";
import type { CreateIfrsMappingRuleDto } from "./dto/create-ifrs-mapping-rule.dto";
import type { UpdateIfrsMappingRuleDto } from "./dto/update-ifrs-mapping-rule.dto";

/** Клиент БД для операций счетов внутри `prisma.$transaction`. */
export type AccountsDb = PrismaService | Prisma.TransactionClient;

const Decimal = Prisma.Decimal;

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  listAccounts(organizationId: string, ledgerType: LedgerType, locale?: string | null) {
    return this.prisma.account
      .findMany({
        where: { organizationId, ledgerType },
        orderBy: { code: "asc" },
        select: {
          id: true,
          code: true,
          nameAz: true,
          nameRu: true,
          nameEn: true,
          type: true,
          ledgerType: true,
          currency: true,
        },
      })
      .then((rows) =>
        rows.map((r) => ({
          ...r,
          displayName: pickAccountDisplayName(r, locale),
        })),
      );
  }

  /**
   * Глобальный справочник кассы: приоритет `template_accounts`, иначе legacy
   * `chart_of_accounts_entries`.
   */
  async listCashChartCatalogEntries(locale?: string | null) {
    const tplCount = await this.prisma.templateAccount.count({
      where: { isDeprecated: false, cashProfile: { not: null } },
    });
    if (tplCount > 0) {
      const rows = await this.prisma.templateAccount.findMany({
        where: { isDeprecated: false, cashProfile: { not: null } },
        orderBy: [{ cashProfile: "asc" }, { code: "asc" }],
        select: {
          code: true,
          nameAz: true,
          nameRu: true,
          nameEn: true,
          cashProfile: true,
        },
      });
      return rows.map((r) => ({
        ...r,
        displayName: pickAccountDisplayName(r, locale),
      }));
    }

    return this.prisma.chartOfAccountsEntry
      .findMany({
        where: { isDeprecated: false, cashProfile: { not: null } },
        orderBy: [{ cashProfile: "asc" }, { code: "asc" }],
        select: {
          code: true,
          nameAz: true,
          nameRu: true,
          nameEn: true,
          cashProfile: true,
        },
      })
      .then((rows) =>
        rows.map((r) => ({
          ...r,
          displayName: pickAccountDisplayName(r, locale),
        })),
      );
  }

  /**
   * Счета из глобального `template_accounts`, которых ещё нет среди NAS-счетов организации.
   */
  async listNasTemplateCatalogForImport(
    organizationId: string,
    opts: {
      search?: string;
      locale?: string | null;
      templateProfile?: CoaTemplateProfile;
    },
  ) {
    const existingCodes = (
      await this.prisma.account.findMany({
        where: { organizationId, ledgerType: LedgerType.NAS },
        select: { code: true },
      })
    ).map((a) => a.code);

    const where: Prisma.TemplateAccountWhereInput = {
      isDeprecated: false,
      ...(existingCodes.length > 0 ? { code: { notIn: existingCodes } } : {}),
    };

    if (opts.templateProfile) {
      where.templateGroups = { has: opts.templateProfile };
    }

    const s = opts.search?.trim();
    if (s) {
      where.AND = [
        {
          OR: [
            { code: { contains: s, mode: "insensitive" } },
            { nameAz: { contains: s, mode: "insensitive" } },
            { nameRu: { contains: s, mode: "insensitive" } },
            { nameEn: { contains: s, mode: "insensitive" } },
          ],
        },
      ];
    }

    const rows = await this.prisma.templateAccount.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      take: 250,
      select: {
        id: true,
        code: true,
        nameAz: true,
        nameRu: true,
        nameEn: true,
        accountType: true,
        parentCode: true,
        templateGroups: true,
      },
    });
    return rows.map((r) => ({
      ...r,
      displayName: pickAccountDisplayName(r, opts.locale),
    }));
  }

  /**
   * Добавляет в локальный NAS-план строку из глобального шаблона (с цепочкой родителей при необходимости).
   */
  async importNasAccountFromTemplate(
    organizationId: string,
    templateAccountId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const leaf = await tx.templateAccount.findUnique({
        where: { id: templateAccountId },
      });
      if (!leaf || leaf.isDeprecated) {
        throw new NotFoundException("Template account not found");
      }

      const existingLeaf = await tx.account.findFirst({
        where: {
          organizationId,
          ledgerType: LedgerType.NAS,
          code: leaf.code,
        },
      });
      if (existingLeaf) {
        throw new ConflictException(`NAS account ${leaf.code} already exists`);
      }

      const chain: TemplateAccount[] = [];
      let cur: TemplateAccount | null = leaf;
      while (cur) {
        chain.unshift(cur);
        const pc = (cur.parentCode ?? "").trim();
        if (!pc) break;
        const parentTpl: TemplateAccount | null = await tx.templateAccount.findUnique({
          where: { code: pc },
        });
        if (!parentTpl) {
          throw new BadRequestException(
            `Parent template for code ${cur.code} not found (${pc})`,
          );
        }
        cur = parentTpl;
      }

      const idByCode = new Map<string, string>();

      for (const row of chain) {
        const acc = await tx.account.findFirst({
          where: {
            organizationId,
            ledgerType: LedgerType.NAS,
            code: row.code,
          },
        });
        if (acc) {
          idByCode.set(row.code, acc.id);
          continue;
        }

        const parentId = row.parentCode?.trim()
          ? idByCode.get(row.parentCode.trim()) ?? null
          : null;

        const catalogRow = await tx.chartOfAccountsEntry.findFirst({
          where: { templateGroup: TemplateGroup.COMMERCIAL, code: row.code },
        });

        const created = await tx.account.create({
          data: {
            organizationId,
            code: row.code,
            nameAz: row.nameAz,
            nameRu: row.nameRu,
            nameEn: row.nameEn,
            type: row.accountType,
            ledgerType: LedgerType.NAS,
            parentId,
            chartEntryId: catalogRow?.id ?? null,
            templateAccountId: row.id,
          },
          select: {
            id: true,
            code: true,
            nameAz: true,
            nameRu: true,
            nameEn: true,
            type: true,
            ledgerType: true,
            parentId: true,
            templateAccountId: true,
          },
        });
        idByCode.set(row.code, created.id);
      }

      await this.mirrorNasToIfrs(organizationId, tx);

      return tx.account.findFirstOrThrow({
        where: {
          organizationId,
          ledgerType: LedgerType.NAS,
          code: leaf.code,
        },
        select: {
          id: true,
          code: true,
          nameAz: true,
          nameRu: true,
          nameEn: true,
          type: true,
          ledgerType: true,
          parentId: true,
          templateAccountId: true,
        },
      });
    });
  }

  /**
   * Создаёт недостающие счета IFRS с теми же кодами/иерархией, что NAS (для маппинга и теневых проводок).
   */
  async mirrorNasToIfrs(
    organizationId: string,
    db: AccountsDb = this.prisma,
  ): Promise<{ created: number }> {
    const nasAll = await db.account.findMany({
      where: { organizationId, ledgerType: LedgerType.NAS },
      orderBy: { code: "asc" },
    });
    if (nasAll.length === 0) {
      return { created: 0 };
    }

    const existingIfrs = await db.account.findMany({
      where: { organizationId, ledgerType: LedgerType.IFRS },
      select: { id: true, code: true },
    });
    const ifrsByCode = new Map(existingIfrs.map((a) => [a.code, a]));

    const nasIdToIfrsId = new Map<string, string>();
    for (const n of nasAll) {
      const ex = ifrsByCode.get(n.code);
      if (ex) nasIdToIfrsId.set(n.id, ex.id);
    }

    let created = 0;
    let pending = nasAll.filter((n) => !nasIdToIfrsId.has(n.id));
    let guard = 0;
    while (pending.length > 0 && guard < nasAll.length + 100) {
      guard += 1;
      const still: typeof nasAll = [];
      for (const n of pending) {
        const parentIfrs =
          n.parentId == null ? null : nasIdToIfrsId.get(n.parentId);
        if (n.parentId != null && parentIfrs == null) {
          still.push(n);
          continue;
        }
        const row = await db.account.create({
          data: {
            organizationId,
            code: n.code,
            nameAz: n.nameAz,
            nameRu: n.nameRu,
            nameEn: n.nameEn,
            type: n.type,
            currency: n.currency,
            ledgerType: LedgerType.IFRS,
            parentId: parentIfrs,
          },
        });
        nasIdToIfrsId.set(n.id, row.id);
        ifrsByCode.set(n.code, row);
        created += 1;
      }
      if (still.length === pending.length) {
        throw new BadRequestException(
          "IFRS mirror: не удалось разрешить иерархию parentId",
        );
      }
      pending = still;
    }

    return { created };
  }

  /**
   * Для новой организации: зеркало NAS→IFRS + IFRS 1200/4000 + маппинг NAS 211→1200, NAS 601→4000.
   * Идемпотентно (upsert маппингов, mirror пропускает уже существующие IFRS-коды).
   */
  async bootstrapMultiGaapForNewOrganization(
    organizationId: string,
    db: AccountsDb = this.prisma,
  ): Promise<void> {
    await this.mirrorNasToIfrs(organizationId, db);

    const nas211 = await db.account.findFirst({
      where: {
        organizationId,
        ledgerType: LedgerType.NAS,
        code: "211",
      },
    });
    const nas601 = await db.account.findFirst({
      where: {
        organizationId,
        ledgerType: LedgerType.NAS,
        code: "601",
      },
    });
    if (!nas211 || !nas601) {
      return;
    }

    let ifrs1200 = await db.account.findFirst({
      where: {
        organizationId,
        ledgerType: LedgerType.IFRS,
        code: "1200",
      },
    });
    if (!ifrs1200) {
      ifrs1200 = await db.account.create({
        data: {
          organizationId,
          code: "1200",
          nameAz: "Debitor borcu (IFRS)",
          nameRu: "Дебиторская задолженность (IFRS)",
          nameEn: "Trade receivables (IFRS)",
          type: AccountType.ASSET,
          ledgerType: LedgerType.IFRS,
        },
      });
    }

    let ifrs4000 = await db.account.findFirst({
      where: {
        organizationId,
        ledgerType: LedgerType.IFRS,
        code: "4000",
      },
    });
    if (!ifrs4000) {
      ifrs4000 = await db.account.create({
        data: {
          organizationId,
          code: "4000",
          nameAz: "Gəlir (IFRS)",
          nameRu: "Выручка (IFRS Revenue)",
          nameEn: "Revenue (IFRS)",
          type: AccountType.REVENUE,
          ledgerType: LedgerType.IFRS,
        },
      });
    }

    await db.accountMapping.upsert({
      where: {
        organizationId_nasAccountId: {
          organizationId,
          nasAccountId: nas211.id,
        },
      },
      create: {
        organizationId,
        nasAccountId: nas211.id,
        ifrsAccountId: ifrs1200.id,
        ratio: 1,
      },
      update: { ifrsAccountId: ifrs1200.id, ratio: 1 },
    });

    await db.accountMapping.upsert({
      where: {
        organizationId_nasAccountId: {
          organizationId,
          nasAccountId: nas601.id,
        },
      },
      create: {
        organizationId,
        nasAccountId: nas601.id,
        ifrsAccountId: ifrs4000.id,
        ratio: 1,
      },
      update: { ifrsAccountId: ifrs4000.id, ratio: 1 },
    });
  }

  listMappings(organizationId: string) {
    return this.prisma.accountMapping.findMany({
      where: { organizationId },
      include: {
        nasAccount: {
          select: {
            id: true,
            code: true,
            nameAz: true,
            nameRu: true,
            nameEn: true,
            ledgerType: true,
          },
        },
        ifrsAccount: {
          select: {
            id: true,
            code: true,
            nameAz: true,
            nameRu: true,
            nameEn: true,
            ledgerType: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createMapping(
    organizationId: string,
    dto: CreateAccountMappingDto,
  ) {
    const ratio =
      dto.ratio != null && dto.ratio !== ""
        ? new Decimal(dto.ratio)
        : new Decimal(1);
    if (ratio.lte(0)) {
      throw new BadRequestException("ratio must be positive");
    }

    const [nas, ifrs] = await Promise.all([
      this.prisma.account.findFirst({
        where: {
          id: dto.nasAccountId,
          organizationId,
          ledgerType: LedgerType.NAS,
        },
      }),
      this.prisma.account.findFirst({
        where: {
          id: dto.ifrsAccountId,
          organizationId,
          ledgerType: LedgerType.IFRS,
        },
      }),
    ]);
    if (!nas) {
      throw new NotFoundException("NAS account not found in organization");
    }
    if (!ifrs) {
      throw new NotFoundException("IFRS account not found in organization");
    }

    return this.prisma.accountMapping.create({
      data: {
        organizationId,
        nasAccountId: nas.id,
        ifrsAccountId: ifrs.id,
        ratio,
      },
      include: {
        nasAccount: {
          select: {
            id: true,
            code: true,
            nameAz: true,
            nameRu: true,
            nameEn: true,
            ledgerType: true,
          },
        },
        ifrsAccount: {
          select: {
            id: true,
            code: true,
            nameAz: true,
            nameRu: true,
            nameEn: true,
            ledgerType: true,
          },
        },
      },
    });
  }

  async deleteMapping(organizationId: string, id: string): Promise<void> {
    const row = await this.prisma.accountMapping.findFirst({
      where: { id, organizationId },
    });
    if (!row) {
      throw new NotFoundException("Mapping not found");
    }
    await this.prisma.accountMapping.delete({ where: { id } });
  }

  listIfrsMappingRules(organizationId: string) {
    return this.prisma.ifrsMappingRule.findMany({
      where: { organizationId },
      orderBy: [
        { sourceNasAccountCode: "asc" },
        { targetIfrsAccountCode: "asc" },
      ],
    });
  }

  async createIfrsMappingRule(
    organizationId: string,
    dto: CreateIfrsMappingRuleDto,
  ) {
    const source = dto.sourceNasAccountCode.trim();
    const target = dto.targetIfrsAccountCode.trim();
    if (!source || !target) {
      throw new BadRequestException("sourceNasAccountCode and targetIfrsAccountCode are required");
    }
    return this.prisma.ifrsMappingRule.create({
      data: {
        organizationId,
        sourceNasAccountCode: source,
        targetIfrsAccountCode: target,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateIfrsMappingRule(
    organizationId: string,
    id: string,
    dto: UpdateIfrsMappingRuleDto,
  ) {
    const existing = await this.prisma.ifrsMappingRule.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("IFRS mapping rule not found");

    const data: Prisma.IfrsMappingRuleUpdateInput = {};
    if (dto.sourceNasAccountCode !== undefined) {
      data.sourceNasAccountCode = dto.sourceNasAccountCode.trim();
    }
    if (dto.targetIfrsAccountCode !== undefined) {
      data.targetIfrsAccountCode = dto.targetIfrsAccountCode.trim();
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    return this.prisma.ifrsMappingRule.update({
      where: { id },
      data,
    });
  }

  async deleteIfrsMappingRule(organizationId: string, id: string): Promise<void> {
    const existing = await this.prisma.ifrsMappingRule.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("IFRS mapping rule not found");
    await this.prisma.ifrsMappingRule.delete({ where: { id } });
  }

  async createBankAccount(organizationId: string, dto: CreateBankAccountDto) {
    const code = dto.code.trim();
    const name = dto.name.trim();
    if (!code || !name) {
      throw new BadRequestException("code and name are required");
    }
    if (!code.startsWith("221.")) {
      throw new BadRequestException("code must start with 221.");
    }

    return this.prisma.$transaction(async (tx) => {
      const exists = await tx.account.findFirst({
        where: { organizationId, ledgerType: LedgerType.NAS, code },
        select: { id: true },
      });
      if (exists) {
        throw new BadRequestException("Account code already exists");
      }

      const parent = await tx.account.findFirst({
        where: { organizationId, ledgerType: LedgerType.NAS, code: "221" },
        select: { id: true },
      });
      if (!parent) {
        throw new NotFoundException("Parent bank account 221 not found");
      }

      return tx.account.create({
        data: {
          organizationId,
          ledgerType: LedgerType.NAS,
          code,
          nameAz: name,
          nameRu: name,
          nameEn: name,
          type: AccountType.ASSET,
          currency: dto.currency ?? "AZN",
          parentId: parent.id,
        },
        select: {
          id: true,
          code: true,
          nameAz: true,
          nameRu: true,
          nameEn: true,
          currency: true,
          ledgerType: true,
        },
      });
    });
  }
}
