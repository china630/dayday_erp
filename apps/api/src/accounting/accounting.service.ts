import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  FixedAssetStatus,
  LedgerType,
  InvoiceStatus,
  Prisma,
  UserRole,
} from "@dayday/database";
import { assertMayPostManualJournal } from "../auth/policies/invoice-finance.policy";
import { PrismaService } from "../prisma/prisma.service";
import {
  getClosedPeriodKeys,
  getLockedPeriodUntil,
  monthRangeUtc,
  monthKeyUtc,
} from "../reporting/reporting-period.util";
import { IfrsAutoMappingService } from "./ifrs-auto-mapping.service";

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;
function asCount(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") return Number(v) || 0;
  return 0;
}

export type PostTransactionLine = {
  accountCode: string;
  debit: string | number;
  credit: string | number;
};

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ifrsAutoMapping: IfrsAutoMappingService,
  ) {}

  validateBalance(lines: PostTransactionLine[]): void {
    if (!lines?.length) {
      throw new BadRequestException("lines required");
    }
    let sumDr = new Decimal(0);
    let sumCr = new Decimal(0);
    for (const line of lines) {
      const dr = new Decimal(line.debit ?? 0);
      const cr = new Decimal(line.credit ?? 0);
      if (dr.gt(0) && cr.gt(0)) {
        throw new BadRequestException(
          `Line for ${line.accountCode}: debit and credit both set`,
        );
      }
      sumDr = sumDr.add(dr);
      sumCr = sumCr.add(cr);
    }
    if (!sumDr.equals(sumCr) || sumDr.lte(0)) {
      throw new BadRequestException(
        `Unbalanced transaction: debit=${sumDr.toString()} credit=${sumCr.toString()}`,
      );
    }
  }

  /**
   * Запись проводок внутри уже открытой транзакции Prisma (сверка банка, переоценка).
   */
  async postJournalInTransaction(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string;
      date: Date;
      reference?: string;
      description?: string;
      /** false — курс/суммы «плавают» до подтверждения бухгалтером */
      isFinal?: boolean;
      /** Аналитика: контрагент (закупки, взаимозачёт и т.д.) */
      counterpartyId?: string | null;
      /** ЦФО: фильтр P&L по департаменту для расходных/прочих проводок. */
      departmentId?: string | null;
      ledgerType?: LedgerType;
      lines: PostTransactionLine[];
    },
  ): Promise<{ transactionId: string }> {
    const {
      organizationId,
      date,
      reference,
      description,
      isFinal,
      counterpartyId,
      departmentId,
      ledgerType = LedgerType.NAS,
      lines,
    } = params;
    this.validateBalance(lines);

    const org = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const closed = getClosedPeriodKeys(org?.settings);
    const key = monthKeyUtc(date);
    if (closed.includes(key)) {
      throw new BadRequestException(
        `Период ${key} закрыт: новые проводки на эту дату недоступны`,
      );
    }
    const lockedPeriodUntil = getLockedPeriodUntil(org?.settings);
    if (lockedPeriodUntil && date.getTime() <= lockedPeriodUntil.getTime()) {
      throw new HttpException("Период закрыт для изменений", 423);
    }

    const codes = [...new Set(lines.map((l) => l.accountCode))];
    const accounts = await tx.account.findMany({
      where: {
        organizationId,
        code: { in: codes },
        ledgerType,
      },
    });
    const byCode = new Map<string, { id: string; code: string }>();
    for (const acc of accounts) {
      byCode.set(acc.code, acc);
    }
    for (const code of codes) {
      if (!byCode.get(code)) {
        throw new NotFoundException(`Account code ${code} not found for organization`);
      }
    }

    if (departmentId != null && departmentId !== "") {
      const dept = await tx.department.findFirst({
        where: { id: departmentId, organizationId },
      });
      if (!dept) {
        throw new NotFoundException("Department not found for organization");
      }
    }

    const transaction = await tx.transaction.create({
      data: {
        organizationId,
        date,
        reference: reference ?? null,
        description: description ?? null,
        isFinal: isFinal ?? false,
        counterpartyId: counterpartyId ?? null,
        departmentId:
          departmentId != null && departmentId !== "" ? departmentId : null,
      },
    });

    const nasLines: Array<{
      accountCode: string;
      accountId: string;
      debit: Decimal;
      credit: Decimal;
    }> = [];

    for (const line of lines) {
      const account = byCode.get(line.accountCode);
      if (!account) {
        throw new NotFoundException(`Account code ${line.accountCode} not found`);
      }
      const debit = new Decimal(line.debit ?? 0);
      const credit = new Decimal(line.credit ?? 0);
      await tx.journalEntry.create({
        data: {
          organizationId,
          transactionId: transaction.id,
          accountId: account.id,
          debit,
          credit,
          ledgerType,
        },
      });
      nasLines.push({
        accountCode: line.accountCode,
        accountId: account.id,
        debit,
        credit,
      });
    }

    if (ledgerType === LedgerType.NAS) {
      await this.ifrsAutoMapping.mirrorFromNas({
        tx,
        organizationId,
        transactionId: transaction.id,
        nasLines,
      });
    }

    return { transactionId: transaction.id };
  }

  async postTransaction(params: {
    organizationId: string;
    date: Date;
    reference?: string;
    description?: string;
    isFinal?: boolean;
    counterpartyId?: string | null;
    departmentId?: string | null;
    ledgerType?: LedgerType;
    lines: PostTransactionLine[];
    /** Ручная проводка (UI): проверка политики USER. */
    actingUserRole?: UserRole;
  }): Promise<{ transactionId: string }> {
    if (params.actingUserRole !== undefined) {
      assertMayPostManualJournal(params.actingUserRole);
    }
    const { actingUserRole: _role, ...journalParams } = params;
    return this.prisma.$transaction((tx) =>
      this.postJournalInTransaction(tx, journalParams),
    );
  }

  async getPeriodCloseChecklist(
    organizationId: string,
    month: string,
  ): Promise<{
    month: string;
    allPassed: boolean;
    checks: {
      noDraftInvoices: { ok: boolean; draftCount: number };
      noNegativeStock: { ok: boolean; affectedCount: number };
      noNegativeCash: { ok: boolean; affectedAccounts: string[] };
      depreciationAccruedIfNeeded: {
        ok: boolean;
        activeAssets: number;
        depreciationMonthsFound: number;
      };
      noUnfinishedManufacturingCycles: {
        ok: boolean;
        unresolvedCount: number;
      };
      noBrokenJournalLinks: {
        ok: boolean;
        brokenLinksCount: number;
      };
    };
  }> {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException("month must be YYYY-MM");
    }
    const year = Number(month.slice(0, 4));
    const mon = Number(month.slice(5, 7));
    const { start, end } = monthRangeUtc(year, mon);

    const draftCount = await this.prisma.invoice.count({
      where: {
        organizationId,
        status: InvoiceStatus.DRAFT,
        createdAt: { gte: start, lte: end },
      },
    });

    const negativeStockItems = await this.prisma.stockItem.count({
      where: {
        organizationId,
        quantity: { lt: 0 },
      },
    });

    const cashAccounts = await this.prisma.account.findMany({
      where: {
        organizationId,
        ledgerType: LedgerType.NAS,
        OR: [
          { code: { startsWith: "101" } },
          { code: { startsWith: "221" } },
          { code: { startsWith: "222" } },
          { code: { startsWith: "223" } },
          { code: { startsWith: "224" } },
        ],
      },
      select: { id: true, code: true },
    });
    const cashAgg = cashAccounts.length
      ? await this.prisma.journalEntry.groupBy({
          by: ["accountId"],
          where: {
            organizationId,
            ledgerType: LedgerType.NAS,
            accountId: { in: cashAccounts.map((a) => a.id) },
            transaction: { isFinal: true, date: { lte: end } },
          },
          _sum: { debit: true, credit: true },
        })
      : [];
    const cashById = new Map(cashAccounts.map((a) => [a.id, a.code]));
    const negativeCashAccounts = cashAgg
      .filter((row) => {
        const dr = row._sum.debit ?? new Decimal(0);
        const cr = row._sum.credit ?? new Decimal(0);
        return dr.sub(cr).lt(0);
      })
      .map((row) => cashById.get(row.accountId))
      .filter((x): x is string => Boolean(x));

    const activeAssets = await this.prisma.fixedAsset.count({
      where: { organizationId, status: FixedAssetStatus.ACTIVE },
    });
    const depreciationMonthsFound =
      activeAssets > 0
        ? await this.prisma.fixedAssetDepreciationMonth.count({
            where: { organizationId, year, month: mon },
          })
        : 0;
    const depreciationOk =
      activeAssets === 0 || depreciationMonthsFound > 0;

    const unresolvedManufacturingRows = await this.prisma.$queryRaw<
      Array<{ count: unknown }>
    >(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM stock_movements sm
      WHERE sm.organization_id = ${organizationId}::uuid
        AND sm.reason = 'MANUFACTURING'
        AND sm.document_date >= ${start}
        AND sm.document_date <= ${end}
        AND NOT EXISTS (
          SELECT 1
          FROM transactions t
          WHERE t.organization_id = sm.organization_id
            AND t.is_final = true
            AND t.reference LIKE 'MFG-%'
            AND t.date >= ${start}
            AND t.date <= ${end}
        )
    `);
    const unresolvedManufacturing = asCount(unresolvedManufacturingRows[0]?.count);

    const brokenJournalRows = await this.prisma.$queryRaw<
      Array<{ count: unknown }>
    >(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM journal_entries je
      LEFT JOIN transactions t ON t.id = je.transaction_id
      WHERE je.organization_id = ${organizationId}::uuid
        AND t.id IS NULL
    `);
    const brokenJournalLinks = asCount(brokenJournalRows[0]?.count);

    const checks = {
      noDraftInvoices: { ok: draftCount === 0, draftCount },
      noNegativeStock: {
        ok: negativeStockItems === 0,
        affectedCount: negativeStockItems,
      },
      noNegativeCash: {
        ok: negativeCashAccounts.length === 0,
        affectedAccounts: negativeCashAccounts,
      },
      depreciationAccruedIfNeeded: {
        ok: depreciationOk,
        activeAssets,
        depreciationMonthsFound,
      },
      noUnfinishedManufacturingCycles: {
        ok: unresolvedManufacturing === 0,
        unresolvedCount: unresolvedManufacturing,
      },
      noBrokenJournalLinks: {
        ok: brokenJournalLinks === 0,
        brokenLinksCount: brokenJournalLinks,
      },
    };
    const allPassed =
      checks.noDraftInvoices.ok &&
      checks.noNegativeStock.ok &&
      checks.noNegativeCash.ok &&
      checks.depreciationAccruedIfNeeded.ok &&
      checks.noUnfinishedManufacturingCycles.ok &&
      checks.noBrokenJournalLinks.ok;

    return { month, allPassed, checks };
  }
}
