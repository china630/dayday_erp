import { BadRequestException, Injectable } from "@nestjs/common";
import {
  BankStatementChannel,
  BankStatementLineOrigin,
  BankStatementLineType,
  Decimal,
  LedgerType,
  pickAccountDisplayName,
  type Prisma,
  type UserRole,
} from "@dayday/database";
import { assertMayPostManualJournal } from "../auth/policies/invoice-finance.policy";
import { AccountingService } from "../accounting/accounting.service";
import {
  CASH_OPERATIONAL_ACCOUNT_CODE,
  MISC_OPERATING_EXPENSE_ACCOUNT_CODE,
} from "../ledger.constants";
import { PrismaService } from "../prisma/prisma.service";
import { ReportingService } from "../reporting/reporting.service";
import { parseIsoDateOnly } from "../reporting/reporting-period.util";
import { TreasuryService } from "../treasury/treasury.service";
import { parseBankStatementCsv } from "./csv/bank-csv.parser";

function matchesPrefix(accountCode: string, prefix: string): boolean {
  return accountCode === prefix || accountCode.startsWith(`${prefix}.`);
}

function matchesAnyRoot(
  accountCode: string,
  roots: readonly string[],
): boolean {
  return roots.some((r) => matchesPrefix(accountCode, r));
}

function maskAccountCode(code: string): string {
  const digits = code.replace(/\D/g, "");
  if (digits.length >= 4) {
    return `••••${digits.slice(-4)}`;
  }
  if (code.length >= 4) {
    return `••••${code.slice(-4)}`;
  }
  return "••••";
}

function isBankLedgerAccountCode(code: string): boolean {
  const c = code.trim();
  if (c === "221" || c.startsWith("221.")) return true;
  for (const r of ["222", "223", "224"] as const) {
    if (c === r || c.startsWith(`${r}.`)) return true;
  }
  return false;
}

function segmentForAccountCode(
  code: string,
): "CASH" | "BANK" | null {
  if (matchesPrefix(code, "101")) return "CASH";
  if (
    matchesPrefix(code, "221") ||
    matchesAnyRoot(code, ["222", "223", "224"])
  ) {
    return "BANK";
  }
  return null;
}

