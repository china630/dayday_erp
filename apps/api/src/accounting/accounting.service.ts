import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Decimal,
  LedgerType,
  Prisma,
  UserRole,
  type Account,
} from "@dayday/database";
import { assertMayPostManualJournal } from "../auth/policies/invoice-finance.policy";
import { PrismaService } from "../prisma/prisma.service";
import {
  getClosedPeriodKeys,
  monthKeyUtc,
} from "../reporting/reporting-period.util";

export type PostTransactionLine = {
  accountCode: string;
  debit: string | number;
  credit: string | number;
};

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  private validateLines(lines: PostTransactionLine[]): void {
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
      lines: PostTransactionLine[];
    },
  ): Promise<{ transactionId: string }> {
    const { organizationId, date, reference, description, isFinal, counterpartyId, lines } =
      params;
    this.validateLines(lines);

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

    const codes = [...new Set(lines.map((l) => l.accountCode))];
    const accounts = await tx.account.findMany({
      where: {
        organizationId,
        code: { in: codes },
        ledgerType: LedgerType.NAS,
      },
    });
    const byCode = new Map<string, Account>();
    for (const acc of accounts) {
      byCode.set(acc.code, acc);
    }
    for (const code of codes) {
      if (!byCode.get(code)) {
        throw new NotFoundException(`Account code ${code} not found for organization`);
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
      },
    });

    const nasLines: Array<{
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
          ledgerType: LedgerType.NAS,
        },
      });
      nasLines.push({ accountId: account.id, debit, credit });
    }

    await this.translateToIFRS(tx, organizationId, transaction.id, nasLines);

    return { transactionId: transaction.id };
  }

  /**
   * Теневые проводки IFRS для той же транзакции: только если у всех задействованных
   * NAS-счетов есть маппинг и после коэффициентов сумма Дт = Кт.
   */
  private async translateToIFRS(
    tx: Prisma.TransactionClient,
    organizationId: string,
    transactionId: string,
    nasLines: Array<{ accountId: string; debit: Decimal; credit: Decimal }>,
  ): Promise<void> {
    if (nasLines.length === 0) return;
    const nasIds = [...new Set(nasLines.map((l) => l.accountId))];
    const mappings = await tx.accountMapping.findMany({
      where: { organizationId, nasAccountId: { in: nasIds } },
    });
    const mapByNas = new Map(mappings.map((m) => [m.nasAccountId, m]));
    for (const id of nasIds) {
      if (!mapByNas.has(id)) return;
    }
    let sumDr = new Decimal(0);
    let sumCr = new Decimal(0);
    for (const line of nasLines) {
      const m = mapByNas.get(line.accountId)!;
      const ratio = new Decimal(m.ratio);
      sumDr = sumDr.add(line.debit.mul(ratio));
      sumCr = sumCr.add(line.credit.mul(ratio));
    }
    if (!sumDr.equals(sumCr)) return;

    for (const line of nasLines) {
      const m = mapByNas.get(line.accountId)!;
      const ratio = new Decimal(m.ratio);
      const d = line.debit.mul(ratio);
      const c = line.credit.mul(ratio);
      if (d.isZero() && c.isZero()) continue;
      await tx.journalEntry.create({
        data: {
          organizationId,
          transactionId,
          accountId: m.ifrsAccountId,
          debit: d,
          credit: c,
          ledgerType: LedgerType.IFRS,
        },
      });
    }
  }

  async postTransaction(params: {
    organizationId: string;
    date: Date;
    reference?: string;
    description?: string;
    isFinal?: boolean;
    counterpartyId?: string | null;
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
}
