import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  BankStatementLineType,
  Decimal,
  InvoiceStatus,
  type BankStatementLine,
} from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { InvoicesService } from "../invoices/invoices.service";
import { extractInvoiceNumbersFromText } from "./utils/invoice-numbers-in-text";
import { normalizeVoen } from "./utils/voen";

@Injectable()
export class BankMatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
  ) {}

  /** Кандидаты: инвойсы контрагента с остатком к оплате ≥ суммы строки (VÖEN). */
  async findCandidates(organizationId: string, lineId: string) {
    const line = await this.prisma.bankStatementLine.findFirst({
      where: { id: lineId, organizationId },
      include: { bankStatement: true },
    });
    if (!line) throw new NotFoundException("Bank line not found");

    if (line.type !== "INFLOW") {
      return { line, candidates: [] as const };
    }

    const voen = normalizeVoen(line.counterpartyTaxId);
    if (!voen) {
      return { line, candidates: [] as const };
    }

    const cps = await this.prisma.counterparty.findMany({
      where: { organizationId },
      select: { id: true, taxId: true },
    });
    const cpIds = cps
      .filter((c) => normalizeVoen(c.taxId) === voen)
      .map((c) => c.id);
    if (cpIds.length === 0) {
      return { line, candidates: [] as const };
    }

    const candidates = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        counterpartyId: { in: cpIds },
        status: {
          in: [
            InvoiceStatus.DRAFT,
            InvoiceStatus.SENT,
            InvoiceStatus.PARTIALLY_PAID,
          ],
        },
      },
      include: {
        counterparty: { select: { name: true, taxId: true } },
        payments: { select: { amount: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 50,
    });

    const filtered = candidates.filter((inv) => {
      const invVoen = normalizeVoen(inv.counterparty.taxId);
      if (invVoen !== voen) return false;
      const paid = inv.payments.reduce(
        (s, p) => s.add(p.amount),
        new Decimal(0),
      );
      const remaining = inv.totalAmount.sub(paid);
      return remaining.gte(line.amount) && remaining.gt(0);
    });

    return { line, candidates: filtered };
  }

  /**
   * Подтверждение match: при необходимости начисление + оплата на сумму строки (частично или полностью).
   * Ручное подтверждение — всегда проверка VÖEN.
   */
  async confirmMatch(
    organizationId: string,
    lineId: string,
    invoiceId: string,
  ) {
    return this.confirmMatchInternal(organizationId, lineId, invoiceId, {
      skipVoenCheck: false,
    });
  }

  private async confirmMatchInternal(
    organizationId: string,
    lineId: string,
    invoiceId: string,
    options: { skipVoenCheck: boolean },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const line = await tx.bankStatementLine.findFirst({
        where: { id: lineId, organizationId },
      });
      if (!line) throw new NotFoundException("Bank line not found");
      if (line.isMatched) {
        throw new ConflictException("Line already matched");
      }
      if (line.type !== BankStatementLineType.INFLOW) {
        throw new BadRequestException("Only INFLOW lines can pay invoices");
      }

      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, organizationId },
        include: { counterparty: true },
      });
      if (!invoice) throw new NotFoundException("Invoice not found");

      if (!options.skipVoenCheck) {
        const lineVoen = normalizeVoen(line.counterpartyTaxId);
        const invVoen = normalizeVoen(invoice.counterparty.taxId);
        if (!lineVoen || lineVoen !== invVoen) {
          throw new BadRequestException(
            "VÖEN does not match invoice counterparty",
          );
        }
      }

      if (invoice.status === InvoiceStatus.CANCELLED) {
        throw new BadRequestException("Invoice is cancelled");
      }

      if (invoice.status === InvoiceStatus.LOCKED_BY_SIGNATURE) {
        throw new BadRequestException(
          "Invoice is locked by digital signature",
        );
      }

      if (invoice.status === InvoiceStatus.PAID) {
        await tx.bankStatementLine.update({
          where: { id: lineId },
          data: {
            isMatched: true,
            matchedInvoiceId: invoiceId,
          },
        });
        return {
          matched: true,
          invoiceStatus: InvoiceStatus.PAID,
          ledgerPosted: false,
          reason: "invoice_already_paid",
        };
      }

      const payDate = line.valueDate ?? new Date();

      const { newStatus, paymentReceived, transactionId } =
        await this.invoices.applyBankPaymentInTransaction(
          tx,
          organizationId,
          invoiceId,
          line.amount,
          payDate,
        );

      await tx.bankStatementLine.update({
        where: { id: lineId },
        data: { isMatched: true, matchedInvoiceId: invoiceId },
      });

      return {
        matched: true,
        invoiceStatus: newStatus,
        paymentReceived,
        ledgerPosted: true,
        transactionId,
      };
    });
  }

  private async writeAuditAutoMatch(
    organizationId: string,
    lineId: string,
    invoiceNumber: string,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: null,
        entityType: "BANK_STATEMENT_LINE",
        entityId: lineId,
        action: "AUTO_MATCH_INVOICE",
        changes: {
          message: `Платеж ${lineId} автоматически разнесен на инвойс ${invoiceNumber}`,
          bankLineId: lineId,
          invoiceNumber,
        } as object,
      },
    });
  }

  /**
   * Автосверка по номеру счёта в описании (один уникальный INV-YYYY-… в тексте).
   */
  private async tryAutoMatchByInvoiceNumber(
    organizationId: string,
    line: BankStatementLine,
  ): Promise<{ ok: true; invoiceNumber: string } | { ok: false }> {
    const nums = extractInvoiceNumbersFromText(line.description);
    if (nums.length === 0) return { ok: false };
    if (nums.length > 1) return { ok: false };

    const invoice = await this.prisma.invoice.findFirst({
      where: { organizationId, number: nums[0] },
      select: { id: true, number: true },
    });
    if (!invoice) return { ok: false };

    try {
      await this.confirmMatchInternal(organizationId, line.id, invoice.id, {
        skipVoenCheck: true,
      });
      return { ok: true, invoiceNumber: invoice.number };
    } catch {
      return { ok: false };
    }
  }

  /**
   * Автосверка: сначала номер инвойса в description, иначе ровно один кандидат по VÖEN.
   */
  async tryAutoMatchLine(
    organizationId: string,
    lineId: string,
  ): Promise<{ autoMatched: boolean; reason?: string }> {
    const line = await this.prisma.bankStatementLine.findFirst({
      where: { id: lineId, organizationId },
    });
    if (!line) {
      return { autoMatched: false, reason: "line_not_found" };
    }
    if (line.isMatched) {
      return { autoMatched: false, reason: "already_matched" };
    }
    if (line.type !== BankStatementLineType.INFLOW) {
      return { autoMatched: false, reason: "not_inflow" };
    }

    const byNum = await this.tryAutoMatchByInvoiceNumber(organizationId, line);
    if (byNum.ok) {
      await this.writeAuditAutoMatch(
        organizationId,
        lineId,
        byNum.invoiceNumber,
      );
      return { autoMatched: true };
    }

    const { candidates } = await this.findCandidates(organizationId, lineId);
    if (candidates.length === 0) {
      return { autoMatched: false, reason: "no_candidate" };
    }
    if (candidates.length > 1) {
      return { autoMatched: false, reason: "ambiguous" };
    }
    try {
      await this.confirmMatchInternal(organizationId, lineId, candidates[0].id, {
        skipVoenCheck: false,
      });
      await this.writeAuditAutoMatch(
        organizationId,
        lineId,
        candidates[0].number,
      );
      return { autoMatched: true };
    } catch {
      return { autoMatched: false, reason: "confirm_failed" };
    }
  }
}