@Injectable()
export class BankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reporting: ReportingService,
    private readonly accounting: AccountingService,
    private readonly treasury: TreasuryService,
  ) {}

  async importCsv(
    organizationId: string,
    buffer: Buffer,
    bankName: string,
    sourceFileName?: string,
    channel: BankStatementChannel = BankStatementChannel.BANK,
  ) {
    const text = buffer.toString("utf-8");
    const rows = parseBankStatementCsv(text);
    if (rows.length === 0) {
      throw new BadRequestException("No rows parsed from CSV");
    }

    let totalAbs = new Decimal(0);
    let stmtDate: Date | null = null;
    for (const r of rows) {
      totalAbs = totalAbs.add(r.amount);
      if (r.valueDate) {
        if (!stmtDate || r.valueDate > stmtDate) stmtDate = r.valueDate;
      }
    }

    const date = stmtDate ?? new Date();

    const { out, createdLines } = await this.prisma.$transaction(async (tx) => {
      const stmt = await tx.bankStatement.create({
        data: {
          organizationId,
          date,
          totalAmount: totalAbs,
          bankName,
          channel,
          sourceFileName: sourceFileName ?? null,
        },
      });

      const createdLines: Array<{ id: string }> = [];
      for (const r of rows) {
        const line = await tx.bankStatementLine.create({
          data: {
            organizationId,
            bankStatementId: stmt.id,
            description: r.description,
            amount: r.amount,
            type: r.type,
            origin: BankStatementLineOrigin.FILE_IMPORT,
            counterpartyTaxId: r.counterpartyTaxId,
            valueDate: r.valueDate,
            rawRow: r.raw as Prisma.InputJsonValue,
          },
        });
        createdLines.push({ id: line.id });
      }

      const out = await tx.bankStatement.findUniqueOrThrow({
        where: { id: stmt.id },
        include: { _count: { select: { lines: true } } },
      });
      return { out, createdLines };
    });
    for (const line of createdLines) {
      await this.autoMatchOutgoingForLine(organizationId, line.id);
    }
    return out;
  }

  /**
   * Сетка карточек: по одному счёту кассы (101*) и банка (221–224) — сальдо ОСВ (ТЗ §6).
   */
  async getAccountCards(organizationId: string, ledgerType: LedgerType) {
    const today = new Date().toISOString().slice(0, 10);
    const yearStart = `${new Date().getUTCFullYear()}-01-01`;
    const tb = await this.reporting.trialBalance(
      organizationId,
      yearStart,
      today,
      ledgerType,
    );

    const accounts = await this.prisma.account.findMany({
      where: { organizationId, ledgerType },
      select: {
        code: true,
        nameAz: true,
        nameRu: true,
        nameEn: true,
        currency: true,
      },
    });
    const byCode = new Map(accounts.map((a) => [a.code, a]));

    const accountsOut: Array<{
      segment: "CASH" | "BANK";
      accountCode: string;
      displayName: string;
      maskedNumber: string;
      balances: { currency: string; amount: string }[];
    }> = [];

    for (const row of tb.rows) {
      const seg = segmentForAccountCode(row.accountCode);
      if (!seg) continue;
      const acc = byCode.get(row.accountCode);
      const net = new Decimal(row.closingDebit).sub(
        new Decimal(row.closingCredit),
      );
      const cur = acc?.currency ?? "AZN";
      accountsOut.push({
        segment: seg,
        accountCode: row.accountCode,
        displayName: acc
          ? pickAccountDisplayName(acc, "az")
          : row.accountCode,
        maskedNumber: maskAccountCode(row.accountCode),
        balances: [{ currency: cur, amount: net.toFixed(2) }],
      });
    }

    return {
      dateFrom: tb.dateFrom,
      dateTo: tb.dateTo,
      ledgerType,
      accounts: accountsOut,
    };
  }

  async manualCashOut(
    organizationId: string,
    dto: { amount: number; description?: string; date?: string },
    role: UserRole,
  ) {
    assertMayPostManualJournal(role);
    const amt = new Decimal(dto.amount);
    if (amt.lte(0)) {
      throw new BadRequestException("amount must be positive");
    }
    let date: Date;
    try {
      date = dto.date?.trim()
        ? parseIsoDateOnly(dto.date.trim())
        : new Date();
    } catch {
      throw new BadRequestException("Invalid date (expected YYYY-MM-DD)");
    }
    const desc = dto.description?.trim() || "Nəqd məxaric";

    return this.prisma.$transaction(async (tx) => {
      await this.accounting.postJournalInTransaction(tx, {
        organizationId,
        date,
        reference: "CASH-OUT",
        description: desc,
        isFinal: true,
        lines: [
          {
            accountCode: MISC_OPERATING_EXPENSE_ACCOUNT_CODE,
            debit: amt.toString(),
            credit: 0,
          },
          {
            accountCode: CASH_OPERATIONAL_ACCOUNT_CODE,
            debit: 0,
            credit: amt.toString(),
          },
        ],
      });

      const stmt = await tx.bankStatement.create({
        data: {
          organizationId,
          date,
          totalAmount: amt,
          bankName: "MANUAL_CASH",
          channel: BankStatementChannel.CASH,
        },
      });

      await tx.bankStatementLine.create({
        data: {
          organizationId,
          bankStatementId: stmt.id,
          description: desc,
          amount: amt,
          type: BankStatementLineType.OUTFLOW,
          origin: BankStatementLineOrigin.MANUAL_CASH_OUT,
          valueDate: date,
        },
      });

      return { ok: true as const };
    });
  }

  /**
   * Ручная банковская операция: проводка + строка реестра (для отчётности и сверки).
   */
  async manualBankEntry(
    organizationId: string,
    dto: {
      type: BankStatementLineType;
      amount: number;
      bankAccountCode: string;
      offsetAccountCode: string;
      date: string;
      cashFlowItemId: string;
      description?: string;
    },
  ) {
    const bank = dto.bankAccountCode.trim();
    const offset = dto.offsetAccountCode.trim();
    if (!isBankLedgerAccountCode(bank)) {
      throw new BadRequestException(
        "bankAccountCode must be a bank account (221*, 222*, 223*, 224*)",
      );
    }
    if (!offset) {
      throw new BadRequestException("offsetAccountCode required");
    }
    await this.treasury.assertCashFlowItem(organizationId, dto.cashFlowItemId);

    const amt = new Decimal(dto.amount);
    if (amt.lte(0)) {
      throw new BadRequestException("amount must be positive");
    }
    let date: Date;
    try {
      date = parseIsoDateOnly(dto.date.trim());
    } catch {
      throw new BadRequestException("Invalid date (expected YYYY-MM-DD)");
    }
    const desc = dto.description?.trim() || "Manual bank entry";

    // Capital contribution policy:
    // - Bank contribution goes through manualBankEntry as Dr 221* / Cr 301.
    // - Cash contribution goes through KMO in CashOrderService as Dr 101* / Cr 301.
    if (offset === "301") {
      if (dto.type !== BankStatementLineType.INFLOW) {
        throw new BadRequestException(
          "Capital contribution to equity (301) must be INFLOW for bank entry (Dr 221* / Cr 301)",
        );
      }
      if (!(bank === "221" || bank.startsWith("221."))) {
        throw new BadRequestException(
          "Capital contribution to equity (301) must use settlement bank account 221*",
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const lines =
        dto.type === BankStatementLineType.INFLOW
          ? [
              { accountCode: bank, debit: amt.toString(), credit: "0" },
              { accountCode: offset, debit: "0", credit: amt.toString() },
            ]
          : [
              { accountCode: offset, debit: amt.toString(), credit: "0" },
              { accountCode: bank, debit: "0", credit: amt.toString() },
            ];

      await this.accounting.postJournalInTransaction(tx, {
        organizationId,
        date,
        reference: "BANK-MANUAL",
        description: desc,
        isFinal: true,
        lines,
      });

      const stmt = await tx.bankStatement.create({
        data: {
          organizationId,
          date,
          totalAmount: amt,
          bankName: "MANUAL_BANK",
          channel: BankStatementChannel.BANK,
        },
      });

      await tx.bankStatementLine.create({
        data: {
          organizationId,
          bankStatementId: stmt.id,
          description: desc,
          amount: amt,
          type: dto.type,
          origin: BankStatementLineOrigin.MANUAL_BANK_ENTRY,
          valueDate: date,
          isMatched: true,
          cashFlowItemId: dto.cashFlowItemId,
        },
      });

      return { ok: true as const, bankStatementId: stmt.id };
    });
  }

  listStatements(organizationId: string) {
    return this.prisma.bankStatement.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { lines: true } } },
    });
  }

  listLines(
    organizationId: string,
    filters?: {
      bankStatementId?: string;
      unmatchedOnly?: boolean;
      needsAttention?: boolean;
      /** BANK | CASH — фильтр по каналу выписки */
      channel?: "BANK" | "CASH";
      /**
       * Жёсткий серверный фильтр только по банковским origins:
       * MANUAL_BANK_ENTRY, FILE_IMPORT, DIRECT_SYNC
       */
      bankOnly?: boolean;
    },
  ) {
    const channelFilter =
      filters?.channel === "BANK"
        ? { bankStatement: { channel: BankStatementChannel.BANK } }
        : filters?.channel === "CASH"
          ? { bankStatement: { channel: BankStatementChannel.CASH } }
          : {};

    const originFilter = filters?.bankOnly
      ? {
          origin: {
            in: [
              BankStatementLineOrigin.MANUAL_BANK_ENTRY,
              BankStatementLineOrigin.FILE_IMPORT,
              BankStatementLineOrigin.DIRECT_SYNC,
            ],
          },
        }
      : {};

    return this.prisma.bankStatementLine.findMany({
      where: {
        organizationId,
        ...channelFilter,
        ...originFilter,
        ...(filters?.bankStatementId
          ? { bankStatementId: filters.bankStatementId }
          : {}),
        ...(filters?.needsAttention
          ? { isMatched: false, type: BankStatementLineType.INFLOW }
          : filters?.unmatchedOnly
            ? { isMatched: false }
            : {}),
      },
      orderBy: [{ valueDate: "desc" }, { createdAt: "desc" }],
      include: {
        bankStatement: {
          select: {
            id: true,
            bankName: true,
            date: true,
            channel: true,
          },
        },
        matchedInvoice: {
          select: { id: true, number: true, status: true, totalAmount: true },
        },
      },
    });
  }

  listPaymentDrafts(organizationId: string) {
    return (this.prisma as any).bankPaymentDraft.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: "desc" }],
    });
  }

  private async autoMatchOutgoingForLine(
    organizationId: string,
    lineId: string,
  ): Promise<void> {
    const line = await this.prisma.bankStatementLine.findFirst({
      where: { id: lineId, organizationId },
      select: { id: true, isMatched: true, type: true, amount: true },
    });
    if (!line || line.isMatched || line.type !== BankStatementLineType.OUTFLOW) {
      return;
    }
    const amount = new Decimal(line.amount);

    const sentDrafts = await (this.prisma as any).bankPaymentDraft.findMany({
      where: { organizationId, status: "SENT" },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    const draftMatch = sentDrafts.filter((d: { amount: unknown }) =>
      new Decimal(d.amount).equals(amount),
    );
    if (draftMatch.length === 1) {
      await this.prisma.$transaction(async (tx) => {
        await (tx as any).bankPaymentDraft.update({
          where: { id: draftMatch[0].id },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        await tx.bankStatementLine.update({
          where: { id: line.id },
          data: { isMatched: true },
        });
      });
      return;
    }

    const sentRegistries = await (this.prisma as any).salaryRegistry.findMany({
      where: { organizationId, status: "SENT" },
      include: { payrollRun: { include: { slips: { select: { net: true } } } } },
      take: 100,
    });
    const salaryMatch = sentRegistries.filter((r: { payrollRun?: { slips?: Array<{ net: unknown }> } }) => {
      const total = (r.payrollRun?.slips ?? []).reduce(
        (sum, s) => sum.add(new Decimal(s.net)),
        new Decimal(0),
      );
      return total.equals(amount);
    });
    if (salaryMatch.length === 1) {
      await this.prisma.$transaction(async (tx) => {
        await (tx as any).salaryRegistry.update({
          where: { id: salaryMatch[0].id },
          data: { status: "PAID" },
        });
        await tx.bankStatementLine.update({
          where: { id: line.id },
          data: { isMatched: true },
        });
      });
    }
  }
}
