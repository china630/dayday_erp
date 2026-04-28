import { Decimal, InvoiceStatus, LedgerType, pickAccountDisplayName } from "@dayday/database";
import type { PrismaService } from "../prisma/prisma.service";
import { RECEIVABLE_ACCOUNT_CODE, REVENUE_ACCOUNT_CODE } from "../ledger.constants";
import { endOfUtcDay } from "./reporting-period.util";

export type CounterpartyReconciliationOptions = {
  currency?: string | null;
  ledgerType?: LedgerType;
};

export type ReconciliationJournalLine = {
  journalEntryId: string | null;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
};

export type ReconciliationTransactionRow = {
  id: string;
  date: string;
  transactionId: string | null;
  kind: "INVOICE_RECOGNITION" | "PAYMENT";
  reference: string;
  description: string;
  currency: string | null;
  journalLines: ReconciliationJournalLine[];
  runningBalance: string;
};

function isReceivableCode(code: string): boolean {
  return code === RECEIVABLE_ACCOUNT_CODE || code.startsWith(`${RECEIVABLE_ACCOUNT_CODE}.`);
}

function isRevenueCode(code: string): boolean {
  return code === REVENUE_ACCOUNT_CODE || code.startsWith(`${REVENUE_ACCOUNT_CODE}.`);
}

function transactionIsRevenueRecognition(
  lines: Array<{ debit: Decimal; credit: Decimal; account: { code: string } }>,
): boolean {
  let dr211 = new Decimal(0);
  let cr601 = new Decimal(0);
  for (const l of lines) {
    if (isReceivableCode(l.account.code)) dr211 = dr211.add(l.debit);
    if (isRevenueCode(l.account.code)) cr601 = cr601.add(l.credit);
  }
  return dr211.gt(0) && cr601.gt(0) && dr211.sub(cr601).abs().lte(new Decimal("0.0001"));
}

function mapEntriesToJournalLines(
  entries: Array<{
    id: string;
    debit: Decimal;
    credit: Decimal;
    account: { code: string; nameAz: string; nameRu: string; nameEn: string };
  }>,
): ReconciliationJournalLine[] {
  return entries.map((e) => ({
    journalEntryId: e.id,
    accountCode: e.account.code,
    accountName: pickAccountDisplayName(e.account, "ru"),
    debit: e.debit.toFixed(4),
    credit: e.credit.toFixed(4),
  }));
}

