import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  PaymentOrderStatus,
  SubscriptionTier,
  UserRole,
} from "@dayday/database";
import PDFDocument from "pdfkit";
import { registerUnicodeFonts, PDF_FONT_UNICODE } from "../reporting/pdf-font.util";
import { PrismaService } from "../prisma/prisma.service";
import { PricingService } from "../admin/pricing.service";
import { SubscriptionAccessService } from "../subscription/subscription-access.service";

function isModuleActiveInSubscription(active: string[], key: string): boolean {
  if (active.includes(key)) return true;
  if (key === "manufacturing") return active.includes("production");
  if (key === "ifrs_mapping") return active.includes("ifrs");
  return false;
}

@Injectable()
export class BillingPaymentOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly subscriptionAccess: SubscriptionAccessService,
  ) {}

  async listForOwnerUser(userId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId, role: UserRole.OWNER },
      select: { organizationId: true },
    });
    const orgIds = memberships.map((m) => m.organizationId);
    if (orgIds.length === 0) {
      return { items: [] as const };
    }

    const orders = await this.prisma.paymentOrder.findMany({
      where: { organizationId: { in: orgIds } },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        organization: { select: { id: true, name: true, taxId: true } },
      },
    });

    return {
      items: orders.map((o) => ({
        id: o.id,
        organizationId: o.organizationId,
        organizationName: o.organization.name,
        organizationTaxId: o.organization.taxId,
        amountAzn: o.amountAzn.toString(),
        currency: o.currency,
        status: o.status,
        monthsApplied: o.monthsApplied,
        createdAt: o.createdAt.toISOString(),
        paidAt: o.paidAt?.toISOString() ?? null,
      })),
    };
  }

  async assertOwnerCanAccessOrder(
    userId: string,
    orderId: string,
  ): Promise<{
    order: {
      id: string;
      organizationId: string;
      amountAzn: { toString(): string };
      status: PaymentOrderStatus;
      createdAt: Date;
      paidAt: Date | null;
      monthsApplied: number;
      currency: string;
    };
    organization: { name: string; taxId: string };
  }> {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { id: orderId },
      include: {
        organization: { select: { name: true, taxId: true } },
      },
    });
    if (!order) {
      throw new NotFoundException("Payment order not found");
    }
    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: order.organizationId,
        },
      },
    });
    if (!membership || membership.role !== UserRole.OWNER) {
      throw new ForbiddenException({
        code: "BILLING_OWNER_ONLY",
        message: "Only the organization owner can download this invoice.",
      });
    }
    return { order, organization: order.organization };
  }

  /**
   * Заглушка PDF (v10.6): детализация по базе и модулям из текущего снимка подписки + каталога цен.
   */
  async buildInvoicePdfBuffer(orderId: string, userId: string): Promise<Buffer> {
    const { order, organization } = await this.assertOwnerCanAccessOrder(
      userId,
      orderId,
    );

    const snap = await this.subscriptionAccess.getOrganizationSnapshot(
      order.organizationId,
    );
    const catalog = await this.pricing.getConstructorData();
    const active = snap.activeModules;
    const isEnterprise = snap.tier === SubscriptionTier.ENTERPRISE;

    const lines: Array<{ label: string; amount: number }> = [];
    lines.push({
      label: "Base subscription / Baza abunə",
      amount: catalog.basePrice,
    });

    for (const m of catalog.modules) {
      const on = isEnterprise || isModuleActiveInSubscription(active, m.key);
      if (on) {
        lines.push({
          label: `${m.name} (${m.key})`,
          amount: Number(m.pricePerMonth),
        });
      }
    }

    const sumLines = lines.reduce((s, l) => s + l.amount, 0);
    const charged = Number.parseFloat(order.amountAzn.toString());

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: "A4",
        margin: 48,
        info: { Title: "Invoice" },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => {
        chunks.push(c);
      });
      doc.on("end", () => {
        resolve(Buffer.concat(chunks));
      });
      doc.on("error", reject);

      registerUnicodeFonts(doc);
      doc.font(PDF_FONT_UNICODE);

      doc
        .fontSize(18)
        .fillColor("#34495E")
        .text("DayDay ERP — Invoice (stub v10.6)", { align: "left" });
      doc.moveDown(0.5);
      doc
        .fontSize(10)
        .fillColor("#7F8C8D")
        .text(
          "Stub PDF: line items use the current subscription snapshot and catalog; charged amount is from the payment order.",
          { align: "left" },
        );
      doc.moveDown(1);

      doc.fontSize(11).fillColor("#34495E").text(`Organization: ${organization.name}`);
      doc.text(`VÖEN: ${organization.taxId || "—"}`);
      doc.text(`Order ID: ${order.id}`);
      doc.text(`Status: ${order.status}`);
      doc.text(`Created: ${order.createdAt.toISOString()}`);
      doc.text(`Paid: ${order.paidAt?.toISOString() ?? "—"}`);
      doc.moveDown(1);

      doc
        .fontSize(12)
        .fillColor("#34495E")
        .text("Module breakdown / Modul detalları", { underline: true });
      doc.moveDown(0.5);

      doc.fontSize(10).fillColor("#34495E");
      for (const row of lines) {
        doc.text(`${row.label} … ${row.amount.toFixed(2)} AZN`);
      }
      doc.moveDown(0.5);
      doc
        .fontSize(10)
        .fillColor("#7F8C8D")
        .text(`Calculated subtotal (lines): ${sumLines.toFixed(2)} AZN`);
      doc
        .fontSize(12)
        .fillColor("#2980B9")
        .text(`Amount charged (order): ${charged.toFixed(2)} ${order.currency}`);

      doc.moveDown(1.5);
      doc
        .fontSize(9)
        .fillColor("#7F8C8D")
        .text(
          "This document is a technical stub for testing. Not a fiscal invoice.",
          { align: "left" },
        );

      doc.end();
    });
  }
}
