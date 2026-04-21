import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AccountType, LedgerType, Prisma } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateAccountMappingDto } from "./dto/create-account-mapping.dto";
import type { CreateBankAccountDto } from "./dto/create-bank-account.dto";

/** Клиент БД для операций счетов внутри `prisma.$transaction`. */
export type AccountsDb = PrismaService | Prisma.TransactionClient;

const Decimal = Prisma.Decimal;

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  listAccounts(organizationId: string, ledgerType: LedgerType) {
    return this.prisma.account.findMany({
      where: { organizationId, ledgerType },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        ledgerType: true,
        currency: true,
      },
    });
  }

  /** Глобальный справочник: только счета кассы (cashProfile AZN / FX). */
  listCashChartCatalogEntries() {
    return this.prisma.chartOfAccountsEntry.findMany({
      where: { isDeprecated: false, cashProfile: { not: null } },
      orderBy: [{ cashProfile: "asc" }, { code: "asc" }],
      select: { code: true, name: true, cashProfile: true },
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
            name: n.name,
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
          name: "Дебиторская задолженность (IFRS)",
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
          name: "Выручка (IFRS Revenue)",
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
          select: { id: true, code: true, name: true, ledgerType: true },
        },
        ifrsAccount: {
          select: { id: true, code: true, name: true, ledgerType: true },
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
          select: { id: true, code: true, name: true, ledgerType: true },
        },
        ifrsAccount: {
          select: { id: true, code: true, name: true, ledgerType: true },
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
          name,
          type: AccountType.ASSET,
          currency: dto.currency ?? "AZN",
          parentId: parent.id,
        },
        select: { id: true, code: true, name: true, currency: true, ledgerType: true },
      });
    });
  }
}
