import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import {
  AccountType,
  CounterpartyRole,
  Decimal,
  DigitalSignatureStatus,
  InvoiceStatus,
  LedgerType,
  pickAccountDisplayName,
  Prisma,
  SignedDocumentKind,
} from "@dayday/database";
import { DepreciationService } from "../fixed-assets/depreciation.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  COGS_ACCOUNT_CODE,
  FX_GAIN_ACCOUNT_CODE,
  PAYROLL_EXPENSE_ACCOUNT_CODE,
  PAYABLE_SUPPLIERS_ACCOUNT_CODE,
  PAYROLL_TAX_PAYABLE_ACCOUNT_CODE,
  RECEIVABLE_ACCOUNT_CODE,
  REVENUE_ACCOUNT_CODE,
} from "../ledger.constants";
import {
  endOfUtcDay,
  getClosedPeriodKeys,
  mergeClosedPeriod,
  monthRangeUtc,
  parseIsoDateOnly,
} from "./reporting-period.util";
import { verifyQrPublicBase } from "../common/verify-public-url";
import { reconciliationDocumentUuid } from "../signature/reconciliation-document-id";
import {
  buildCounterpartyReconciliationPayload,
  counterpartyReconciliationXlsxBuffer,
  type CounterpartyReconciliationOptions,
} from "./counterparty-reconciliation-build";
import { renderReconciliationPdfAz } from "./reconciliation-pdf.render";

/**
 * Cash/Bank balances for dashboards:
 * - Cash: 101* (cash desks)
 * - Bank: 221–224 (bank accounts / cards)
 */
const CASH_PREFIX = "101";
const BANK_CODES = ["221", "222", "223", "224"] as const;
const BANK_PREFIXES = [...BANK_CODES] as ReadonlyArray<string>;

function d(v: Decimal | null | undefined): Decimal {
  return v ?? new Decimal(0);
}

/** Чистая «дебетовая» позиция: Дт − Кт */
function netDrMinusCr(sumDr: Decimal, sumCr: Decimal): Decimal {
  return sumDr.sub(sumCr);
}

/** Для отображения: положительный нетто → колонка Дт, иначе Кт */
function splitDrCr(net: Decimal): { debit: Decimal; credit: Decimal } {
  if (net.gte(0)) {
    return { debit: net, credit: new Decimal(0) };
  }
  return { debit: new Decimal(0), credit: net.neg() };
}

function parseClosedPeriodEnd(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  const lastDay = new Date(Date.UTC(y, month, 0)).getUTCDate();
  return new Date(Date.UTC(y, month - 1, lastDay, 0, 0, 0, 0));
}

function absDelta(a: Decimal, b: Decimal): Decimal {
  const x = a.sub(b);
  return x.gte(0) ? x : x.neg();
}

