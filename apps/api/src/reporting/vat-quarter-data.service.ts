import { Injectable } from "@nestjs/common";
import {
  Decimal,
  InvoiceStatus,
  StockMovementReason,
} from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";

export function quarterUtcRange(
  year: number,
  quarter: number,
): { from: Date; to: Date; fromStr: string; toStr: string } {
  const q = Math.min(4, Math.max(1, quarter));
  const m0 = (q - 1) * 3;
  const from = new Date(Date.UTC(year, m0, 1, 12, 0, 0, 0));
  const to = new Date(Date.UTC(year, m0 + 3, 0, 12, 0, 0, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from, to, fromStr: iso(from), toStr: iso(to) };
}

export function dateInRangeInclusive(
  isoDate: string,
  fromStr: string,
  toStr: string,
): boolean {
  return isoDate >= fromStr && isoDate <= toStr;
}

export function invoiceEffectiveDateIso(inv: {
  recognizedAt: Date | null;
  createdAt: Date;
}): string {
  const d = inv.recognizedAt ?? inv.createdAt;
  return d.toISOString().slice(0, 10);
}

export type VatQuarterSalesRow = {
  date: string;
  documentNumber: string;
  counterpartyName: string;
  counterpartyVoen: string;
  description: string;
  quantity: number;
  amountWithoutVat: string;
  vatAmount: string;
  amountWithVat: string;
  vatRatePercent: string;
  invoiceId: string;
  invoiceLineId: string;
  productId: string | null;
  productSku: string | null;
};

export type VatQuarterPurchaseRow = {
  date: string;
  documentNumber: string;
  supplierName: string;
  supplierVoen: string;
  description: string;
  quantity: number;
  amountWithoutVat: string;
  vatAmount: string;
  amountWithVat: string;
  vatRatePercent: string;
  stockMovementId: string;
  productId: string;
  productSku: string;
};

@Injectable()
export class VatQuarterDataService {
  constructor(private readonly prisma: PrismaService) {}

  async loadQuarterVatRows(
    organizationId: string,
    year: number,
    quarter: number,
  ): Promise<{
    fromStr: string;
    toStr: string;
    sales: VatQuarterSalesRow[];
    purchases: VatQuarterPurchaseRow[];
  }> {
    const { fromStr, toStr } = quarterUtcRange(year, quarter);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        status: { not: InvoiceStatus.CANCELLED },
      },
      include: {
        counterparty: true,
        items: { include: { product: true } },
      },
    });

    const sales: VatQuarterSalesRow[] = [];

    for (const inv of invoices) {
      const eff = invoiceEffectiveDateIso(inv);
      if (!dateInRangeInclusive(eff, fromStr, toStr)) continue;
      for (const line of inv.items) {
        const rateRaw = new Decimal(line.vatRate);
        const rate = rateRaw.lt(0) ? new Decimal(0) : rateRaw;
        const lineTotal = new Decimal(line.lineTotal);
        const div = new Decimal(1).add(rate.div(100));
        const exVat = lineTotal.div(div);
        const vat = lineTotal.sub(exVat);
        const desc =
          line.description?.trim() || line.product?.name || "—";
        sales.push({
          date: eff,
          documentNumber: inv.number,
          counterpartyName: inv.counterparty.name,
          counterpartyVoen: inv.counterparty.taxId,
          description: desc,
          quantity: Number(line.quantity),
          amountWithoutVat: exVat.toFixed(4),
          vatAmount: vat.toFixed(4),
          amountWithVat: lineTotal.toFixed(4),
          vatRatePercent: rateRaw.toFixed(2),
          invoiceId: inv.id,
          invoiceLineId: line.id,
          productId: line.productId,
          productSku: line.product?.sku ?? null,
        });
      }
    }

    const movements = await this.prisma.stockMovement.findMany({
      where: {
        organizationId,
        reason: StockMovementReason.PURCHASE,
        type: "IN",
        product: { isService: false },
      },
      include: { product: true },
    });

    const purchases: VatQuarterPurchaseRow[] = [];

    for (const m of movements) {
      const eff = m.createdAt.toISOString().slice(0, 10);
      if (!dateInRangeInclusive(eff, fromStr, toStr)) continue;
      const qty = new Decimal(m.quantity);
      const price = new Decimal(m.price);
      const lineTotal = qty.mul(price);
      const rateRaw = new Decimal(m.product.vatRate);
      const rate = rateRaw.lt(0) ? new Decimal(0) : rateRaw;
      const div = new Decimal(1).add(rate.div(100));
      const exVat = lineTotal.div(div);
      const vat = lineTotal.sub(exVat);
      purchases.push({
        date: eff,
        documentNumber: `WH-${m.id.slice(0, 8)}`,
        supplierName: "",
        supplierVoen: "",
        description: m.product.name,
        quantity: Number(qty),
        amountWithoutVat: exVat.toFixed(4),
        vatAmount: vat.toFixed(4),
        amountWithVat: lineTotal.toFixed(4),
        vatRatePercent: rateRaw.toFixed(2),
        stockMovementId: m.id,
        productId: m.productId,
        productSku: m.product.sku,
      });
    }

    return { fromStr, toStr, sales, purchases };
  }
}
