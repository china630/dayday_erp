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
  PayrollRunStatus,
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

    const [openingAgg, periodAgg] = await Promise.all([
      this.prisma.journalEntry.groupBy({
        by: ["accountId"],
        where: {
          organizationId,
          ledgerType,
          accountId: { in: accountIds },
          transaction: { date: { lt: dateFrom } },
        },
        _sum: { debit: true, credit: true },
      }),
      this.prisma.journalEntry.groupBy({
        by: ["accountId"],
        where: {
          organizationId,
          ledgerType,
          accountId: { in: accountIds },
          transaction: {
            date: { gte: dateFrom, lte: dateTo },
          },
        },
        _sum: { debit: true, credit: true },
      }),
    ]);

    const openMap = new Map(
      openingAgg.map((r) => [
        r.accountId,
        {
          dr: d(r._sum.debit),
          cr: d(r._sum.credit),
        },
      ]),
    );
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
      const o = openMap.get(acc.id) ?? { dr: new Decimal(0), cr: new Decimal(0) };
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
        accountName: acc.name,
        accountType: acc.type,
        openingDebit: ob.debit.toFixed(4),
        openingCredit: ob.credit.toFixed(4),
        periodDebit: periodDr.toFixed(4),
        periodCredit: periodCr.toFixed(4),
        closingDebit: cb.debit.toFixed(4),
        closingCredit: cb.credit.toFixed(4),
      };
    });

    return {
      dateFrom: dateFromStr,
      dateTo: dateToStr,
      ledgerType,
      rows,
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

    const agg = await this.prisma.journalEntry.groupBy({
      by: ["accountId"],
      where: {
        organizationId,
        ledgerType,
        accountId: { in: ids },
        transaction: { date: { gte: dateFrom, lte: dateTo } },
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
    let payrollExpenseNet = r721.dr.sub(r721.cr);
    let payrollSource: "ledger" | "department_payroll" = "ledger";

    const deptFilter = departmentId?.trim();
    if (deptFilter) {
      const dept = await this.prisma.department.findFirst({
        where: { id: deptFilter, organizationId },
      });
      if (!dept) {
        throw new BadRequestException("Неизвестный департамент");
      }
      const slips = await this.prisma.payrollSlip.findMany({
        where: {
          organizationId,
          employee: {
            jobPosition: { departmentId: deptFilter },
          },
          payrollRun: {
            status: PayrollRunStatus.POSTED,
            transaction: {
              date: { gte: dateFrom, lte: dateTo },
            },
          },
        },
        select: {
          gross: true,
          dsmfEmployer: true,
          itsEmployer: true,
          unemploymentEmployer: true,
        },
      });
      payrollExpenseNet = slips.reduce(
        (acc, s) =>
          acc
            .add(s.gross)
            .add(s.dsmfEmployer)
            .add(s.itsEmployer)
            .add(s.unemploymentEmployer),
        new Decimal(0),
      );
      payrollSource = "department_payroll";
    }

    const r662 = pick(FX_GAIN_ACCOUNT_CODE);
    const fx662Net = r662.dr.sub(r662.cr);

    const netProfit = revenueNet
      .sub(cogsNet)
      .sub(payrollExpenseNet)
      .sub(fx662Net);

    const payrollLabel =
      payrollSource === "department_payroll"
        ? `Расходы на ЗП по департаменту (${PAYROLL_EXPENSE_ACCOUNT_CODE}, по расчётам)`
        : `Расходы на ЗП (${PAYROLL_EXPENSE_ACCOUNT_CODE})`;

    return {
      dateFrom: dateFromStr,
      dateTo: dateToStr,
      ledgerType,
      departmentId: deptFilter ?? null,
      payrollExpenseSource: payrollSource,
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
      methodologyNote:
        payrollSource === "department_payroll"
          ? "Строка расходов на персонал по выбранному департаменту посчитана по проведённым расчётным листкам (gross + взносы работодателя) за период дат проводок зарплаты; прочие строки P&L — по ГК. Сумма по 721 в ГК может включать не только ФОТ (напр. амортизацию)."
          : "Чистая прибыль по начислению (обороты по счетам за период). Кассовая сверка «сумма оплат − себестоимость − налоги с ЗП» даст другой результат, если оплаты и начисления не совпадают по периодам.",
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
      include: { payments: { select: { amount: true } } },
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
      const paid = inv.payments.reduce(
        (s, p) => s.add(p.amount),
        new Decimal(0),
      );
      const bal = inv.totalAmount.sub(paid);
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
   * Обороты 531 по контрагенту в модели не разнесены — только счета-фактуры и платежи.
   */
  async counterpartyReconciliation(
    organizationId: string,
    counterpartyId: string,
    dateFromStr: string,
    dateToStr: string,
  ) {
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

    const dateToEnd = endOfUtcDay(dateTo);

    const invsForOpening = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        counterpartyId,
        revenueRecognized: true,
        status: { not: InvoiceStatus.CANCELLED },
        recognizedAt: { lt: dateFrom },
      },
      include: {
        payments: { where: { date: { lt: dateFrom } } },
      },
    });

    let opening = new Decimal(0);
    for (const inv of invsForOpening) {
      const paidBefore = inv.payments.reduce(
        (s, p) => s.add(p.amount),
        new Decimal(0),
      );
      opening = opening.add(inv.totalAmount.sub(paidBefore));
    }

    const invsRecognizedInPeriod = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        counterpartyId,
        revenueRecognized: true,
        status: { not: InvoiceStatus.CANCELLED },
        recognizedAt: { gte: dateFrom, lte: dateToEnd },
      },
      orderBy: [{ recognizedAt: "asc" }, { number: "asc" }],
    });

    const paymentsInPeriod = await this.prisma.invoicePayment.findMany({
      where: {
        organizationId,
        date: { gte: dateFrom, lte: dateTo },
        invoice: { counterpartyId },
      },
      include: { invoice: { select: { number: true } } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });

    type LineKind = "OPENING" | "INVOICE" | "PAYMENT";
    type Line = {
      kind: LineKind;
      date: string;
      reference: string;
      description: string;
      debit: string;
      credit: string;
      balanceAfter: string;
    };

    const lines: Line[] = [];
    let running = opening;

    lines.push({
      kind: "OPENING",
      date: dateFromStr,
      reference: "—",
      description: "Сальдо на начало периода (дебиторка)",
      debit: "0.0000",
      credit: "0.0000",
      balanceAfter: running.toFixed(4),
    });

    const movementDates: { sort: number; line: Line }[] = [];

    for (const inv of invsRecognizedInPeriod) {
      const day = (inv.recognizedAt ?? inv.createdAt).toISOString().slice(0, 10);
      const sort =
        (inv.recognizedAt ?? inv.createdAt).getTime() * 10;
      movementDates.push({
        sort,
        line: {
          kind: "INVOICE",
          date: day,
          reference: inv.number,
          description: `Счёт (начисление Дт 211)`,
          debit: inv.totalAmount.toFixed(4),
          credit: "0.0000",
          balanceAfter: "0.0000",
        },
      });
    }

    for (const pay of paymentsInPeriod) {
      const day = pay.date.toISOString().slice(0, 10);
      const sort = pay.date.getTime() * 10 + 1;
      movementDates.push({
        sort,
        line: {
          kind: "PAYMENT",
          date: day,
          reference: pay.invoice.number,
          description: "Оплата (Кт 211)",
          debit: "0.0000",
          credit: pay.amount.toFixed(4),
          balanceAfter: "0.0000",
        },
      });
    }

    movementDates.sort((a, b) => a.sort - b.sort);

    for (const { line } of movementDates) {
      const debit = new Decimal(line.debit);
      const credit = new Decimal(line.credit);
      running = running.add(debit).sub(credit);
      lines.push({
        ...line,
        balanceAfter: running.toFixed(4),
      });
    }

    const closing = running;
    const turnoverDebit = invsRecognizedInPeriod.reduce(
      (s, i) => s.add(i.totalAmount),
      new Decimal(0),
    );
    const turnoverCredit = paymentsInPeriod.reduce(
      (s, p) => s.add(p.amount),
      new Decimal(0),
    );

    return {
      organizationName: org?.name ?? "",
      organizationTaxId: org?.taxId ?? "",
      counterpartyId: cp.id,
      counterpartyName: cp.name,
      counterpartyTaxId: cp.taxId,
      dateFrom: dateFromStr,
      dateTo: dateToStr,
      openingBalance: opening.toFixed(4),
      turnoverDebit: turnoverDebit.toFixed(4),
      turnoverCredit: turnoverCredit.toFixed(4),
      closingBalance: closing.toFixed(4),
      lines,
      methodologyNote:
        "Сальдо: непогашенная дебиторская задолженность по счетам с признанной выручкой. Кредиторка (531) по поставщику в учёте не привязана к контрагенту — в акт не включена.",
      methodologyNoteAz:
        "Qeyd: Qalıq debitor borcunu əks etdirir (211, hesablanmış gəlir). Təchizatçı üzrə 531 kreditor borcu bu modeldə kontagentə birbaşa bağlı deyil və akta daxil edilmir.",
    };
  }

  async counterpartyReconciliationPdf(
    organizationId: string,
    counterpartyId: string,
    dateFromStr: string,
    dateToStr: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const data = await this.counterpartyReconciliation(
      organizationId,
      counterpartyId,
      dateFromStr,
      dateToStr,
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

  /** Старение дебиторки по сроку просрочки от dueDate (дни). */
  async accountsReceivableAging(organizationId: string) {
    const today = new Date();
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
        payments: { select: { amount: true } },
        counterparty: { select: { id: true, name: true, taxId: true } },
      },
    });

    type Bucket = { b0_30: Decimal; b31_60: Decimal; b61plus: Decimal };
    const byCp = new Map<
      string,
      { name: string; taxId: string; buckets: Bucket }
    >();

    for (const inv of invoices) {
      const paid = inv.payments.reduce(
        (s, p) => s.add(p.amount),
        new Decimal(0),
      );
      const outstanding = inv.totalAmount.sub(paid);
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
      else bucket = "b61plus";

      const id = inv.counterpartyId;
      const cur =
        byCp.get(id) ??
        {
          name: inv.counterparty.name,
          taxId: inv.counterparty.taxId,
          buckets: {
            b0_30: new Decimal(0),
            b31_60: new Decimal(0),
            b61plus: new Decimal(0),
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
      bucket61plus: v.buckets.b61plus.toFixed(4),
      total: v.buckets.b0_30
        .add(v.buckets.b31_60)
        .add(v.buckets.b61plus)
        .toFixed(4),
    }));

    rows.sort((a, b) => Number(b.total) - Number(a.total));

    const sum = rows.reduce(
      (acc, r) => ({
        bucket0to30: acc.bucket0to30.add(new Decimal(r.bucket0to30)),
        bucket31to60: acc.bucket31to60.add(new Decimal(r.bucket31to60)),
        bucket61plus: acc.bucket61plus.add(new Decimal(r.bucket61plus)),
        total: acc.total.add(new Decimal(r.total)),
      }),
      {
        bucket0to30: new Decimal(0),
        bucket31to60: new Decimal(0),
        bucket61plus: new Decimal(0),
        total: new Decimal(0),
      },
    );

    return {
      asOf: new Date(todayUtc).toISOString().slice(0, 10),
      rows,
      totals: {
        bucket0to30: sum.bucket0to30.toFixed(4),
        bucket31to60: sum.bucket31to60.toFixed(4),
        bucket61plus: sum.bucket61plus.toFixed(4),
        total: sum.total.toFixed(4),
      },
      methodologyNote:
        "Интервалы по дням просрочки от срока оплаты (due date). Непросроченные счета попадают в колонку 0–30 дней.",
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
          transaction: { date: { gte: monthStart, lte: monthEnd } },
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
          transaction: { counterpartyId: { not: null } },
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
      const d = await this.depreciation.applyForClosedMonth(
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

      const org = await tx.organization.findUnique({
        where: { id: organizationId },
      });
      if (!org) throw new BadRequestException("Organization not found");
      const nextSettings = mergeClosedPeriod(org.settings, key);
      await tx.organization.update({
        where: { id: organizationId },
        data: { settings: nextSettings as Prisma.InputJsonValue },
      });
      return d;
    });

    return {
      closedPeriod: key,
      transactionsMarked: true,
      depreciation: dep,
    };
  }
}
