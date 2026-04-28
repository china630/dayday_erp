import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  InvoiceStatus,
  LedgerType,
  Prisma,
  UserRole,
} from "@dayday/database";
import { assertMayPostManualJournal } from "../auth/policies/invoice-finance.policy";
import { AccountingService } from "./accounting.service";
import {
  PAYABLE_SUPPLIERS_ACCOUNT_CODE,
  RECEIVABLE_ACCOUNT_CODE,
  VAT_INPUT_ACCOUNT_CODE,
  VAT_OUTPUT_ACCOUNT_CODE,
} from "../ledger.constants";
import { parseOrgIsVatPayer } from "../common/org-vat-payer.util";
import { PrismaService } from "../prisma/prisma.service";

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

function d(v: Prisma.Decimal | null | undefined): Prisma.Decimal {
  return v ?? new Prisma.Decimal(0);
}

@Injectable()
export class NettingService {
  private readonly logger = new Logger(NettingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  /** Непогашенная дебиторка по счетам с выручкой (как в accountsReceivable). */
  private async receivableForCounterparty(
    organizationId: string,
    counterpartyId: string,
  ): Promise<Prisma.Decimal> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        counterpartyId,
        revenueRecognized: true,
        status: { not: InvoiceStatus.CANCELLED },
      },
      include: { payments: { select: { amount: true } } },
    });
    let sum = new Prisma.Decimal(0);
    for (const inv of invoices) {
      const paid = inv.payments.reduce(
        (s, p) => s.add(p.amount),
        new Prisma.Decimal(0),
      );
      const bal = inv.totalAmount.sub(paid);
      if (bal.gt(0)) sum = sum.add(bal);
    }
    return sum;
  }

  /** Кредиторка 531 по проводкам, привязанным к контрагенту в транзакции. */
  private async payable531ForCounterparty(
    organizationId: string,
    counterpartyId: string,
    ledgerType: LedgerType,
  ): Promise<Decimal> {
    const acc = await this.prisma.account.findFirst({
      where: {
        organizationId,
        ledgerType,
        code: PAYABLE_SUPPLIERS_ACCOUNT_CODE,
      },
    });
    if (!acc) return new Decimal(0);

    const entries = await this.prisma.journalEntry.findMany({
      where: {
        organizationId,
        ledgerType,
        accountId: acc.id,
        transaction: { counterpartyId },
      },
      select: { debit: true, credit: true },
    });
    let net = new Decimal(0);
    for (const e of entries) {
      net = net.add(d(e.credit).sub(d(e.debit)));
    }
    return net.gt(0) ? net : new Decimal(0);
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

  /**
   * Без дополнительных проводок: строки оплат ссылаются на транзакцию взаимозачёта (уже есть Кт 211).
   * Нужно для согласованности «Дебиторки» и старения с ГК.
   */
  private async allocateNettingToInvoicePayments(
    tx: Prisma.TransactionClient,
    organizationId: string,
    counterpartyId: string,
    nettingTransactionId: string,
    totalAmount: Decimal,
    paymentDate: Date,
  ): Promise<void> {
    let left = totalAmount;
    if (left.lte(0)) return;

    const invoices = await tx.invoice.findMany({
      where: {
        organizationId,
        counterpartyId,
        revenueRecognized: true,
        status: { not: InvoiceStatus.CANCELLED },
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      include: { payments: { select: { amount: true } } },
    });

    for (const inv of invoices) {
      if (left.lte(0)) break;
      const paid = inv.payments.reduce(
        (s, p) => s.add(p.amount),
        new Decimal(0),
      );
      const rem = inv.totalAmount.sub(paid);
      if (rem.lte(0)) continue;
      const alloc = Decimal.min(rem, left);
      await tx.invoicePayment.create({
        data: {
          organizationId,
          invoiceId: inv.id,
          amount: alloc,
          date: paymentDate,
          transactionId: nettingTransactionId,
        },
      });
      left = left.sub(alloc);

      const refreshed = await tx.invoice.findFirstOrThrow({
        where: { id: inv.id },
        include: { payments: true },
      });
      const paidSum = refreshed.payments.reduce(
        (s, p) => s.add(p.amount),
        new Decimal(0),
      );
      const { nextStatus, paymentReceived } = this.derivePaymentState(
        refreshed.totalAmount,
        paidSum,
        refreshed.status,
      );
      await tx.invoice.update({
        where: { id: inv.id },
        data: { status: nextStatus, paymentReceived },
      });
    }

    if (left.gt(new Decimal("0.0001"))) {
      throw new BadRequestException(
        `Нераспределённый остаток взаимозачёта ${left.toFixed(4)} AZN: проверьте остатки по счетам контрагента`,
      );
    }
  }

  async preview(
    organizationId: string,
    counterpartyId: string,
    ledgerType: LedgerType = LedgerType.NAS,
  ) {
    const cp = await this.prisma.counterparty.findFirst({
      where: { id: counterpartyId, organizationId },
    });
    if (!cp) throw new NotFoundException("Контрагент не найден");

    const receivable = await this.receivableForCounterparty(
      organizationId,
      counterpartyId,
    );
    const payable = await this.payable531ForCounterparty(
      organizationId,
      counterpartyId,
      ledgerType,
    );
    const maxNet = Decimal.min(receivable, payable);
    const canNet = maxNet.gt(0);
    return {
      counterpartyId: cp.id,
      counterpartyName: cp.name,
      receivable: receivable.toFixed(4),
      payable531: payable.toFixed(4),
      suggestedAmount: maxNet.toFixed(4),
      canNet,
    };
  }

  async createNetting(
    organizationId: string,
    counterpartyId: string,
    amountRaw: number,
    ledgerType: LedgerType = LedgerType.NAS,
    actingUserRole?: UserRole,
    audit?: { userId?: string; previewSuggestedAmount?: number },
  ) {
    if (actingUserRole !== undefined) {
      assertMayPostManualJournal(actingUserRole);
    }
    const amount = new Decimal(amountRaw);
    if (amount.lte(0)) {
      throw new BadRequestException("Сумма взаимозачёта должна быть больше 0");
    }

    if (
      audit?.previewSuggestedAmount != null &&
      Number.isFinite(audit.previewSuggestedAmount)
    ) {
      const suggested = new Decimal(audit.previewSuggestedAmount);
      if (!amount.eq(suggested)) {
        this.logger.log(
          `Netting amount manually adjusted: org=${organizationId} counterpartyId=${counterpartyId} userId=${audit.userId ?? "unknown"} suggested=${suggested.toFixed(4)} posted=${amount.toFixed(4)}`,
        );
      }
    }

    const cp = await this.prisma.counterparty.findFirst({
      where: { id: counterpartyId, organizationId },
    });
    if (!cp) throw new NotFoundException("Контрагент не найден");

    const receivable = await this.receivableForCounterparty(
      organizationId,
      counterpartyId,
    );
    const payable = await this.payable531ForCounterparty(
      organizationId,
      counterpartyId,
      ledgerType,
    );
    const maxNet = Decimal.min(receivable, payable);
    if (amount.gt(maxNet)) {
      throw new BadRequestException(
        `Сумма превышает допустимый взаимозачёт (макс. ${maxNet.toFixed(4)} AZN: минимум из дебиторки и кредиторки 531)`,
      );
    }

    const ar = await this.prisma.account.findFirst({
      where: {
        organizationId,
        ledgerType,
        code: RECEIVABLE_ACCOUNT_CODE,
      },
    });
    const ap = await this.prisma.account.findFirst({
      where: {
        organizationId,
        ledgerType,
        code: PAYABLE_SUPPLIERS_ACCOUNT_CODE,
      },
    });
    if (!ar || !ap) {
      throw new BadRequestException("Счета 211 или 531 не найдены в плане счетов");
    }

    const orgRow = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const orgIsVatPayer = parseOrgIsVatPayer(orgRow?.settings);
    const cpIsVatPayer = cp.isVatPayer === true;
    const vatOnNetting = orgIsVatPayer && cpIsVatPayer;
    /** Доля НДС 18% в сумме с НДС (НК АР, упрощённо для взаимозачёта). */
    const vatPortion = vatOnNetting
      ? amount.mul(new Decimal(18)).div(new Decimal(118))
      : new Decimal(0);
    const vatStr = vatPortion.toFixed(4);

    const acc241 = vatOnNetting
      ? await this.prisma.account.findFirst({
          where: {
            organizationId,
            ledgerType,
            code: VAT_INPUT_ACCOUNT_CODE,
          },
        })
      : null;
    const acc541 = vatOnNetting
      ? await this.prisma.account.findFirst({
          where: {
            organizationId,
            ledgerType,
            code: VAT_OUTPUT_ACCOUNT_CODE,
          },
        })
      : null;
    const canPostVat = Boolean(acc241 && acc541);

    const payDate = new Date();

    return this.prisma.$transaction(async (tx) => {
      const baseLines = [
        {
          accountCode: PAYABLE_SUPPLIERS_ACCOUNT_CODE,
          debit: amount.toString(),
          credit: 0,
        },
        {
          accountCode: RECEIVABLE_ACCOUNT_CODE,
          debit: 0,
          credit: amount.toString(),
        },
      ];
      const vatLines =
        vatOnNetting && canPostVat
          ? [
              {
                accountCode: VAT_INPUT_ACCOUNT_CODE,
                debit: vatStr,
                credit: 0,
              },
              {
                accountCode: VAT_OUTPUT_ACCOUNT_CODE,
                debit: 0,
                credit: vatStr,
              },
            ]
          : [];

      const { transactionId } = await this.accounting.postJournalInTransaction(tx, {
        organizationId,
        date: payDate,
        reference: `NET-${counterpartyId.slice(0, 8)}`,
        description: `Взаимозачёт: ${cp.name}`,
        isFinal: true,
        counterpartyId,
        lines: [...baseLines, ...vatLines],
      });

      await this.allocateNettingToInvoicePayments(
        tx,
        organizationId,
        counterpartyId,
        transactionId,
        amount,
        payDate,
      );

      return {
        transactionId,
        amount: amount.toFixed(4),
        counterpartyName: cp.name,
        suggestVatInvoice: vatOnNetting,
        vatPosted: vatOnNetting && canPostVat,
        vatAmount: vatOnNetting ? vatStr : null,
        vatSkippedReason:
          vatOnNetting && !canPostVat
            ? "Счета 241/541 не найдены в плане счетов — создайте e-qaimə вручную."
            : null,
      };
    });
  }
}