@Injectable()
export class ReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly depreciation: DepreciationService,
    private readonly config: ConfigService,
  ) {}

  async trialBalance(
    organizationId: string,
    dateFromStr: string,
    dateToStr: string,
    ledgerType: LedgerType = LedgerType.NAS,
  ) {
    const startedAt = Date.now();
    if (!dateFromStr?.trim() || !dateToStr?.trim()) {
      throw new BadRequestException("dateFrom and dateTo are required");
    }
    let dateFrom: Date;
    let dateTo: Date;
    try {
      dateFrom = parseIsoDateOnly(dateFromStr);
      dateTo = parseIsoDateOnly(dateToStr);
    } catch {
      throw new BadRequestException(
        "Invalid dateFrom/dateTo (expected YYYY-MM-DD)",
      );
    }
    if (dateFrom.getTime() > dateTo.getTime()) {
      throw new BadRequestException("dateFrom must be <= dateTo");
    }

    const accounts = await this.prisma.account.findMany({
      where: { organizationId, ledgerType },
      orderBy: { code: "asc" },
    });
    if (accounts.length === 0) {
      return {
        dateFrom: dateFromStr,
        dateTo: dateToStr,
        ledgerType,
        rows: [],
      };
    }

    const accountIds = accounts.map((a) => a.id);

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const closedKeys = getClosedPeriodKeys(org?.settings);
    const closedEnds = closedKeys
      .map(parseClosedPeriodEnd)
      .filter((d): d is Date => d != null)
      .filter((d) => d.getTime() < dateFrom.getTime())
      .sort((a, b) => b.getTime() - a.getTime());
    const snapshotDate = closedEnds[0] ?? null;

    const periodAgg = await this.prisma.journalEntry.groupBy({
      by: ["accountId"],
      where: {
        organizationId,
        ledgerType,
        accountId: { in: accountIds },
        transaction: {
          date: { gte: dateFrom, lte: dateTo },
          isFinal: true,
        },
      },
      _sum: { debit: true, credit: true },
    });

    let openingMap = new Map<string, { dr: Decimal; cr: Decimal }>();
    if (snapshotDate) {
      const snaps = await this.prisma.accountBalance.findMany({
        where: {
          organizationId,
          ledgerType,
          balanceDate: snapshotDate,
          accountId: { in: accountIds },
        },
        select: {
          accountId: true,
          debitBalance: true,
          creditBalance: true,
        },
      });
      openingMap = new Map(
        snaps.map((s) => [
          s.accountId,
          { dr: d(s.debitBalance), cr: d(s.creditBalance) },
        ]),
      );
      const missing = accountIds.filter((id) => !openingMap.has(id));
      if (missing.length > 0) {
        const fallbackAgg = await this.prisma.journalEntry.groupBy({
          by: ["accountId"],
          where: {
            organizationId,
            ledgerType,
            accountId: { in: missing },
            transaction: { date: { lt: dateFrom }, isFinal: true },
          },
          _sum: { debit: true, credit: true },
        });
        for (const r of fallbackAgg) {
          openingMap.set(r.accountId, {
            dr: d(r._sum.debit),
            cr: d(r._sum.credit),
          });
        }
      }
    } else {
      const openingAgg = await this.prisma.journalEntry.groupBy({
        by: ["accountId"],
        where: {
          organizationId,
          ledgerType,
          accountId: { in: accountIds },
          transaction: { date: { lt: dateFrom }, isFinal: true },
        },
        _sum: { debit: true, credit: true },
      });
      openingMap = new Map(
        openingAgg.map((r) => [
          r.accountId,
          {
            dr: d(r._sum.debit),
            cr: d(r._sum.credit),
          },
        ]),
      );
    }
    const periodMap = new Map(
      periodAgg.map((r) => [
        r.accountId,
        {
          dr: d(r._sum.debit),
          cr: d(r._sum.credit),
        },
      ]),
    );

    const rows = accounts.map((acc) => {
      const o = openingMap.get(acc.id) ?? { dr: new Decimal(0), cr: new Decimal(0) };
      const p = periodMap.get(acc.id) ?? { dr: new Decimal(0), cr: new Decimal(0) };
      const openingNet = netDrMinusCr(o.dr, o.cr);
      const periodDr = p.dr;
      const periodCr = p.cr;
      const closingNet = openingNet.add(periodDr).sub(periodCr);

      const ob = splitDrCr(openingNet);
      const cb = splitDrCr(closingNet);

      return {
        accountId: acc.id,
        accountCode: acc.code,
        accountName: pickAccountDisplayName(acc, "ru"),
        accountType: acc.type,
        openingDebit: ob.debit.toFixed(4),
        openingCredit: ob.credit.toFixed(4),
        periodDebit: periodDr.toFixed(4),
        periodCredit: periodCr.toFixed(4),
        closingDebit: cb.debit.toFixed(4),
        closingCredit: cb.credit.toFixed(4),
      };
    });

    const totalPeriodDebit = rows.reduce(
      (sum, r) => sum.add(new Decimal(r.periodDebit)),
      new Decimal(0),
    );
    const totalPeriodCredit = rows.reduce(
      (sum, r) => sum.add(new Decimal(r.periodCredit)),
      new Decimal(0),
    );
    const isBalanced = absDelta(totalPeriodDebit, totalPeriodCredit).lte(
      new Decimal("0.0001"),
    );

    const revenueRow = rows.find((r) => r.accountCode === REVENUE_ACCOUNT_CODE);
    const cogsRow = rows.find((r) => r.accountCode === COGS_ACCOUNT_CODE);
    const payrollRow = rows.find((r) => r.accountCode === PAYROLL_EXPENSE_ACCOUNT_CODE);
    const fxRow = rows.find((r) => r.accountCode === FX_GAIN_ACCOUNT_CODE);
    const trialBalanceProfitProxy = (revenueRow
      ? new Decimal(revenueRow.periodCredit).sub(new Decimal(revenueRow.periodDebit))
      : new Decimal(0))
      .sub(
        cogsRow
          ? new Decimal(cogsRow.periodDebit).sub(new Decimal(cogsRow.periodCredit))
          : new Decimal(0),
      )
      .sub(
        payrollRow
          ? new Decimal(payrollRow.periodDebit).sub(new Decimal(payrollRow.periodCredit))
          : new Decimal(0),
      )
      .sub(
        fxRow
          ? new Decimal(fxRow.periodDebit).sub(new Decimal(fxRow.periodCredit))
          : new Decimal(0),
      );

    return {
      dateFrom: dateFromStr,
      dateTo: dateToStr,
      ledgerType,
      openingSnapshotDate: snapshotDate?.toISOString().slice(0, 10) ?? null,
      rows,
      totals: {
        periodDebit: totalPeriodDebit.toFixed(4),
        periodCredit: totalPeriodCredit.toFixed(4),
        balanced: isBalanced,
      },
      crossValidation: {
        netProfitProxy: trialBalanceProfitProxy.toFixed(4),
      },
      performance: {
        accountRows: rows.length,
        elapsedMs: Date.now() - startedAt,
      },
    };
  }

  /**
   * P&L по проводкам (начисление): 601 − 701 − 721 − 662 (см. ТЗ).
   * 662 — прочие доходы (курсовая прибыль): при преобладании кредита уменьшает «расходную» часть формулы.
   */
  async profitAndLoss(
    organizationId: string,
    dateFromStr: string,
    dateToStr: string,
    ledgerType: LedgerType = LedgerType.NAS,
    departmentId?: string | null,
  ) {
    const startedAt = Date.now();
    if (!dateFromStr?.trim() || !dateToStr?.trim()) {
      throw new BadRequestException("dateFrom and dateTo are required");
    }
    let dateFrom: Date;
    let dateTo: Date;
    try {
      dateFrom = parseIsoDateOnly(dateFromStr);
      dateTo = parseIsoDateOnly(dateToStr);
    } catch {
      throw new BadRequestException(
        "Invalid dateFrom/dateTo (expected YYYY-MM-DD)",
      );
    }
    if (dateFrom.getTime() > dateTo.getTime()) {
      throw new BadRequestException("dateFrom must be <= dateTo");
    }

    const codes = [
      REVENUE_ACCOUNT_CODE,
      COGS_ACCOUNT_CODE,
      PAYROLL_EXPENSE_ACCOUNT_CODE,
      FX_GAIN_ACCOUNT_CODE,
    ] as const;
    const accs = await this.prisma.account.findMany({
      where: { organizationId, ledgerType, code: { in: [...codes] } },
    });
    const byCode = new Map(accs.map((a) => [a.code, a]));
    const ids = accs.map((a) => a.id);

    if (ids.length === 0) {
      return {
        dateFrom: dateFromStr,
        dateTo: dateToStr,
        ledgerType,
        departmentId: departmentId?.trim() ?? null,
        payrollExpenseSource: "ledger" as const,
        lines: [],
        netProfit: "0.0000",
        methodologyNote:
          "Начисление по счетам ГК; не совпадает с кассовым «оплаты − COGS − налоги ЗП» без доп. сверки.",
      };
    }

    const deptFilter = departmentId?.trim();
    if (deptFilter) {
      const dept = await this.prisma.department.findFirst({
        where: { id: deptFilter, organizationId },
      });
      if (!dept) {
        throw new BadRequestException("Неизвестный департамент");
      }
    }

    const transactionWhere: Prisma.TransactionWhereInput = {
      date: { gte: dateFrom, lte: dateTo },
      ...(deptFilter ? { departmentId: deptFilter } : {}),
    };

    const agg = await this.prisma.journalEntry.groupBy({
      by: ["accountId"],
      where: {
        organizationId,
        ledgerType,
        accountId: { in: ids },
        transaction: { ...transactionWhere, isFinal: true },
      },
      _sum: { debit: true, credit: true },
    });
    const sumMap = new Map(
      agg.map((r) => [
        r.accountId,
        { dr: d(r._sum.debit), cr: d(r._sum.credit) },
      ]),
    );

    const pick = (code: string) => {
      const a = byCode.get(code);
      if (!a) {
        return { dr: new Decimal(0), cr: new Decimal(0) };
      }
      return sumMap.get(a.id) ?? { dr: new Decimal(0), cr: new Decimal(0) };
    };

    const r601 = pick(REVENUE_ACCOUNT_CODE);
    const revenueNet = r601.cr.sub(r601.dr);

    const r701 = pick(COGS_ACCOUNT_CODE);
    const cogsNet = r701.dr.sub(r701.cr);

    const r721 = pick(PAYROLL_EXPENSE_ACCOUNT_CODE);
    const payrollExpenseNet = r721.dr.sub(r721.cr);

    const r662 = pick(FX_GAIN_ACCOUNT_CODE);
    const fx662Net = r662.dr.sub(r662.cr);

    const netProfit = revenueNet
      .sub(cogsNet)
      .sub(payrollExpenseNet)
      .sub(fx662Net);

    const trialBalanceView =
      deptFilter == null
        ? await this.trialBalance(
            organizationId,
            dateFromStr,
            dateToStr,
            ledgerType,
          )
        : null;
    const tbProxy =
      trialBalanceView != null
        ? new Decimal(trialBalanceView.crossValidation?.netProfitProxy ?? "0")
        : netProfit;
    const crossValidationDelta = absDelta(netProfit, tbProxy);
    const crossValidationOk =
      trialBalanceView == null
        ? true
        : crossValidationDelta.lte(new Decimal("0.0100"));

    const payrollLabel =
      deptFilter != null
        ? `Расходы на ЗП по департаменту (${PAYROLL_EXPENSE_ACCOUNT_CODE})`
        : `Расходы на ЗП (${PAYROLL_EXPENSE_ACCOUNT_CODE})`;

    return {
      dateFrom: dateFromStr,
      dateTo: dateToStr,
      ledgerType,
      departmentId: deptFilter ?? null,
      payrollExpenseSource: "ledger",
      lines: [
        {
          accountCode: REVENUE_ACCOUNT_CODE,
          label: `Выручка (${REVENUE_ACCOUNT_CODE})`,
          amount: revenueNet.toFixed(4),
        },
        {
          accountCode: COGS_ACCOUNT_CODE,
          label: `Себестоимость (${COGS_ACCOUNT_CODE})`,
          amount: cogsNet.neg().toFixed(4),
        },
        {
          accountCode: PAYROLL_EXPENSE_ACCOUNT_CODE,
          label: payrollLabel,
          amount: payrollExpenseNet.neg().toFixed(4),
        },
        {
          accountCode: FX_GAIN_ACCOUNT_CODE,
          label: `Прочие доходы/расходы (${FX_GAIN_ACCOUNT_CODE}, по Дт−Кт)`,
          amount: fx662Net.neg().toFixed(4),
        },
      ],
      detail: {
        revenueCreditMinusDebit: revenueNet.toFixed(4),
        cogsDebitMinusCredit: cogsNet.toFixed(4),
        payrollDebitMinusCredit: payrollExpenseNet.toFixed(4),
        fx662DebitMinusCredit: fx662Net.toFixed(4),
      },
      netProfit: netProfit.toFixed(4),
      crossValidation: {
        trialBalanceNetProfitProxy: tbProxy.toFixed(4),
        delta: crossValidationDelta.toFixed(4),
        ok: crossValidationOk,
        scope: trialBalanceView == null ? "department-filtered" : "full-ledger",
      },
      performance: {
        elapsedMs: Date.now() - startedAt,
        rowsProcessed: agg.length,
      },
      methodologyNote:
        "Чистая прибыль по начислению (обороты по счетам за период). Кассовая сверка «сумма оплат − себестоимость − налоги с ЗП» даст другой результат, если оплаты и начисления не совпадают по периодам." +
        (deptFilter
          ? " При фильтре ЦФО обороты по выручке, себестоимости, ФОТ и 662 учитываются только по транзакциям с привязкой к этому департаменту."
          : ""),
    };
  }

  /**
   * Дебиторская задолженность по контрагентам: неоплаченная часть счетов,
   * по которым уже отражена выручка (Дт 211 — Кт 601), оплата ещё не проведена.
   */
  async accountsReceivable(
    organizationId: string,
    ledgerType: LedgerType = LedgerType.NAS,
  ) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        revenueRecognized: true,
        status: { not: InvoiceStatus.CANCELLED },
      },
    });

    const arAcc = await this.prisma.account.findFirst({
      where: {
        organizationId,
        ledgerType,
        code: RECEIVABLE_ACCOUNT_CODE,
      },
    });
    const displayAccountCode = arAcc?.code ?? RECEIVABLE_ACCOUNT_CODE;

    const byCp = new Map<string, Decimal>();
    for (const inv of invoices) {
      const bal = inv.totalAmount.sub(inv.paidAmount ?? new Decimal(0));
      if (bal.lte(0)) continue;
      const prev = byCp.get(inv.counterpartyId) ?? new Decimal(0);
      byCp.set(inv.counterpartyId, prev.add(bal));
    }

    if (byCp.size === 0) {
      return {
        ledgerType,
        accountCode: displayAccountCode,
        rows: [] as {
          counterpartyId: string;
          name: string;
          taxId: string;
          balance: string;
        }[],
        totalBalance: "0.0000",
      };
    }

    const ids = [...byCp.keys()];
    const counterparties = await this.prisma.counterparty.findMany({
      where: { organizationId, id: { in: ids } },
    });
    const byId = new Map(counterparties.map((c) => [c.id, c]));

    let total = new Decimal(0);
    const rows = [...byCp.entries()]
      .map(([counterpartyId, bal]) => {
        const cp = byId.get(counterpartyId);
        total = total.add(bal);
        return {
          counterpartyId,
          name: cp?.name ?? "—",
          taxId: cp?.taxId ?? "—",
          balance: bal.toFixed(4),
        };
      })
      .sort((a, b) => Number(b.balance) - Number(a.balance));

    return {
      ledgerType,
      accountCode: displayAccountCode,
      rows,
      totalBalance: total.toFixed(4),
    };
  }

  /**
   * Акт сверки взаиморасчётов с контрагентом (дебиторка по выставленным счетам и оплатам).
   * Поле `transactions` — хронология с разворотом по строкам `JournalEntry` (NAS), где удалось сопоставить проводки.
   * Обороты 531 по контрагенту в модели не разнесены — только счета-фактуры и платежи.
   */
  async counterpartyReconciliation(
    organizationId: string,
    counterpartyId: string,
    dateFromStr: string,
    dateToStr: string,
    options?: CounterpartyReconciliationOptions,
  ) {
    if (!dateFromStr?.trim() || !dateToStr?.trim()) {
      throw new BadRequestException(
        "dateFrom/dateTo or startDate/endDate are required (YYYY-MM-DD)",
      );
    }
    let dateFrom: Date;
    let dateTo: Date;
    try {
      dateFrom = parseIsoDateOnly(dateFromStr);
      dateTo = parseIsoDateOnly(dateToStr);
    } catch {
      throw new BadRequestException("Invalid dates (expected YYYY-MM-DD)");
    }
    if (dateFrom.getTime() > dateTo.getTime()) {
      throw new BadRequestException("dateFrom must be <= dateTo");
    }

    const cp = await this.prisma.counterparty.findFirst({
      where: { id: counterpartyId, organizationId },
    });
    if (!cp) {
      throw new BadRequestException("Counterparty not found");
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, taxId: true },
    });

    const built = await buildCounterpartyReconciliationPayload(
      this.prisma,
      organizationId,
      counterpartyId,
      dateFrom,
      dateTo,
      dateFromStr,
      dateToStr,
      options,
    );

    const opening = built.opening;
    const closing = built.closing;
    const primaryCurrency = built.primaryCurrency;

    return {
      organizationName: org?.name ?? "",
      organizationTaxId: org?.taxId ?? "",
      counterpartyId: cp.id,
      counterpartyName: cp.name,
      counterpartyTaxId: cp.taxId,
      dateFrom: dateFromStr,
      dateTo: dateToStr,
      startDate: dateFromStr,
      endDate: dateToStr,
      currency: options?.currency?.trim().toUpperCase() ?? null,
      ledgerType: options?.ledgerType ?? LedgerType.NAS,
      openingBalance: opening.toFixed(4),
      closingBalance: closing.toFixed(4),
      openingBalanceDetail: {
        signedAmount: opening.toFixed(4),
        amount: opening.abs().toFixed(4),
        currency: primaryCurrency,
        side: opening.gte(0) ? ("DR" as const) : ("CR" as const),
      },
      closingBalanceDetail: {
        signedAmount: closing.toFixed(4),
        amount: closing.abs().toFixed(4),
        currency: primaryCurrency,
        side: closing.gte(0) ? ("DR" as const) : ("CR" as const),
      },
      turnoverDebit: built.turnoverDebit.toFixed(4),
      turnoverCredit: built.turnoverCredit.toFixed(4),
      lines: built.lines,
      transactions: built.transactions,
      methodologyNote:
        "Сальдо: непогашенная дебиторская задолженность по счетам с признанной выручкой. Кредиторка (531) по поставщику в учёте не привязана к контрагенту — в акт не включена.",
      methodologyNoteAz:
        "Qeyd: Qalıq debitor borcunu əks etdirir (211, hesablanmış gəlir). Təchizatçı üzrə 531 kreditor borcu bu modeldə kontagentə birbaşa bağlı deyil və akta daxil edilmir.",
    };
  }

  async counterpartyReconciliationXlsx(
    organizationId: string,
    counterpartyId: string,
    dateFromStr: string,
    dateToStr: string,
    options?: CounterpartyReconciliationOptions,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const data = await this.counterpartyReconciliation(
      organizationId,
      counterpartyId,
      dateFromStr,
      dateToStr,
      options,
    );
    const currencyLabel = data.currency ?? data.openingBalanceDetail.currency ?? "AZN";
    return counterpartyReconciliationXlsxBuffer({
      organizationName: data.organizationName,
      organizationTaxId: data.organizationTaxId,
      counterpartyName: data.counterpartyName,
      counterpartyTaxId: data.counterpartyTaxId,
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      openingBalance: data.openingBalance,
      closingBalance: data.closingBalance,
      currencyLabel,
      transactions: data.transactions,
    });
  }

  async counterpartyReconciliationPdf(
    organizationId: string,
    counterpartyId: string,
    dateFromStr: string,
    dateToStr: string,
    options?: CounterpartyReconciliationOptions,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const data = await this.counterpartyReconciliation(
      organizationId,
      counterpartyId,
      dateFromStr,
      dateToStr,
      options,
    );

    const reconDocId = reconciliationDocumentUuid(
      organizationId,
      counterpartyId,
      data.dateFrom,
      data.dateTo,
    );
    const sigLog = await this.prisma.digitalSignatureLog.findFirst({
      where: {
        organizationId,
        documentId: reconDocId,
        documentKind: SignedDocumentKind.RECONCILIATION_ACT,
        status: DigitalSignatureStatus.COMPLETED,
      },
      orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }],
    });
    const verifyBase = verifyQrPublicBase(this.config);
    const signatureVerifyUrl = sigLog
      ? `${verifyBase}/verify/${sigLog.id}`
      : undefined;

    const buffer = await renderReconciliationPdfAz({
      organizationName: data.organizationName,
      organizationTaxId: data.organizationTaxId,
      counterpartyName: data.counterpartyName,
      counterpartyTaxId: data.counterpartyTaxId,
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      openingBalance: data.openingBalance,
      turnoverDebit: data.turnoverDebit,
      turnoverCredit: data.turnoverCredit,
      closingBalance: data.closingBalance,
      methodologyNoteAz: data.methodologyNoteAz,
      signatureVerifyUrl,
      lines: data.lines.map((l) => ({
        kind: l.kind,
        date: l.date,
        reference: l.reference,
        description: l.description,
        debit: l.debit,
        credit: l.credit,
        balanceAfter: l.balanceAfter,
      })),
    });

    if (sigLog) {
      const hashHex = createHash("sha256").update(buffer).digest("hex");
      await this.prisma.digitalSignatureLog.update({
        where: { id: sigLog.id },
        data: { contentHashSha256: hashHex },
      });
    }
    const safeCp = counterpartyId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 12);
    const filename = `akt-heshlasma-${safeCp || "cp"}-${data.dateFrom}-${data.dateTo}.pdf`;
    return { buffer, filename };
  }

  /** AR Aging: 0-30 / 31-60 / 61-90 / 90+ дней. */
  async accountsReceivableAging(organizationId: string, asOfIso?: string) {
    const today = asOfIso?.trim() ? parseIsoDateOnly(asOfIso) : new Date();
    const todayUtc = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
    );

    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        revenueRecognized: true,
        status: { not: InvoiceStatus.CANCELLED },
        counterparty: {
          role: { in: [CounterpartyRole.CUSTOMER, CounterpartyRole.BOTH] },
        },
      },
      include: {
        counterparty: { select: { id: true, name: true, taxId: true } },
      },
    });

    type Bucket = {
      b0_30: Decimal;
      b31_60: Decimal;
      b61_90: Decimal;
      b90_plus: Decimal;
    };
    const byCp = new Map<
      string,
      { name: string; taxId: string; buckets: Bucket }
    >();

    for (const inv of invoices) {
      const outstanding = inv.totalAmount.sub(inv.paidAmount ?? new Decimal(0));
      if (outstanding.lte(0)) continue;

      const due = inv.dueDate;
      const dueUtc = Date.UTC(
        due.getUTCFullYear(),
        due.getUTCMonth(),
        due.getUTCDate(),
      );
      const daysPastDue = Math.max(0, Math.floor((todayUtc - dueUtc) / 86400000));

      let bucket: keyof Bucket;
      if (daysPastDue <= 30) bucket = "b0_30";
      else if (daysPastDue <= 60) bucket = "b31_60";
      else if (daysPastDue <= 90) bucket = "b61_90";
      else bucket = "b90_plus";

      const id = inv.counterpartyId;
      const cur =
        byCp.get(id) ??
        {
          name: inv.counterparty.name,
          taxId: inv.counterparty.taxId,
          buckets: {
            b0_30: new Decimal(0),
            b31_60: new Decimal(0),
            b61_90: new Decimal(0),
            b90_plus: new Decimal(0),
          },
        };
      cur.buckets[bucket] = cur.buckets[bucket].add(outstanding);
      byCp.set(id, cur);
    }

    const rows = [...byCp.entries()].map(([counterpartyId, v]) => ({
      counterpartyId,
      name: v.name,
      taxId: v.taxId,
      bucket0to30: v.buckets.b0_30.toFixed(4),
      bucket31to60: v.buckets.b31_60.toFixed(4),
      bucket61to90: v.buckets.b61_90.toFixed(4),
      bucket90plus: v.buckets.b90_plus.toFixed(4),
      total: v.buckets.b0_30
        .add(v.buckets.b31_60)
        .add(v.buckets.b61_90)
        .add(v.buckets.b90_plus)
        .toFixed(4),
    }));

    rows.sort((a, b) => Number(b.total) - Number(a.total));

    const sum = rows.reduce(
      (acc, r) => ({
        bucket0to30: acc.bucket0to30.add(new Decimal(r.bucket0to30)),
        bucket31to60: acc.bucket31to60.add(new Decimal(r.bucket31to60)),
        bucket61to90: acc.bucket61to90.add(new Decimal(r.bucket61to90)),
        bucket90plus: acc.bucket90plus.add(new Decimal(r.bucket90plus)),
        total: acc.total.add(new Decimal(r.total)),
      }),
      {
        bucket0to30: new Decimal(0),
        bucket31to60: new Decimal(0),
        bucket61to90: new Decimal(0),
        bucket90plus: new Decimal(0),
        total: new Decimal(0),
      },
    );

    return {
      asOf: new Date(todayUtc).toISOString().slice(0, 10),
      rows,
      totals: {
        bucket0to30: sum.bucket0to30.toFixed(4),
        bucket31to60: sum.bucket31to60.toFixed(4),
        bucket61to90: sum.bucket61to90.toFixed(4),
        bucket90plus: sum.bucket90plus.toFixed(4),
        total: sum.total.toFixed(4),
      },
      methodologyNote:
        "Корзины просрочки по dueDate на дату asOf: 0-30, 31-60, 61-90 и 90+ дней.",
    };
  }

  async dashboard(
    organizationId: string,
    ledgerType: LedgerType = LedgerType.NAS,
  ) {
    const today = new Date();
    const from30 = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() - 29,
        0,
        0,
        0,
        0,
      ),
    );
    const toDay = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );

    const cashAccs = await this.prisma.account.findMany({
      where: {
        organizationId,
        ledgerType,
        OR: [
          { code: { startsWith: CASH_PREFIX } },
          ...BANK_PREFIXES.map((p) => ({ code: { startsWith: p } })),
        ],
      },
    });
    const taxAcc = await this.prisma.account.findFirst({
      where: {
        organizationId,
        ledgerType,
        code: PAYROLL_TAX_PAYABLE_ACCOUNT_CODE,
      },
    });
    const pay531Acc = await this.prisma.account.findFirst({
      where: {
        organizationId,
        ledgerType,
        code: PAYABLE_SUPPLIERS_ACCOUNT_CODE,
      },
    });
    const revAcc = await this.prisma.account.findFirst({
      where: {
        organizationId,
        ledgerType,
        code: REVENUE_ACCOUNT_CODE,
      },
    });

    const cashIds = cashAccs.map((a) => a.id);

    const [cashAgg, taxAgg, pay531Agg] = await Promise.all([
      cashIds.length
        ? this.prisma.journalEntry.aggregate({
            where: {
              organizationId,
              ledgerType,
              accountId: { in: cashIds },
              transaction: { isFinal: true },
            },
            _sum: { debit: true, credit: true },
          })
        : Promise.resolve({ _sum: { debit: null, credit: null } }),
      taxAcc
        ? this.prisma.journalEntry.aggregate({
            where: {
              organizationId,
              ledgerType,
              accountId: taxAcc.id,
              transaction: { isFinal: true },
            },
            _sum: { debit: true, credit: true },
          })
        : Promise.resolve({ _sum: { debit: null, credit: null } }),
      pay531Acc
        ? this.prisma.journalEntry.aggregate({
            where: {
              organizationId,
              ledgerType,
              accountId: pay531Acc.id,
              transaction: { isFinal: true },
            },
            _sum: { debit: true, credit: true },
          })
        : Promise.resolve({ _sum: { debit: null, credit: null } }),
    ]);

    const cashNet = netDrMinusCr(
      d(cashAgg._sum.debit),
      d(cashAgg._sum.credit),
    );
    const taxNet = netDrMinusCr(d(taxAgg._sum.debit), d(taxAgg._sum.credit));
    const taxPayableBalance = taxNet.neg();
    const pay531Net = netDrMinusCr(
      d(pay531Agg._sum.debit),
      d(pay531Agg._sum.credit),
    );
    const pay531Liability = pay531Net.neg();
    const obligations521531Balance = taxPayableBalance.add(pay531Liability);

    const exp721Acc = await this.prisma.account.findFirst({
      where: {
        organizationId,
        ledgerType,
        code: PAYROLL_EXPENSE_ACCOUNT_CODE,
      },
    });
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth() + 1;
    const { start: monthStart, end: monthEnd } = monthRangeUtc(y, m);
    let currentMonthExpense721 = "0.0000";
    if (exp721Acc) {
      const j721 = await this.prisma.journalEntry.findMany({
        where: {
          organizationId,
          ledgerType,
          accountId: exp721Acc.id,
          transaction: { date: { gte: monthStart, lte: monthEnd }, isFinal: true },
        },
        select: { debit: true, credit: true },
      });
      let expNet = new Decimal(0);
      for (const row of j721) {
        expNet = expNet.add(d(row.debit).sub(d(row.credit)));
      }
      currentMonthExpense721 = expNet.toFixed(4);
    }

    const topProducts = await this.prisma.invoiceItem.groupBy({
      by: ["productId"],
      where: {
        organizationId,
        productId: { not: null },
        invoice: {
          status: {
            in: [
              InvoiceStatus.PAID,
              InvoiceStatus.PARTIALLY_PAID,
              InvoiceStatus.LOCKED_BY_SIGNATURE,
            ],
          },
        },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    });

    const prodIds = topProducts
      .map((t) => t.productId)
      .filter((x): x is string => x != null);
    const products = await this.prisma.product.findMany({
      where: { id: { in: prodIds }, organizationId },
    });
    const pById = new Map(products.map((p) => [p.id, p]));

    const topProductsOut = topProducts.map((t) => {
      const p = t.productId ? pById.get(t.productId) : undefined;
      return {
        productId: t.productId,
        name: p?.name ?? "—",
        sku: p?.sku ?? "—",
        quantity: d(t._sum.quantity).toFixed(4),
      };
    });

    let revenueByDay: { date: string; amount: string }[] = [];
    if (revAcc) {
      const revRows = await this.prisma.journalEntry.findMany({
        where: {
          organizationId,
          ledgerType,
          accountId: revAcc.id,
          transaction: {
            date: { gte: from30, lte: toDay },
            isFinal: true,
          },
        },
        select: {
          debit: true,
          credit: true,
          transaction: { select: { date: true } },
        },
      });
      const byDay = new Map<string, Decimal>();
      for (const row of revRows) {
        const day = row.transaction.date.toISOString().slice(0, 10);
        const prev = byDay.get(day) ?? new Decimal(0);
        byDay.set(
          day,
          prev.add(d(row.credit).sub(d(row.debit))),
        );
      }
      revenueByDay = [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, net]) => ({ date, amount: net.toFixed(4) }));
    }

    const arData = await this.accountsReceivable(organizationId, ledgerType);
    const topDebtors = arData.rows.slice(0, 5).map((r) => ({
      counterpartyId: r.counterpartyId,
      name: r.name,
      balance: r.balance,
    }));

    const creditorBalances = new Map<string, Decimal>();
    if (pay531Acc) {
      const entries = await this.prisma.journalEntry.findMany({
        where: {
          organizationId,
          ledgerType,
          accountId: pay531Acc.id,
          transaction: { counterpartyId: { not: null }, isFinal: true },
        },
        include: {
          transaction: { select: { counterpartyId: true } },
        },
      });
      for (const e of entries) {
        const cid = e.transaction.counterpartyId;
        if (!cid) continue;
        const net = d(e.credit).sub(d(e.debit));
        creditorBalances.set(
          cid,
          (creditorBalances.get(cid) ?? new Decimal(0)).add(net),
        );
      }
    }
    const creditorSorted = [...creditorBalances.entries()]
      .filter(([, bal]) => bal.gt(0))
      .sort((a, b) => b[1].sub(a[1]).toNumber())
      .slice(0, 5);
    const creditorIds = creditorSorted.map(([id]) => id);
    const creditorCps =
      creditorIds.length > 0
        ? await this.prisma.counterparty.findMany({
            where: { organizationId, id: { in: creditorIds } },
          })
        : [];
    const byCredId = new Map(creditorCps.map((c) => [c.id, c]));
    const topCreditors = creditorSorted.map(([id, bal]) => {
      const c = byCredId.get(id);
      return {
        counterpartyId: id,
        name: c?.name ?? "—",
        balance: bal.toFixed(4),
      };
    });

    return {
      ledgerType,
      cashBankBalance: cashNet.toFixed(4),
      obligations521531Balance: obligations521531Balance.toFixed(4),
      currentMonthExpense721,
      topProducts: topProductsOut,
      revenueByDay,
      topDebtors,
      topCreditors,
    };
  }

  /** Текущий календарный месяц (UTC): закрыт ли месяц в settings.reporting.closedPeriods. */
  async getPeriodStatus(organizationId: string) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const closed = getClosedPeriodKeys(org?.settings);
    return {
      year,
      month,
      periodKey: key,
      isClosed: closed.includes(key),
    };
  }

  /**
   * Самый ранний прошедший UTC-месяц, ещё не закрытый в settings.reporting.closedPeriods.
   * Пока такой месяц есть — UI предлагает закрыть период (после окончания месяца по календарю).
   */
  async getClosePeriodPrompt(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const closed = getClosedPeriodKeys(org?.settings);
    const now = new Date();
    const curY = now.getUTCFullYear();
    const curM = now.getUTCMonth() + 1;
    const curKey = `${curY}-${String(curM).padStart(2, "0")}`;
    for (let offset = 1; offset <= 36; offset += 1) {
      const d = new Date(Date.UTC(curY, curM - 1 - offset, 1));
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + 1;
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (key >= curKey) continue;
      if (!closed.includes(key)) {
        return {
          show: true as const,
          year: y,
          month: m,
          periodKey: key,
        };
      }
    }
    return {
      show: false as const,
      year: null,
      month: null,
      periodKey: null,
    };
  }

  /**
   * Краткие показатели для главной: P&L (чистая прибыль за текущий UTC-месяц),
   * упрощённый баланс (сальдо по типам на дату), движение денег на 101+221 за месяц.
   */
  async dashboardMiniFinancials(
    organizationId: string,
    ledgerType: LedgerType = LedgerType.NAS,
  ) {
    const today = new Date();
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth() + 1;
    const pad = (n: number) => String(n).padStart(2, "0");
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const dateFromStr = `${y}-${pad(m)}-01`;
    const dateToStr = `${y}-${pad(m)}-${pad(lastDay)}`;

    const pl = await this.profitAndLoss(
      organizationId,
      dateFromStr,
      dateToStr,
      ledgerType,
    );

    const tb = await this.trialBalance(
      organizationId,
      "1970-01-01",
      dateToStr,
      ledgerType,
    );

    let assets = new Decimal(0);
    let liab = new Decimal(0);
    let eq = new Decimal(0);
    for (const row of tb.rows) {
      const net = new Decimal(row.closingDebit).sub(new Decimal(row.closingCredit));
      if (row.accountType === AccountType.ASSET) {
        assets = assets.add(net);
      } else if (row.accountType === AccountType.LIABILITY) {
        liab = liab.add(net.neg());
      } else if (row.accountType === AccountType.EQUITY) {
        eq = eq.add(net.neg());
      }
    }
    const totalLiabEq = liab.add(eq);

    const { start: monthStart, end: monthEnd } = monthRangeUtc(y, m);
    const cashAccs = await this.prisma.account.findMany({
      where: {
        organizationId,
        ledgerType,
        OR: [
          { code: { startsWith: CASH_PREFIX } },
          ...BANK_PREFIXES.map((p) => ({ code: { startsWith: p } })),
        ],
      },
      select: { id: true },
    });
    const cashIds = cashAccs.map((a) => a.id);
    let cashFlowMonth = new Decimal(0);
    if (cashIds.length > 0) {
      const agg = await this.prisma.journalEntry.aggregate({
        where: {
          organizationId,
          ledgerType,
          accountId: { in: cashIds },
          transaction: {
            date: { gte: monthStart, lte: endOfUtcDay(monthEnd) },
            isFinal: true,
          },
        },
        _sum: { debit: true, credit: true },
      });
      cashFlowMonth = d(agg._sum.debit).sub(d(agg._sum.credit));
    }

    return {
      ledgerType,
      periodLabel: `${y}-${pad(m)}`,
      dateFrom: dateFromStr,
      dateTo: dateToStr,
      plNetProfit: pl.netProfit,
      totalAssets: assets.toFixed(4),
      totalLiabilitiesEquity: totalLiabEq.toFixed(4),
      cashFlowMonth: cashFlowMonth.toFixed(4),
    };
  }

  async closePeriod(organizationId: string, year: number, month: number) {
    if (month < 1 || month > 12) {
      throw new BadRequestException("month must be 1-12");
    }
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const { start, end } = monthRangeUtc(year, month);

    const dep = await this.prisma.$transaction(async (tx) => {
      const depResult = await this.depreciation.applyForClosedMonth(
        tx,
        organizationId,
        year,
        month,
      );

      await tx.transaction.updateMany({
        where: {
          organizationId,
          date: { gte: start, lte: end },
        },
        data: { isLocked: true },
      });

      const snapshotDate = end;
      const grouped = await tx.journalEntry.groupBy({
        by: ["accountId", "ledgerType"],
        where: {
          organizationId,
          transaction: { date: { lte: end }, isFinal: true },
        },
        _sum: { debit: true, credit: true },
      });
      for (const g of grouped) {
        await tx.accountBalance.upsert({
          where: {
            organizationId_accountId_ledgerType_balanceDate: {
              organizationId,
              accountId: g.accountId,
              ledgerType: g.ledgerType,
              balanceDate: snapshotDate,
            },
          },
          create: {
            organizationId,
            accountId: g.accountId,
            ledgerType: g.ledgerType,
            balanceDate: snapshotDate,
            debitBalance: d(g._sum.debit),
            creditBalance: d(g._sum.credit),
          },
          update: {
            debitBalance: d(g._sum.debit),
            creditBalance: d(g._sum.credit),
          },
        });
      }

      const org = await tx.organization.findUnique({
        where: { id: organizationId },
      });
      if (!org) throw new BadRequestException("Organization not found");
      const nextSettings = mergeClosedPeriod(org.settings, key);
      await tx.organization.update({
        where: { id: organizationId },
        data: { settings: nextSettings as Prisma.InputJsonValue },
      });
      return depResult;
    });

    return {
      closedPeriod: key,
      transactionsMarked: true,
      depreciation: dep,
    };
  }
}
