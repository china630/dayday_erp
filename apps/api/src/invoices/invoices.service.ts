import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Decimal, InvoiceStatus, Prisma, type UserRole } from "@dayday/database";
import { assertUserMayMutateInvoiceInPaidStatus } from "../auth/policies/invoice-finance.policy";
import { AccountingService } from "../accounting/accounting.service";
import {
  RECEIVABLE_ACCOUNT_CODE,
  REVENUE_ACCOUNT_CODE,
} from "../ledger.constants";
import { PrismaService } from "../prisma/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import {
  STORAGE_SERVICE,
  type StorageService,
} from "../storage/storage.interface";
import { QuotaService } from "../quota/quota.service";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { InvoicePdfQueueService } from "./invoice-pdf.queue";
import { buildInvoicePdfModelFromIds } from "./invoice-pdf.build";
import { renderInvoicePdf } from "./invoice-pdf.render";
import { MailService } from "../mail/mail.service";
import { parseIsoDateOnly } from "../reporting/reporting-period.util";
import { createInvoicePaymentMirrorLine } from "../banking/banking-registry.helper";
import { CashOrderService } from "../kassa/cash-order.service";

function d(v: Decimal | null | undefined): Decimal {
  return v ?? new Decimal(0);
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly pdfQueue: InvoicePdfQueueService,
    private readonly inventory: InventoryService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly quota: QuotaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly cashOrders: CashOrderService,
  ) {}

  async list(organizationId: string) {
    const rows = await this.prisma.invoice.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        counterparty: { select: { id: true, name: true, taxId: true } },
        payments: { select: { amount: true } },
        _count: { select: { items: true } },
      },
    });
    return rows.map((inv) => {
      const paidTotal = inv.payments.reduce(
        (s, p) => s.add(p.amount),
        new Decimal(0),
      );
      const remaining = inv.totalAmount.sub(paidTotal);
      const { payments, ...rest } = inv;
      return {
        ...rest,
        paidTotal: paidTotal.toFixed(4),
        remaining: remaining.toFixed(4),
      };
    });
  }

  async getOne(organizationId: string, id: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, organizationId },
      include: {
        counterparty: true,
        items: { include: { product: true } },
        payments: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!inv) throw new NotFoundException("Invoice not found");
    const signatureLogs = await this.prisma.digitalSignatureLog.findMany({
      where: { organizationId, documentId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const paidTotal = inv.payments.reduce(
      (s, p) => s.add(p.amount),
      new Decimal(0),
    );
    const remaining = inv.totalAmount.sub(paidTotal);
    return {
      ...inv,
      paidTotal: paidTotal.toFixed(4),
      remaining: remaining.toFixed(4),
      signatureLogs,
    };
  }

  async enqueueInvoicePdf(organizationId: string, invoiceId: string) {
    await this.pdfQueue.enqueue({ invoiceId, organizationId });
  }

  async create(organizationId: string, dto: CreateInvoiceDto) {
    const cp = await this.prisma.counterparty.findFirst({
      where: { id: dto.counterpartyId, organizationId },
    });
    if (!cp) throw new NotFoundException("Counterparty not found");

    if (dto.warehouseId) {
      const wh = await this.prisma.warehouse.findFirst({
        where: { id: dto.warehouseId, organizationId },
      });
      if (!wh) throw new NotFoundException("Warehouse not found");
    }

    const debitAccountCode = dto.debitAccountCode ?? "101";

    const { items: builtItems, total } = await this.buildItems(organizationId, dto.items);

    const warehouseId =
      dto.warehouseId ??
      (await this.inventory.resolveDefaultWarehouseId(organizationId));

    const number = await this.nextInvoiceNumber(organizationId);

    await this.quota.assertInvoiceMonthlyQuota(organizationId);

    const invoice = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const inv = await tx.invoice.create({
        data: {
          organizationId,
          number,
          status: InvoiceStatus.DRAFT,
          dueDate: new Date(dto.dueDate),
          counterpartyId: dto.counterpartyId,
          debitAccountCode,
          totalAmount: total,
          currency: "AZN",
          warehouseId: warehouseId ?? null,
        },
      });
      for (const row of builtItems) {
        await tx.invoiceItem.create({
          data: {
            organizationId,
            invoiceId: inv.id,
            productId: row.productId,
            description: row.description,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            vatRate: row.vatRate,
            lineTotal: row.lineTotal,
          },
        });
      }
      return inv;
    });

    await this.pdfQueue.enqueue({ invoiceId: invoice.id, organizationId });

    const full = await this.getOne(organizationId, invoice.id);
    const stockWarnings = await this.inventory.checkSaleAvailability(
      organizationId,
      warehouseId,
      builtItems.map((r) => ({
        productId: r.productId,
        quantity: r.quantity,
      })),
    );
    return { ...full, stockWarnings };
  }

  /**
   * SENT: Дт 211 — Кт 601 (+ склад). PAID: при необходимости то же, затем оплата остатка целиком.
   */
  async updateStatus(
    organizationId: string,
    id: string,
    status: InvoiceStatus,
    role: UserRole,
  ) {
    if (status === InvoiceStatus.PARTIALLY_PAID) {
      throw new BadRequestException(
        "Статус PARTIALLY_PAID выставляется автоматически при частичной оплате",
      );
    }

    const head = await this.prisma.invoice.findFirst({
      where: { id, organizationId },
      select: { status: true },
    });
    if (!head) throw new NotFoundException("Invoice not found");
    assertUserMayMutateInvoiceInPaidStatus(role, head.status);

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.invoice.findFirst({
        where: { id, organizationId },
        include: {
          payments: true,
          counterparty: { select: { taxId: true } },
        },
      });
      if (!existing) throw new NotFoundException("Invoice not found");

      if (existing.status === InvoiceStatus.CANCELLED) {
        throw new BadRequestException("Cancelled invoice cannot change status");
      }
      if (existing.status === InvoiceStatus.LOCKED_BY_SIGNATURE) {
        throw new BadRequestException(
          "Invoice is locked by digital signature and cannot be changed",
        );
      }

      const paidSum0 = this.sumPayments(existing.payments);
      if (status === InvoiceStatus.SENT && paidSum0.gt(0)) {
        throw new BadRequestException(
          "Инвойс уже имеет оплаты — используйте частичную оплату или доведите до PAID",
        );
      }

      if (status === InvoiceStatus.SENT) {
        if (!existing.revenueRecognized) {
          await this.postRevenueRecognition(tx, organizationId, existing);
          await tx.invoice.update({
            where: { id: existing.id },
            data: {
              status: InvoiceStatus.SENT,
              revenueRecognized: true,
              recognizedAt: existing.recognizedAt ?? new Date(),
            },
          });
        } else {
          await tx.invoice.update({
            where: { id: existing.id },
            data: { status: InvoiceStatus.SENT },
          });
        }
        return;
      }

      if (status === InvoiceStatus.PAID) {
        let recognizedAt = existing.recognizedAt;
        if (!existing.revenueRecognized) {
          await this.postRevenueRecognition(tx, organizationId, existing);
          recognizedAt = recognizedAt ?? new Date();
        }
        const remaining = await this.remainingForInvoice(
          tx,
          existing.id,
          existing.totalAmount,
        );
        if (remaining.gt(0)) {
          await this.applyPaymentInTransaction(
            tx,
            organizationId,
            {
              id: existing.id,
              number: existing.number,
              totalAmount: existing.totalAmount,
              debitAccountCode: existing.debitAccountCode,
              counterpartyId: existing.counterpartyId,
              currency: existing.currency,
              counterpartyTaxId: existing.counterparty?.taxId ?? null,
            },
            remaining,
            new Date(),
            existing.debitAccountCode,
          );
        }
        const refreshed = await tx.invoice.findFirstOrThrow({
          where: { id: existing.id },
          include: { payments: true },
        });
        const paidSum = this.sumPayments(refreshed.payments);
        const { nextStatus, paymentReceived } = this.derivePaymentState(
          refreshed.totalAmount,
          paidSum,
          refreshed.status,
        );
        await tx.invoice.update({
          where: { id: existing.id },
          data: {
            status: nextStatus,
            revenueRecognized: true,
            recognizedAt: recognizedAt ?? undefined,
            paymentReceived,
          },
        });
        return;
      }

      throw new BadRequestException(
        "Поддерживаются только переходы в SENT или PAID",
      );
    });

    return this.getOne(organizationId, id);
  }

  /**
   * Частичная (или полная) оплата отдельной суммой.
   */
  async recordPayment(
    organizationId: string,
    invoiceId: string,
    params: {
      amount: number;
      paymentDate?: string;
      debitAccountCode?: string;
    },
    role: UserRole,
  ) {
    const amount = new Decimal(params.amount);
    if (amount.lte(0)) {
      throw new BadRequestException("amount must be positive");
    }

    let payDate: Date;
    try {
      payDate = params.paymentDate?.trim()
        ? parseIsoDateOnly(params.paymentDate)
        : new Date();
    } catch {
      throw new BadRequestException("Invalid paymentDate (expected YYYY-MM-DD)");
    }

    const head = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
      select: { status: true },
    });
    if (!head) throw new NotFoundException("Invoice not found");
    assertUserMayMutateInvoiceInPaidStatus(role, head.status);

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.invoice.findFirst({
        where: { id: invoiceId, organizationId },
        include: {
          payments: true,
          counterparty: { select: { taxId: true } },
        },
      });
      if (!existing) throw new NotFoundException("Invoice not found");
      if (existing.status === InvoiceStatus.CANCELLED) {
        throw new BadRequestException("Cancelled invoice cannot be paid");
      }
      if (existing.status === InvoiceStatus.LOCKED_BY_SIGNATURE) {
        throw new BadRequestException(
          "Invoice is locked by digital signature and cannot be paid",
        );
      }
      if (!existing.revenueRecognized) {
        throw new BadRequestException(
          "Сначала отметьте отгрузку (SENT) или полную оплату через статус",
        );
      }

      const remaining = await this.remainingForInvoice(
        tx,
        existing.id,
        existing.totalAmount,
      );
      if (amount.gt(remaining)) {
        throw new BadRequestException(
          `Сумма превышает остаток ${remaining.toFixed(4)}`,
        );
      }

      const debitCode =
        params.debitAccountCode?.trim() || existing.debitAccountCode;

      await this.applyPaymentInTransaction(
        tx,
        organizationId,
        {
          id: existing.id,
          number: existing.number,
          totalAmount: existing.totalAmount,
          debitAccountCode: debitCode,
          counterpartyId: existing.counterpartyId,
          currency: existing.currency,
          counterpartyTaxId: existing.counterparty?.taxId ?? null,
        },
        amount,
        payDate,
        debitCode,
      );

      const refreshed = await tx.invoice.findFirstOrThrow({
        where: { id: existing.id },
        include: { payments: true },
      });
      const paidSum = this.sumPayments(refreshed.payments);
      const { nextStatus, paymentReceived } = this.derivePaymentState(
        refreshed.totalAmount,
        paidSum,
        refreshed.status,
      );

      await tx.invoice.update({
        where: { id: existing.id },
        data: {
          status: nextStatus,
          paymentReceived,
        },
      });
    });

    return this.getOne(organizationId, invoiceId);
  }

  /**
   * Для банковского match: начисление (если нужно) + оплата на сумму строки выписки.
   */
  async applyBankPaymentInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    invoiceId: string,
    lineAmount: Decimal,
    valueDate: Date,
  ): Promise<{
    transactionId: string | null;
    newStatus: InvoiceStatus;
    paymentReceived: boolean;
  }> {
    const existing = await tx.invoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: {
        payments: true,
        counterparty: { select: { taxId: true } },
      },
    });
    if (!existing) throw new NotFoundException("Invoice not found");

    if (existing.status === InvoiceStatus.LOCKED_BY_SIGNATURE) {
      throw new BadRequestException(
        "Invoice is locked by digital signature",
      );
    }

    if (!existing.revenueRecognized) {
      await this.postRevenueRecognition(tx, organizationId, existing);
      await tx.invoice.update({
        where: { id: existing.id },
        data: {
          revenueRecognized: true,
          recognizedAt: existing.recognizedAt ?? new Date(),
          status: InvoiceStatus.SENT,
        },
      });
    }

    const inv = await tx.invoice.findFirstOrThrow({
      where: { id: invoiceId },
      include: {
        payments: true,
        counterparty: { select: { taxId: true } },
      },
    });

    const remaining = await this.remainingForInvoice(
      tx,
      inv.id,
      inv.totalAmount,
    );
    if (lineAmount.gt(remaining)) {
      throw new BadRequestException(
        `Сумма выписки больше остатка по счёту (${remaining.toFixed(4)})`,
      );
    }

    const { transactionId } = await this.applyPaymentInTransaction(
      tx,
      organizationId,
      {
        id: inv.id,
        number: inv.number,
        totalAmount: inv.totalAmount,
        debitAccountCode: inv.debitAccountCode,
        counterpartyId: inv.counterpartyId,
        currency: inv.currency,
        counterpartyTaxId: inv.counterparty?.taxId ?? null,
      },
      lineAmount,
      valueDate,
      inv.debitAccountCode,
      { skipRegistryMirror: true },
    );

    const refreshed = await tx.invoice.findFirstOrThrow({
      where: { id: invoiceId },
      include: { payments: true },
    });
    const paidSum = this.sumPayments(refreshed.payments);
    const { nextStatus, paymentReceived } = this.derivePaymentState(
      refreshed.totalAmount,
      paidSum,
      refreshed.status,
    );

    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: nextStatus, paymentReceived },
    });

    return {
      transactionId,
      newStatus: nextStatus,
      paymentReceived,
    };
  }

  private sumPayments(
    payments: Array<{ amount: Decimal }>,
  ): Decimal {
    return payments.reduce((s, p) => s.add(p.amount), new Decimal(0));
  }

  private async remainingForInvoice(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    totalAmount: Decimal,
  ): Promise<Decimal> {
    const agg = await tx.invoicePayment.aggregate({
      where: { invoiceId },
      _sum: { amount: true },
    });
    const paid = d(agg._sum.amount);
    return totalAmount.sub(paid);
  }

  private derivePaymentState(
    total: Decimal,
    paidSum: Decimal,
    currentStatus: InvoiceStatus,
  ): { nextStatus: InvoiceStatus; paymentReceived: boolean } {
    if (currentStatus === InvoiceStatus.LOCKED_BY_SIGNATURE) {
      return {
        nextStatus: InvoiceStatus.LOCKED_BY_SIGNATURE,
        paymentReceived: paidSum.gte(total),
      };
    }
    if (paidSum.gte(total)) {
      return { nextStatus: InvoiceStatus.PAID, paymentReceived: true };
    }
    if (paidSum.gt(0)) {
      return {
        nextStatus: InvoiceStatus.PARTIALLY_PAID,
        paymentReceived: false,
      };
    }
    if (currentStatus === InvoiceStatus.DRAFT) {
      return { nextStatus: InvoiceStatus.DRAFT, paymentReceived: false };
    }
    return { nextStatus: InvoiceStatus.SENT, paymentReceived: false };
  }

  private async applyPaymentInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    inv: {
      id: string;
      number: string;
      totalAmount: Decimal;
      debitAccountCode: string;
      counterpartyId: string;
      currency: string;
      counterpartyTaxId?: string | null;
    },
    amount: Decimal,
    paymentDate: Date,
    debitAccountCode: string,
    options?: { skipRegistryMirror?: boolean },
  ): Promise<{ transactionId: string }> {
    const { transactionId } = await this.accounting.postJournalInTransaction(tx, {
      organizationId,
      date: paymentDate,
      reference: inv.number,
      description: `Оплата по ${inv.number} (Дт ${debitAccountCode} Кт ${RECEIVABLE_ACCOUNT_CODE}), ${amount.toString()}`,
      lines: [
        {
          accountCode: debitAccountCode,
          debit: amount.toString(),
          credit: 0,
        },
        {
          accountCode: RECEIVABLE_ACCOUNT_CODE,
          debit: 0,
          credit: amount.toString(),
        },
      ],
    });

    const payment = await tx.invoicePayment.create({
      data: {
        organizationId,
        invoiceId: inv.id,
        amount,
        date: paymentDate,
        transactionId,
      },
    });

    if (!options?.skipRegistryMirror) {
      await createInvoicePaymentMirrorLine(tx, organizationId, {
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        amount,
        valueDate: paymentDate,
        counterpartyTaxId: inv.counterpartyTaxId ?? null,
        debitAccountCode,
        paymentId: payment.id,
      });
    }

    await this.cashOrders.createAutoFromInvoicePayment(tx, organizationId, {
      invoiceId: inv.id,
      invoiceNumber: inv.number,
      counterpartyId: inv.counterpartyId,
      currency: inv.currency,
      amount,
      valueDate: paymentDate,
      debitAccountCode,
      paymentId: payment.id,
      transactionId,
    });

    return { transactionId };
  }

  async sendInvoiceEmail(organizationId: string, id: string, role: UserRole) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, organizationId },
      include: {
        counterparty: true,
        items: { include: { product: true } },
      },
    });
    if (!inv) throw new NotFoundException("Invoice not found");
    assertUserMayMutateInvoiceInPaidStatus(role, inv.status);

    const email = inv.counterparty.email?.trim();
    if (!email) {
      throw new BadRequestException(
        "У контрагента не указан email (counterparty.email)",
      );
    }

    const key = `orgs/${organizationId}/invoices/${id}.pdf`;
    let pdf: Buffer;
    try {
      pdf = await this.storage.getObject(key);
    } catch {
      const model = await buildInvoicePdfModelFromIds(
        this.prisma,
        this.config,
        organizationId,
        id,
      );
      if (!model) throw new NotFoundException("Invoice not found");
      pdf = await renderInvoicePdf(model);
    }

    await this.mail.sendMail({
      to: email,
      subject: `Invoice ${inv.number}`,
      text: `Счёт ${inv.number} во вложении.`,
      attachments: [
        {
          filename: `${inv.number.replace(/[^\w.-]+/g, "_")}.pdf`,
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });

    return { ok: true, sentTo: email };
  }

  private async postRevenueRecognition(
    tx: Prisma.TransactionClient,
    organizationId: string,
    inv: { id: string; number: string; totalAmount: Decimal },
  ) {
    await this.accounting.postJournalInTransaction(tx, {
      organizationId,
      date: new Date(),
      reference: inv.number,
      description: `Отгрузка / выручка по ${inv.number} (Дт ${RECEIVABLE_ACCOUNT_CODE} Кт ${REVENUE_ACCOUNT_CODE})`,
      lines: [
        {
          accountCode: RECEIVABLE_ACCOUNT_CODE,
          debit: inv.totalAmount.toString(),
          credit: 0,
        },
        {
          accountCode: REVENUE_ACCOUNT_CODE,
          debit: 0,
          credit: inv.totalAmount.toString(),
        },
      ],
    });
    await this.inventory.postSaleInventoryInTransaction(
      tx,
      organizationId,
      inv.id,
    );
  }

  private async buildItems(
    organizationId: string,
    items: CreateInvoiceDto["items"],
  ): Promise<{
    items: Array<{
      productId: string | null;
      description: string | null;
      quantity: Decimal;
      unitPrice: Decimal;
      vatRate: Decimal;
      lineTotal: Decimal;
    }>;
    total: Decimal;
  }> {
    const out: Array<{
      productId: string | null;
      description: string | null;
      quantity: Decimal;
      unitPrice: Decimal;
      vatRate: Decimal;
      lineTotal: Decimal;
    }> = [];
    let total = new Decimal(0);

    for (const row of items) {
      let productId: string | null = null;
      let description: string | null = row.description ?? null;
      let unitPrice = new Decimal(row.unitPrice);
      let vatRate = new Decimal(row.vatRate);

      if (row.productId) {
        const p = await this.prisma.product.findFirst({
          where: { id: row.productId, organizationId },
        });
        if (!p) throw new NotFoundException(`Product ${row.productId} not found`);
        productId = p.id;
        unitPrice = p.price;
        vatRate = p.vatRate;
        description = description ?? p.name;
      }

      const qty = new Decimal(row.quantity);
      const net = qty.mul(unitPrice);
      const vatAmt = net.mul(vatRate).div(100);
      const lineTotal = net.add(vatAmt);
      total = total.add(lineTotal);
      out.push({
        productId,
        description,
        quantity: qty,
        unitPrice,
        vatRate,
        lineTotal,
      });
    }

    return { items: out, total };
  }

  private async nextInvoiceNumber(organizationId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const count = await this.prisma.invoice.count({
      where: { organizationId, number: { startsWith: prefix } },
    });
    const seq = count + 1;
    return `${prefix}${String(seq).padStart(4, "0")}`;
  }
}
