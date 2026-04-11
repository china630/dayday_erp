import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AdvanceReportStatus,
  CashOrderKind,
  CashOrderPkoSubtype,
  CashOrderRkoSubtype,
  CashOrderStatus,
  Decimal,
  LedgerType,
  type Prisma,
} from "@dayday/database";
import { AccountingService } from "../accounting/accounting.service";
import {
  ACCOUNTABLE_PERSONS_ACCOUNT_CODE,
  CASH_OPERATIONAL_ACCOUNT_CODE,
  MAIN_BANK_ACCOUNT_CODE,
  MISC_OPERATING_EXPENSE_ACCOUNT_CODE,
  PAYABLE_SUPPLIERS_ACCOUNT_CODE,
  PAYROLL_EXPENSE_ACCOUNT_CODE,
  RECEIVABLE_ACCOUNT_CODE,
  REVENUE_ACCOUNT_CODE,
} from "../ledger.constants";
import { PrismaService } from "../prisma/prisma.service";
import { ReportingService } from "../reporting/reporting.service";

type Tx = Prisma.TransactionClient;

function d(v: Decimal | string | null | undefined): Decimal {
  if (v == null || v === "") return new Decimal(0);
  if (typeof v === "string") return new Decimal(v);
  return v;
}

@Injectable()
export class CashOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly reporting: ReportingService,
  ) {}

  async nextOrderNumberTx(
    tx: Tx,
    organizationId: string,
    kind: CashOrderKind,
    year: number,
  ): Promise<string> {
    const prefix = kind === CashOrderKind.PKO ? "PKO" : "RKO";
    const start = `${prefix}-${year}-`;
    const last = await tx.cashOrder.findFirst({
      where: {
        organizationId,
        orderNumber: { startsWith: start },
      },
      orderBy: { orderNumber: "desc" },
    });
    let seq = 1;
    if (last) {
      const parts = last.orderNumber.split("-");
      const n = Number.parseInt(parts[2] ?? "0", 10);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}-${year}-${String(seq).padStart(5, "0")}`;
  }

  /**
   * Авто-касса: ордер при оплате инвойса наличными (101*), без дубля проводки.
   */
  async createAutoFromInvoicePayment(
    tx: Tx,
    organizationId: string,
    params: {
      invoiceId: string;
      invoiceNumber: string;
      counterpartyId: string;
      currency: string;
      amount: Decimal;
      valueDate: Date;
      debitAccountCode: string;
      paymentId: string;
      transactionId: string;
    },
  ): Promise<void> {
    if (
      params.debitAccountCode !== "101" &&
      !params.debitAccountCode.startsWith("101.")
    ) {
      return;
    }
    const existing = await tx.cashOrder.findFirst({
      where: { sourceInvoicePaymentId: params.paymentId },
    });
    if (existing) return;

    const year = params.valueDate.getUTCFullYear();
    const orderNumber = await this.nextOrderNumberTx(
      tx,
      organizationId,
      CashOrderKind.PKO,
      year,
    );

    await tx.cashOrder.create({
      data: {
        organizationId,
        orderNumber,
        date: params.valueDate,
        kind: CashOrderKind.PKO,
        status: CashOrderStatus.DRAFT,
        pkoSubtype: CashOrderPkoSubtype.INCOME_FROM_CUSTOMER,
        currency: params.currency,
        amount: params.amount,
        purpose: `Invoice ${params.invoiceNumber}`,
        cashAccountCode: params.debitAccountCode,
        offsetAccountCode: RECEIVABLE_ACCOUNT_CODE,
        counterpartyId: params.counterpartyId,
        sourceInvoiceId: params.invoiceId,
        sourceInvoicePaymentId: params.paymentId,
        skipJournalPosting: true,
        linkedTransactionId: params.transactionId,
      },
    });
  }

  async getCashBalancesByCurrency(
    organizationId: string,
    ledgerType: LedgerType,
  ): Promise<Record<string, string>> {
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
      select: { code: true, currency: true },
    });
    const byCode = new Map(accounts.map((a) => [a.code, a]));

    const sums = new Map<string, Decimal>();
    for (const row of tb.rows) {
      if (row.accountCode !== "101" && !row.accountCode.startsWith("101.")) {
        continue;
      }
      const net = d(row.closingDebit).sub(d(row.closingCredit));
      const cur = byCode.get(row.accountCode)?.currency ?? "AZN";
      sums.set(cur, (sums.get(cur) ?? new Decimal(0)).add(net));
    }
    const out: Record<string, string> = { AZN: "0.00", USD: "0.00", EUR: "0.00" };
    for (const [cur, v] of sums) {
      if (cur in out) {
        out[cur] = v.toFixed(2);
      } else {
        out[cur] = v.toFixed(2);
      }
    }
    return out;
  }

  listOrders(organizationId: string) {
    return this.prisma.cashOrder.findMany({
      where: { organizationId },
      orderBy: [{ date: "desc" }, { orderNumber: "desc" }],
      include: {
        counterparty: { select: { id: true, name: true, taxId: true } },
        employee: {
          select: { id: true, firstName: true, lastName: true, finCode: true },
        },
      },
    });
  }

  async createDraftPko(
    organizationId: string,
    dto: {
      date: string;
      pkoSubtype: CashOrderPkoSubtype;
      amount: number;
      currency?: string;
      purpose: string;
      cashAccountCode?: string;
      offsetAccountCode?: string;
      counterpartyId?: string;
      employeeId?: string;
      notes?: string;
    },
  ) {
    const amount = new Decimal(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException("amount must be positive");
    }
    const date = new Date(dto.date + "T12:00:00.000Z");
    const year = date.getUTCFullYear();
    const offset = this.resolvePkoOffset(dto.pkoSubtype, dto.offsetAccountCode);
    return this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.nextOrderNumberTx(
        tx,
        organizationId,
        CashOrderKind.PKO,
        year,
      );
      return tx.cashOrder.create({
        data: {
          organizationId,
          orderNumber,
          date,
          kind: CashOrderKind.PKO,
          status: CashOrderStatus.DRAFT,
          pkoSubtype: dto.pkoSubtype,
          currency: dto.currency || "AZN",
          amount,
          purpose: dto.purpose.trim() || "—",
          notes: dto.notes?.trim() || null,
          cashAccountCode: dto.cashAccountCode?.trim() || CASH_OPERATIONAL_ACCOUNT_CODE,
          offsetAccountCode: offset,
          counterpartyId: dto.counterpartyId ?? null,
          employeeId: dto.employeeId ?? null,
        },
      });
    });
  }

  async createDraftRko(
    organizationId: string,
    dto: {
      date: string;
      rkoSubtype: CashOrderRkoSubtype;
      amount: number;
      currency?: string;
      purpose: string;
      cashAccountCode?: string;
      offsetAccountCode?: string;
      counterpartyId?: string;
      employeeId?: string;
      notes?: string;
    },
  ) {
    const amount = new Decimal(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException("amount must be positive");
    }
    const date = new Date(dto.date + "T12:00:00.000Z");
    const year = date.getUTCFullYear();
    const offset = await this.resolveRkoOffset(
      this.prisma,
      organizationId,
      dto.rkoSubtype,
      dto.employeeId,
      dto.offsetAccountCode,
    );
    return this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.nextOrderNumberTx(
        tx,
        organizationId,
        CashOrderKind.RKO,
        year,
      );
      return tx.cashOrder.create({
        data: {
          organizationId,
          orderNumber,
          date,
          kind: CashOrderKind.RKO,
          status: CashOrderStatus.DRAFT,
          rkoSubtype: dto.rkoSubtype,
          currency: dto.currency || "AZN",
          amount,
          purpose: dto.purpose.trim() || "—",
          notes: dto.notes?.trim() || null,
          cashAccountCode: dto.cashAccountCode?.trim() || CASH_OPERATIONAL_ACCOUNT_CODE,
          offsetAccountCode: offset,
          counterpartyId: dto.counterpartyId ?? null,
          employeeId: dto.employeeId ?? null,
        },
      });
    });
  }

  private resolvePkoOffset(
    st: CashOrderPkoSubtype,
    explicit?: string,
  ): string {
    if (explicit?.trim()) return explicit.trim();
    switch (st) {
      case CashOrderPkoSubtype.INCOME_FROM_CUSTOMER:
        return REVENUE_ACCOUNT_CODE;
      case CashOrderPkoSubtype.WITHDRAWAL_FROM_BANK:
        return MAIN_BANK_ACCOUNT_CODE;
      case CashOrderPkoSubtype.RETURN_FROM_ACCOUNTABLE:
        throw new BadRequestException(
          "offsetAccountCode required (subaccount 244.xx)",
        );
      case CashOrderPkoSubtype.OTHER:
        throw new BadRequestException("offsetAccountCode required");
      default:
        return REVENUE_ACCOUNT_CODE;
    }
  }

  private async resolveRkoOffset(
    prisma: PrismaService | Tx,
    organizationId: string,
    st: CashOrderRkoSubtype,
    employeeId: string | undefined,
    explicit?: string,
  ): Promise<string> {
    if (explicit?.trim()) return explicit.trim();
    switch (st) {
      case CashOrderRkoSubtype.SALARY:
        return PAYROLL_EXPENSE_ACCOUNT_CODE;
      case CashOrderRkoSubtype.SUPPLIER_PAYMENT:
        return PAYABLE_SUPPLIERS_ACCOUNT_CODE;
      case CashOrderRkoSubtype.BANK_DEPOSIT:
        return MAIN_BANK_ACCOUNT_CODE;
      case CashOrderRkoSubtype.ACCOUNTABLE_ISSUE:
        if (!employeeId) {
          throw new BadRequestException("employeeId required for accountable issue");
        }
        const emp = await prisma.employee.findFirst({
          where: { id: employeeId, organizationId },
        });
        if (!emp?.accountableAccountCode244?.trim()) {
          throw new BadRequestException(
            "Employee has no accountable account (244) — set accountableAccountCode244",
          );
        }
        return emp.accountableAccountCode244.trim();
      case CashOrderRkoSubtype.OTHER:
        throw new BadRequestException("offsetAccountCode required");
      default:
        return PAYROLL_EXPENSE_ACCOUNT_CODE;
    }
  }

  async postOrder(organizationId: string, orderId: string) {
    const order = await this.prisma.cashOrder.findFirst({
      where: { id: orderId, organizationId },
    });
    if (!order) throw new NotFoundException("Cash order not found");
    if (order.status !== CashOrderStatus.DRAFT) {
      throw new ConflictException("Order is not draft");
    }
    if (order.skipJournalPosting) {
      return this.prisma.cashOrder.update({
        where: { id: order.id },
        data: {
          status: CashOrderStatus.POSTED,
          postedTransactionId: order.linkedTransactionId ?? undefined,
        },
      });
    }
    if (!order.offsetAccountCode?.trim()) {
      throw new BadRequestException("offsetAccountCode missing");
    }
    const cash = order.cashAccountCode;
    const offset = order.offsetAccountCode.trim();
    const amt = order.amount.toString();

    return this.prisma.$transaction(async (tx) => {
      let lines: Array<{ accountCode: string; debit: string; credit: string }>;
      if (order.kind === CashOrderKind.PKO) {
        lines = [
          { accountCode: cash, debit: amt, credit: "0" },
          { accountCode: offset, debit: "0", credit: amt },
        ];
      } else {
        lines = [
          { accountCode: offset, debit: amt, credit: "0" },
          { accountCode: cash, debit: "0", credit: amt },
        ];
      }
      const { transactionId } = await this.accounting.postJournalInTransaction(tx, {
        organizationId,
        date: order.date,
        reference: order.orderNumber,
        description: order.purpose,
        isFinal: true,
        lines,
      });
      await tx.cashOrder.update({
        where: { id: order.id },
        data: {
          status: CashOrderStatus.POSTED,
          postedTransactionId: transactionId,
        },
      });
      return tx.cashOrder.findUniqueOrThrow({ where: { id: order.id } });
    });
  }

  async getPrintHtml(organizationId: string, orderId: string): Promise<string> {
    const order = await this.prisma.cashOrder.findFirst({
      where: { id: orderId, organizationId },
      include: {
        counterparty: true,
        employee: true,
        organization: { select: { name: true, taxId: true } },
      },
    });
    if (!order) throw new NotFoundException("Cash order not found");

    const kindLabel = order.kind === CashOrderKind.PKO ? "PKO" : "RKO";
    const cp = order.counterparty?.name ?? "";
    const emp = order.employee
      ? `${order.employee.firstName} ${order.employee.lastName}`
      : "";
    const party = cp || emp || "—";
    const amountStr = order.amount.toFixed(2);
    const titleAz =
      order.kind === CashOrderKind.PKO
        ? "Mədaxil kassa orderi (PKO)"
        : "Məxaric kassa orderi (RKO)";
    return `<!DOCTYPE html>
<html lang="az">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${kindLabel} ${order.orderNumber}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      font-family: "Segoe UI", system-ui, sans-serif;
      font-size: 11pt;
      line-height: 1.35;
      color: #111;
      max-width: 180mm;
      margin: 0 auto;
      padding: 10mm 12mm;
      box-sizing: border-box;
    }
    .sheet { page-break-inside: avoid; }
    h1 { font-size: 14pt; text-align: center; margin: 0 0 12px; font-weight: 700; }
    .sub { text-align: center; font-size: 9pt; color: #444; margin: 0 0 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    td { border: 1px solid #222; padding: 8px 10px; vertical-align: top; }
    td.lbl { width: 36%; font-weight: 600; background: #f8f8f8; }
    .muted { color: #555; font-size: 9pt; }
    .sign { margin-top: 22px; font-size: 10pt; }
    @media print {
      body { padding: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <p class="muted">Azərbaycan Respublikası — kassa sənədi (çap üçün)</p>
    <h1>${titleAz}</h1>
    <p class="sub">№ ${order.orderNumber}</p>
    <p><strong>Tarix:</strong> ${order.date.toISOString().slice(0, 10)}</p>
    <p><strong>Təşkilat:</strong> ${order.organization.name} &nbsp;·&nbsp; VÖEN: ${order.organization.taxId ?? "—"}</p>
    <table>
      <tr><td class="lbl">Kontragent / işçi</td><td>${party}</td></tr>
      <tr><td class="lbl">Təyinat</td><td>${order.purpose}</td></tr>
      <tr><td class="lbl">Məbləğ</td><td>${amountStr} ${order.currency}</td></tr>
      <tr><td class="lbl">Kassa hesabı (101)</td><td>${order.cashAccountCode}</td></tr>
      <tr><td class="lbl">Əks hesab</td><td>${order.offsetAccountCode ?? "—"}</td></tr>
    </table>
    <p class="sign muted">İmza məsul şəxsin: ______________________ &nbsp;&nbsp; M.Ə.</p>
  </div>
  <script>window.onload = function () { window.focus(); };</script>
</body>
</html>`;
  }

  async listAccountablePersons(organizationId: string, ledgerType: LedgerType) {
    const today = new Date().toISOString().slice(0, 10);
    const yearStart = `${new Date().getUTCFullYear()}-01-01`;
    const tb = await this.reporting.trialBalance(
      organizationId,
      yearStart,
      today,
      ledgerType,
    );
    const employees = await this.prisma.employee.findMany({
      where: { organizationId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        finCode: true,
        accountableAccountCode244: true,
      },
    });
    const byAccount = new Map(
      employees
        .filter((e) => e.accountableAccountCode244?.trim())
        .map((e) => [e.accountableAccountCode244!.trim(), e]),
    );

    const rows: Array<{
      employee: (typeof employees)[0];
      accountCode: string;
      balance: string;
      currency: string;
    }> = [];

    for (const row of tb.rows) {
      if (
        row.accountCode !== ACCOUNTABLE_PERSONS_ACCOUNT_CODE &&
        !row.accountCode.startsWith(`${ACCOUNTABLE_PERSONS_ACCOUNT_CODE}.`)
      ) {
        continue;
      }
      const net = d(row.closingDebit).sub(d(row.closingCredit));
      if (net.lte(0)) continue;
      const emp = byAccount.get(row.accountCode);
      if (!emp) continue;
      rows.push({
        employee: emp,
        accountCode: row.accountCode,
        balance: net.toFixed(2),
        currency: "AZN",
      });
    }
    return rows;
  }

  async createAdvanceReportDraft(
    organizationId: string,
    dto: {
      employeeId: string;
      reportDate: string;
      expenseLines: Array<{ amount: number; description: string }>;
      purpose?: string;
    },
  ) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, organizationId },
    });
    if (!emp?.accountableAccountCode244?.trim()) {
      throw new BadRequestException("Employee accountable 244 account not set");
    }
    let total = new Decimal(0);
    for (const line of dto.expenseLines) {
      total = total.add(new Decimal(line.amount));
    }
    if (total.lte(0)) {
      throw new BadRequestException("total expenses must be positive");
    }
    return this.prisma.advanceReport.create({
      data: {
        organizationId,
        employeeId: dto.employeeId,
        reportDate: new Date(dto.reportDate + "T12:00:00.000Z"),
        expenseLines: dto.expenseLines as object,
        totalDeclared: total,
        purpose: dto.purpose?.trim() ?? "",
        status: AdvanceReportStatus.DRAFT,
      },
    });
  }

  async postAdvanceReport(organizationId: string, reportId: string) {
    const rep = await this.prisma.advanceReport.findFirst({
      where: { id: reportId, organizationId },
      include: { employee: true },
    });
    if (!rep) throw new NotFoundException("Advance report not found");
    if (rep.status !== AdvanceReportStatus.DRAFT) {
      throw new ConflictException("Already posted");
    }
    const acc244 = rep.employee.accountableAccountCode244?.trim();
    if (!acc244) {
      throw new BadRequestException("Employee 244 account missing");
    }
    const amt = rep.totalDeclared.toString();

    return this.prisma.$transaction(async (tx) => {
      const { transactionId } = await this.accounting.postJournalInTransaction(tx, {
        organizationId,
        date: rep.reportDate,
        reference: `AVANS-${rep.id.slice(0, 8)}`,
        description: rep.purpose || "Avans hesabatı",
        isFinal: true,
        lines: [
          {
            accountCode: MISC_OPERATING_EXPENSE_ACCOUNT_CODE,
            debit: amt,
            credit: "0",
          },
          { accountCode: acc244, debit: "0", credit: amt },
        ],
      });
      await tx.advanceReport.update({
        where: { id: rep.id },
        data: {
          status: AdvanceReportStatus.POSTED,
          transactionId,
        },
      });
      return tx.advanceReport.findUniqueOrThrow({ where: { id: rep.id } });
    });
  }
}
