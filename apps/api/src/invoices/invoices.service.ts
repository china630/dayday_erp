import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InvoiceStatus, Prisma, type UserRole } from "@dayday/database";
import { assertUserMayMutateInvoiceInPaidStatus } from "../auth/policies/invoice-finance.policy";
import { AccountingService } from "../accounting/accounting.service";
import {
  FX_GAIN_ACCOUNT_CODE,
  FX_LOSS_ACCOUNT_CODE,
  RECEIVABLE_ACCOUNT_CODE,
  REVENUE_ACCOUNT_CODE,
} from "../ledger.constants";
import { PrismaService } from "../prisma/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import {
  STORAGE_SERVICE,
  type StorageService,
} from "../storage/storage.interface";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { AllocatePaymentDto } from "./dto/allocate-payment.dto";
import { InvoicePdfQueueService } from "./invoice-pdf.queue";
import {
  buildInvoicePdfModelByInvoiceIdPublic,
  buildInvoicePdfModelFromIds,
} from "./invoice-pdf.build";
import { generateInvoicePublicToken } from "./invoice-portal-token";
import { renderInvoicePdf } from "./invoice-pdf.render";
import { MailService } from "../mail/mail.service";
import { parseIsoDateOnly } from "../reporting/reporting-period.util";
import { createInvoicePaymentMirrorLine } from "../banking/banking-registry.helper";
import { CashOrderService } from "../kassa/cash-order.service";

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;
const PUBLIC_INVOICE_TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{32,128}$/i;
const MULTI_CURRENCY_ROUNDING_TOLERANCE = new Decimal("0.01");

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly pdfQueue: InvoicePdfQueueService,
    private readonly inventory: InventoryService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly cashOrders: CashOrderService,
  ) {}

  async list(organizationId: string) {
    const rows = await this.prisma.invoice.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        counterparty: { select: { id: true, name: true, taxId: true } },
        _count: { select: { items: true } },
      },
    });
    return rows.map((inv) => {
      const paidTotal = inv.paidAmount ?? new Decimal(0);
      const remaining = inv.totalAmount.sub(paidTotal);
      const { ...rest } = inv;
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
    const paidTotal = inv.paidAmount ?? new Decimal(0);
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
    const currency = dto.currency ?? "AZN";
    const vatInclusive = !!dto.vatInclusive;

    const { items: builtItems, total } = await this.buildItems(
      organizationId,
      dto.items,
      { vatInclusive },
    );

    const warehouseId =
      dto.warehouseId ??
      (await this.inventory.resolveDefaultWarehouseId(organizationId));

    const number = await this.nextInvoiceNumber(organizationId);

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
          currency,
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

      const paidSum0 = existing.paidAmount ?? new Decimal(0);
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
        const remaining = this.remainingForInvoice(
          existing.totalAmount,
          existing.paidAmount ?? new Decimal(0),
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
          select: { totalAmount: true, paidAmount: true, status: true },
        });
        const paidSum = refreshed.paidAmount ?? new Decimal(0);
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

      const remaining = this.remainingForInvoice(
        existing.totalAmount,
        existing.paidAmount ?? new Decimal(0),
      );
      let payableAmount = amount;
      let roundingDifference = new Decimal(0);
      if (amount.gt(remaining)) {
        const over = amount.sub(remaining);
        const canRound =
          existing.currency !== "AZN" &&
          over.lte(MULTI_CURRENCY_ROUNDING_TOLERANCE);
        if (canRound) {
          payableAmount = remaining;
          roundingDifference = over;
        } else {
          throw new BadRequestException(
            `Сумма превышает остаток ${remaining.toFixed(4)}`,
          );
        }
      }
      if (payableAmount.lte(0)) {
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
        payableAmount,
        payDate,
        debitCode,
        { roundingDifference },
      );

      const refreshed = await tx.invoice.findFirstOrThrow({
        where: { id: existing.id },
        select: { totalAmount: true, paidAmount: true, status: true },
      });
      const paidSum = refreshed.paidAmount ?? new Decimal(0);
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
   * Один платёж -> несколько инвойсов контрагента (FIFO по dueDate/recognizedAt/createdAt).
   */
  async allocatePaymentAcrossInvoices(
    organizationId: string,
    dto: AllocatePaymentDto,
    role: UserRole,
  ) {
    const amount = new Decimal(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException("amount must be positive");
    }

    let payDate: Date;
    try {
      payDate = dto.paymentDate?.trim()
        ? parseIsoDateOnly(dto.paymentDate)
        : new Date();
    } catch {
      throw new BadRequestException("Invalid paymentDate (expected YYYY-MM-DD)");
    }
    const debitCode = dto.debitAccountCode?.trim() || "221";

    return this.prisma.$transaction(async (tx) => {
      const candidateInvoices = await tx.invoice.findMany({
        where: {
          organizationId,
          counterpartyId: dto.counterpartyId,
          revenueRecognized: true,
          status: {
            in: [
              InvoiceStatus.SENT,
              InvoiceStatus.PARTIALLY_PAID,
              InvoiceStatus.PAID,
            ],
          },
        },
        orderBy: [
          { dueDate: "asc" },
          { recognizedAt: "asc" },
          { createdAt: "asc" },
        ],
        include: { counterparty: { select: { taxId: true } } },
      });
      if (candidateInvoices.length === 0) {
        throw new BadRequestException(
          "No receivable invoices found for allocation",
        );
      }

      const buckets: Array<{
        invoiceId: string;
        invoiceNumber: string;
        allocatedAmount: Decimal;
      }> = [];
      let remainingPayment = amount;

      for (const inv of candidateInvoices) {
        if (remainingPayment.lte(0)) break;
        const paidAmount = inv.paidAmount ?? new Decimal(0);
        const openAmount = inv.totalAmount.sub(paidAmount);
        if (openAmount.lte(0)) continue;
        const alloc = openAmount.lt(remainingPayment) ? openAmount : remainingPayment;
        if (alloc.lte(0)) continue;
        buckets.push({
          invoiceId: inv.id,
          invoiceNumber: inv.number,
          allocatedAmount: alloc,
        });
        remainingPayment = remainingPayment.sub(alloc);
      }
      if (buckets.length === 0) {
        throw new BadRequestException("All candidate invoices are already fully paid");
      }
      const appliedAmount = buckets.reduce(
        (s, x) => s.add(x.allocatedAmount),
        new Decimal(0),
      );

      const reference = `ALLOC-${new Date().getTime()}`;
      const { transactionId } = await this.accounting.postJournalInTransaction(tx, {
        organizationId,
        date: payDate,
        reference,
        description: `Транш оплаты контрагента (${dto.counterpartyId})`,
        lines: [
          { accountCode: debitCode, debit: appliedAmount.toString(), credit: 0 },
          { accountCode: RECEIVABLE_ACCOUNT_CODE, debit: 0, credit: appliedAmount.toString() },
        ],
      });

      const resultAllocations: Array<{
        invoiceId: string;
        invoiceNumber: string;
        allocatedAmount: string;
        statusAfter: InvoiceStatus;
      }> = [];

      for (const b of buckets) {
        const invoice = await tx.invoice.findFirstOrThrow({
          where: { id: b.invoiceId, organizationId },
          select: {
            id: true,
            number: true,
            status: true,
            totalAmount: true,
            paidAmount: true,
          },
        });
        await tx.paymentAllocation.create({
          data: {
            organizationId,
            transactionId,
            invoiceId: invoice.id,
            allocatedAmount: b.allocatedAmount,
            date: payDate,
          },
        });
        await tx.invoicePayment.create({
          data: {
            organizationId,
            invoiceId: invoice.id,
            amount: b.allocatedAmount,
            date: payDate,
            transactionId,
          },
        });
        const afterPaid = (invoice.paidAmount ?? new Decimal(0)).add(
          b.allocatedAmount,
        );
        const { nextStatus, paymentReceived } = this.derivePaymentState(
          invoice.totalAmount,
          afterPaid,
          invoice.status,
        );
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: afterPaid,
            status: nextStatus,
            paymentReceived,
          },
        });
        resultAllocations.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          allocatedAmount: b.allocatedAmount.toFixed(4),
          statusAfter: nextStatus,
        });
      }

      return {
        transactionId,
        paymentAmount: amount.toFixed(4),
        unappliedAmount: remainingPayment.toFixed(4),
        allocations: resultAllocations,
      };
    });
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
        counterparty: { select: { taxId: true } },
      },
    });

    const remaining = this.remainingForInvoice(
      inv.totalAmount,
      inv.paidAmount ?? new Decimal(0),
    );
    let payableAmount = lineAmount;
    let roundingDifference = new Decimal(0);
    if (lineAmount.gt(remaining)) {
      const over = lineAmount.sub(remaining);
      const canRound =
        inv.currency !== "AZN" && over.lte(MULTI_CURRENCY_ROUNDING_TOLERANCE);
      if (canRound) {
        payableAmount = remaining;
        roundingDifference = over;
      } else {
        throw new BadRequestException(
          `Сумма выписки больше остатка по счёту (${remaining.toFixed(4)})`,
        );
      }
    }
    if (payableAmount.lte(0)) {
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
      payableAmount,
      valueDate,
      inv.debitAccountCode,
      { skipRegistryMirror: true, roundingDifference },
    );

    const refreshed = await tx.invoice.findFirstOrThrow({
      where: { id: invoiceId },
      select: { totalAmount: true, paidAmount: true, status: true },
    });
    const paidSum = refreshed.paidAmount ?? new Decimal(0);
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

  private remainingForInvoice(totalAmount: Decimal, paidAmount: Decimal): Decimal {
    return totalAmount.sub(paidAmount);
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
    options?: { skipRegistryMirror?: boolean; roundingDifference?: Decimal },
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
    const txAny = tx as any;
    if (txAny.paymentAllocation?.create) {
      await txAny.paymentAllocation.create({
        data: {
          organizationId,
          transactionId,
          invoiceId: inv.id,
          allocatedAmount: amount,
          date: paymentDate,
        },
      });
    }
    if (txAny.invoice?.update) {
      await txAny.invoice.update({
        where: { id: inv.id },
        data: { paidAmount: { increment: amount } },
      });
    }

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

    const rounding = options?.roundingDifference ?? new Decimal(0);
    if (rounding.gt(0)) {
      const fxAccount = FX_GAIN_ACCOUNT_CODE;
      await this.accounting.postJournalInTransaction(tx, {
        organizationId,
        date: paymentDate,
        reference: inv.number,
        description: `Округление мультивалютной оплаты ${inv.number}`,
        lines: [
          {
            accountCode: debitAccountCode,
            debit: rounding.toString(),
            credit: 0,
          },
          {
            accountCode: fxAccount,
            debit: 0,
            credit: rounding.toString(),
          },
        ],
      });
    } else if (rounding.lt(0)) {
      const fxLoss = rounding.abs();
      await this.accounting.postJournalInTransaction(tx, {
        organizationId,
        date: paymentDate,
        reference: inv.number,
        description: `Округление мультивалютной оплаты ${inv.number}`,
        lines: [
          {
            accountCode: FX_LOSS_ACCOUNT_CODE,
            debit: fxLoss.toString(),
            credit: 0,
          },
          {
            accountCode: debitAccountCode,
            debit: 0,
            credit: fxLoss.toString(),
          },
        ],
      });
    }

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
    opts?: { vatInclusive?: boolean },
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
    const vatInclusive = !!opts?.vatInclusive;

    for (const row of items) {
      let productId: string | null = null;
      let description: string | null = row.description ?? null;
      let unitPriceInput = new Decimal(row.unitPrice);
      let vatRate = new Decimal(row.vatRate);

      if (row.productId) {
        const p = await this.prisma.product.findFirst({
          where: { id: row.productId, organizationId },
        });
        if (!p) throw new NotFoundException(`Product ${row.productId} not found`);
        productId = p.id;
        unitPriceInput = p.price;
        vatRate = p.vatRate;
        description = description ?? p.name;
      }

      const vr = vatRate.toNumber();
      if (vr !== 0 && vr !== 18) {
        throw new BadRequestException("vatRate must be 0 or 18");
      }

      const qty = new Decimal(row.quantity);
      let unitPriceNet: Decimal;
      let net: Decimal;
      let lineTotal: Decimal;

      if (vatInclusive) {
        const div = new Decimal(1).add(vatRate.div(100));
        unitPriceNet = unitPriceInput.div(div);
        net = qty.mul(unitPriceNet);
        const vatAmt = net.mul(vatRate).div(100);
        lineTotal = net.add(vatAmt);
      } else {
        unitPriceNet = unitPriceInput;
        net = qty.mul(unitPriceNet);
        const vatAmt = net.mul(vatRate).div(100);
        lineTotal = net.add(vatAmt);
      }

      total = total.add(lineTotal);
      out.push({
        productId,
        description,
        quantity: qty,
        unitPrice: unitPriceNet,
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

  private portalTokenSecret(): string {
    return (
      this.config.get<string>("INVOICE_PORTAL_TOKEN_SECRET") ??
      this.config.getOrThrow<string>("JWT_SECRET")
    );
  }

  private portalPublicOrigin(): string {
    const raw =
      this.config.get<string>("INVOICE_PORTAL_PUBLIC_ORIGIN")?.trim() ??
      "https://erp.dayday.az";
    return raw.replace(/\/$/, "");
  }

  /** JWT: выдать или переиспользовать гостевую ссылку на портал счёта. */
  async ensurePortalShareLink(
    organizationId: string,
    invoiceId: string,
  ): Promise<{ url: string; token: string }> {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
      select: { id: true, publicToken: true },
    });
    if (!inv) throw new NotFoundException("Invoice not found");

    if (inv.publicToken) {
      const token = inv.publicToken;
      return {
        token,
        url: `${this.portalPublicOrigin()}/portal/invoice/${encodeURIComponent(token)}`,
      };
    }

    const secret = this.portalTokenSecret();
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = generateInvoicePublicToken(inv.id, secret);
      try {
        await this.prisma.invoice.update({
          where: { id: inv.id },
          data: { publicToken: candidate },
        });
        return {
          token: candidate,
          url: `${this.portalPublicOrigin()}/portal/invoice/${encodeURIComponent(candidate)}`,
        };
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          continue;
        }
        throw e;
      }
    }
    throw new BadRequestException("Could not allocate public token");
  }

  /** Guest: JSON для портала (без JWT). */
  async getPublicInvoiceByToken(publicToken: string) {
    const raw = publicToken?.trim();
    if (!raw || raw.length > 400 || !PUBLIC_INVOICE_TOKEN_RE.test(raw)) {
      throw new NotFoundException();
    }
    const inv = await this.prisma.invoice.findFirst({
      where: { publicToken: raw },
      include: {
        counterparty: true,
        items: { include: { product: true } },
        payments: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] },
        organization: {
          include: { bankAccountsOrg: true },
        },
      },
    });
    if (!inv) throw new NotFoundException();

    const paidTotal = inv.paidAmount ?? new Decimal(0);
    const remaining = inv.totalAmount.sub(paidTotal);
    const paid = remaining.lte(0);
    let localeHint: "az" | "ru" | "en" | null = null;
    const pl = inv.counterparty.portalLocale?.trim().toLowerCase();
    if (pl === "az" || pl === "ru" || pl === "en") {
      localeHint = pl;
    }

    return {
      localeHint,
      organization: {
        name: inv.organization.name,
        taxId: inv.organization.taxId,
        logoUrl: inv.organization.logoUrl,
        legalAddress: inv.organization.legalAddress,
        bankAccounts: inv.organization.bankAccountsOrg.map((b) => ({
          bankName: b.bankName,
          accountNumber: b.accountNumber,
          currency: b.currency,
          iban: b.iban,
          swift: b.swift,
        })),
      },
      counterparty: {
        name: inv.counterparty.name,
        taxId: inv.counterparty.taxId,
      },
      invoice: {
        number: inv.number,
        status: inv.status,
        dueDate: inv.dueDate,
        totalAmount: inv.totalAmount.toFixed(4),
        currency: inv.currency,
        paidTotal: paidTotal.toFixed(4),
        remaining: remaining.toFixed(4),
        paymentStatus: paid ? ("PAID" as const) : ("UNPAID" as const),
        items: inv.items.map((it) => ({
          description: it.description,
          quantity: it.quantity.toFixed(4),
          unitPrice: it.unitPrice.toFixed(4),
          vatRate: it.vatRate.toFixed(2),
          lineTotal: it.lineTotal.toFixed(4),
          productName: it.product?.name ?? null,
          sku: it.product?.sku ?? null,
        })),
      },
    };
  }

  async getPublicInvoicePdfBuffer(publicToken: string): Promise<Buffer> {
    const raw = publicToken?.trim();
    if (!raw || raw.length > 400 || !PUBLIC_INVOICE_TOKEN_RE.test(raw)) {
      throw new NotFoundException();
    }
    const inv = await this.prisma.invoice.findFirst({
      where: { publicToken: raw },
      select: { id: true },
    });
    if (!inv) throw new NotFoundException();
    const model = await buildInvoicePdfModelByInvoiceIdPublic(
      this.prisma,
      this.config,
      inv.id,
    );
    if (!model) throw new NotFoundException();
    return renderInvoicePdf(model);
  }
}