export async function buildCounterpartyReconciliationPayload(
  prisma: PrismaService,
  organizationId: string,
  counterpartyId: string,
  dateFrom: Date,
  dateTo: Date,
  dateFromStr: string,
  dateToStr: string,
  options?: CounterpartyReconciliationOptions,
): Promise<{
  opening: Decimal;
  closing: Decimal;
  turnoverDebit: Decimal;
  turnoverCredit: Decimal;
  lines: Array<{
    kind: "OPENING" | "INVOICE" | "PAYMENT";
    date: string;
    reference: string;
    description: string;
    debit: string;
    credit: string;
    balanceAfter: string;
  }>;
  transactions: ReconciliationTransactionRow[];
  invsRecognizedInPeriod: Array<{
    id: string;
    number: string;
    totalAmount: Decimal;
    currency: string;
    recognizedAt: Date | null;
    createdAt: Date;
  }>;
  paymentsInPeriod: Array<{
    id: string;
    amount: Decimal;
    date: Date;
    transactionId: string | null;
    invoice: { number: string; currency: string };
  }>;
  primaryCurrency: string;
}> {
  const ledgerType = options?.ledgerType ?? LedgerType.NAS;
  const currencyUpper = options?.currency?.trim().toUpperCase() ?? null;
  const invCurWhere = currencyUpper ? ({ currency: currencyUpper } as const) : {};

  const dateToEnd = endOfUtcDay(dateTo);

  const invsForOpening = await prisma.invoice.findMany({
    where: {
      organizationId,
      counterpartyId,
      revenueRecognized: true,
      status: { not: InvoiceStatus.CANCELLED },
      recognizedAt: { lt: dateFrom },
      ...invCurWhere,
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

  const invsRecognizedInPeriod = await prisma.invoice.findMany({
    where: {
      organizationId,
      counterpartyId,
      revenueRecognized: true,
      status: { not: InvoiceStatus.CANCELLED },
      recognizedAt: { gte: dateFrom, lte: dateToEnd },
      ...invCurWhere,
    },
    orderBy: [{ recognizedAt: "asc" }, { number: "asc" }],
    select: {
      id: true,
      number: true,
      totalAmount: true,
      currency: true,
      recognizedAt: true,
      createdAt: true,
    },
  });

  const paymentsInPeriod = await prisma.invoicePayment.findMany({
    where: {
      organizationId,
      date: { gte: dateFrom, lte: dateTo },
      invoice: { counterpartyId, ...invCurWhere },
    },
    include: { invoice: { select: { number: true, currency: true } } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  const [acc211, acc601] = await Promise.all([
    prisma.account.findFirst({
      where: { organizationId, ledgerType, code: RECEIVABLE_ACCOUNT_CODE },
    }),
    prisma.account.findFirst({
      where: { organizationId, ledgerType, code: REVENUE_ACCOUNT_CODE },
    }),
  ]);
  const fallback211 = acc211 ? pickAccountDisplayName(acc211, "ru") : "Дебиторская задолженность";
  const fallback601 = acc601 ? pickAccountDisplayName(acc601, "ru") : "Выручка";

  const invRefs = [...new Set(invsRecognizedInPeriod.map((i) => i.number))];
  const revenueTxCandidates =
    invRefs.length === 0
      ? []
      : await prisma.transaction.findMany({
          where: {
            organizationId,
            reference: { in: invRefs },
            isFinal: true,
            date: { gte: dateFrom, lte: dateToEnd },
          },
          include: {
            journalEntries: {
              where: { ledgerType },
              include: { account: true },
              orderBy: { id: "asc" },
            },
          },
        });

  const paymentTxIds = [
    ...new Set(
      paymentsInPeriod.map((p) => p.transactionId).filter((x): x is string => !!x),
    ),
  ];
  type JeRow = {
    id: string;
    transactionId: string;
    debit: Decimal;
    credit: Decimal;
    account: { code: string; nameAz: string; nameRu: string; nameEn: string };
  };
  const paymentJournalByTx = new Map<string, JeRow[]>();
  if (paymentTxIds.length > 0) {
    const rows = await prisma.journalEntry.findMany({
      where: {
        organizationId,
        ledgerType,
        transactionId: { in: paymentTxIds },
      },
      include: { account: true },
      orderBy: { id: "asc" },
    });
    for (const r of rows) {
      const arr = paymentJournalByTx.get(r.transactionId) ?? [];
      arr.push(r);
      paymentJournalByTx.set(r.transactionId, arr);
    }
  }

  function pickRevenueTx(inv: (typeof invsRecognizedInPeriod)[0]): (typeof revenueTxCandidates)[0] | null {
    const candidates = revenueTxCandidates.filter(
      (t) =>
        t.reference === inv.number &&
        transactionIsRevenueRecognition(t.journalEntries),
    );
    if (candidates.length === 0) return null;
    const target = inv.totalAmount;
    const scored = candidates.map((t) => {
      const dr211 = t.journalEntries
        .filter((e) => isReceivableCode(e.account.code))
        .reduce((s, e) => s.add(e.debit), new Decimal(0));
      const amtDiff = dr211.sub(target).abs();
      const timeRef = (inv.recognizedAt ?? inv.createdAt).getTime();
      const timeDiff = Math.abs(t.date.getTime() - timeRef);
      return { t, amtDiff, timeDiff };
    });
    scored.sort((a, b) => {
      if (!a.amtDiff.eq(b.amtDiff)) return a.amtDiff.cmp(b.amtDiff);
      return a.timeDiff - b.timeDiff;
    });
    return scored[0]?.t ?? null;
  }

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

  type SortPart = {
    sort: number;
    line: Line;
    txn: ReconciliationTransactionRow;
  };
  const parts: SortPart[] = [];

  for (const inv of invsRecognizedInPeriod) {
    const day = (inv.recognizedAt ?? inv.createdAt).toISOString().slice(0, 10);
    const sort = (inv.recognizedAt ?? inv.createdAt).getTime() * 10;
    const matched = pickRevenueTx(inv);
    const journalLines: ReconciliationJournalLine[] = matched
      ? mapEntriesToJournalLines(matched.journalEntries)
      : [
          {
            journalEntryId: null,
            accountCode: RECEIVABLE_ACCOUNT_CODE,
            accountName: fallback211,
            debit: inv.totalAmount.toFixed(4),
            credit: "0.0000",
          },
          {
            journalEntryId: null,
            accountCode: REVENUE_ACCOUNT_CODE,
            accountName: fallback601,
            debit: "0.0000",
            credit: inv.totalAmount.toFixed(4),
          },
        ];
    parts.push({
      sort,
      line: {
        kind: "INVOICE",
        date: day,
        reference: inv.number,
        description: matched
          ? `Счёт — проводка в журнале (Дт ${RECEIVABLE_ACCOUNT_CODE} / Кт ${REVENUE_ACCOUNT_CODE})`
          : `Счёт (начисление Дт ${RECEIVABLE_ACCOUNT_CODE})`,
        debit: inv.totalAmount.toFixed(4),
        credit: "0.0000",
        balanceAfter: "0.0000",
      },
      txn: {
        id: `inv-${inv.id}`,
        date: day,
        transactionId: matched?.id ?? null,
        kind: "INVOICE_RECOGNITION",
        reference: inv.number,
        description: matched
          ? "Начисление выручки и дебиторской задолженности"
          : "Начисление (синтетические строки журнала)",
        currency: inv.currency,
        journalLines,
        runningBalance: "0.0000",
      },
    });
  }

  for (const pay of paymentsInPeriod) {
    const day = pay.date.toISOString().slice(0, 10);
    const sort = pay.date.getTime() * 10 + 1;
    const jrows =
      pay.transactionId ? paymentJournalByTx.get(pay.transactionId) : undefined;
    const journalLines: ReconciliationJournalLine[] =
      jrows && jrows.length > 0
        ? mapEntriesToJournalLines(jrows)
        : [
            {
              journalEntryId: null,
              accountCode: "101/221",
              accountName: "Денежные средства (по настройке счёта)",
              debit: pay.amount.toFixed(4),
              credit: "0.0000",
            },
            {
              journalEntryId: null,
              accountCode: RECEIVABLE_ACCOUNT_CODE,
              accountName: fallback211,
              debit: "0.0000",
              credit: pay.amount.toFixed(4),
            },
          ];
    parts.push({
      sort,
      line: {
        kind: "PAYMENT",
        date: day,
        reference: pay.invoice.number,
        description: pay.transactionId
          ? `Оплата — строки журнала (Кт ${RECEIVABLE_ACCOUNT_CODE})`
          : "Оплата (Кт 211)",
        debit: "0.0000",
        credit: pay.amount.toFixed(4),
        balanceAfter: "0.0000",
      },
      txn: {
        id: `pay-${pay.id}`,
        date: day,
        transactionId: pay.transactionId,
        kind: "PAYMENT",
        reference: pay.invoice.number,
        description: "Поступление оплаты от покупателя",
        currency: pay.invoice.currency,
        journalLines,
        runningBalance: "0.0000",
      },
    });
  }

  parts.sort((a, b) => a.sort - b.sort);

  const transactions: ReconciliationTransactionRow[] = [];
  for (const p of parts) {
    const debit = new Decimal(p.line.debit);
    const credit = new Decimal(p.line.credit);
    running = running.add(debit).sub(credit);
    lines.push({
      ...p.line,
      balanceAfter: running.toFixed(4),
    });
    transactions.push({
      ...p.txn,
      runningBalance: running.toFixed(4),
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

  const primaryCurrency =
    currencyUpper ??
    invsRecognizedInPeriod[0]?.currency ??
    invsForOpening[0]?.currency ??
    paymentsInPeriod[0]?.invoice.currency ??
    "AZN";

  return {
    opening,
    closing,
    turnoverDebit,
    turnoverCredit,
    lines,
    transactions,
    invsRecognizedInPeriod,
    paymentsInPeriod,
    primaryCurrency,
  };
}

export async function counterpartyReconciliationXlsxBuffer(data: {
  organizationName: string;
  organizationTaxId: string;
  counterpartyName: string;
  counterpartyTaxId: string;
  dateFrom: string;
  dateTo: string;
  openingBalance: string;
  closingBalance: string;
  currencyLabel: string;
  transactions: ReconciliationTransactionRow[];
}): Promise<{ buffer: Buffer; filename: string }> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Акт сверки");
  ws.addRow([
    "Организация",
    data.organizationName,
    "VÖEN",
    data.organizationTaxId,
  ]);
  ws.addRow(["Контрагент", data.counterpartyName, "VÖEN", data.counterpartyTaxId]);
  ws.addRow(["Период", `${data.dateFrom} — ${data.dateTo}`, "Валюта", data.currencyLabel]);
  ws.addRow(["Сальдо на начало", data.openingBalance, "Сальдо на конец", data.closingBalance]);
  ws.addRow([]);
  ws.addRow([
    "Дата",
    "Документ",
    "Тип",
    "Счёт",
    "Дт",
    "Кт",
    "Сальдо после",
  ]);
  for (const tx of data.transactions) {
    for (const jl of tx.journalLines) {
      ws.addRow([
        tx.date,
        tx.reference,
        tx.kind,
        jl.accountCode,
        jl.debit,
        jl.credit,
        tx.runningBalance,
      ]);
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  const safe = data.counterpartyTaxId.replace(/\D/g, "").slice(0, 10);
  const filename = `reconciliation-${safe || "cp"}-${data.dateFrom}-${data.dateTo}.xlsx`;
  return { buffer: Buffer.from(buf), filename };
}
