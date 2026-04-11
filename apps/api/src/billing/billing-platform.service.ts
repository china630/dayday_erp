import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  PaymentOrderStatus,
  Prisma,
  SubscriptionInvoiceStatus,
  SubscriptionTier,
  UserRole,
} from "@dayday/database";
import PDFDocument from "pdfkit";
import { PrismaService } from "../prisma/prisma.service";
import { PricingService } from "../admin/pricing.service";
import { SubscriptionAccessService } from "../subscription/subscription-access.service";
import { parseToggleModuleMetadata } from "./billing-module-toggle.helpers";

function isModuleActiveInSubscription(active: string[], key: string): boolean {
  if (active.includes(key)) return true;
  if (key === "manufacturing") return active.includes("production");
  if (key === "ifrs_mapping") return active.includes("ifrs");
  return false;
}

function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function endOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

@Injectable()
export class BillingPlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly subscriptionAccess: SubscriptionAccessService,
  ) {}

  /**
   * Владелец организации для платформенного счёта: ownerId или первый OWNER в membership.
   */
  async resolveOwnerUserId(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<string | null> {
    const org = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { ownerId: true },
    });
    if (org?.ownerId) return org.ownerId;
    const m = await tx.organizationMembership.findFirst({
      where: { organizationId, role: UserRole.OWNER },
      orderBy: { joinedAt: "asc" },
    });
    return m?.userId ?? null;
  }

  /**
   * После успешной оплаты: счёт на Owner-аккаунт, строки с привязкой к организации (TZ §14.8).
   */
  async recordPaidOrderInvoice(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    const dup = await tx.subscriptionInvoice.findUnique({
      where: { paymentOrderId: orderId },
    });
    if (dup) return;

    const order = await tx.paymentOrder.findUnique({
      where: { id: orderId },
      include: { organization: true },
    });
    if (!order || order.status !== PaymentOrderStatus.PAID) return;

    const ownerUserId = await this.resolveOwnerUserId(tx, order.organizationId);
    if (!ownerUserId) {
      return;
    }

    const paidAt = order.paidAt ?? new Date();
    const periodStart = startOfMonthUtc(paidAt);
    const periodEnd = endOfMonthUtc(paidAt);
    const dateOnly = new Date(
      Date.UTC(
        paidAt.getUTCFullYear(),
        paidAt.getUTCMonth(),
        paidAt.getUTCDate(),
      ),
    );

    const toggleMeta = parseToggleModuleMetadata(order.metadata);
    const desc =
      toggleMeta?.enabled === true && order.monthsApplied === 0
        ? `Pro-rata module (${toggleMeta.moduleKey}) — ${order.organization.name} (VÖEN ${order.organization.taxId})`
        : `Subscription payment (${order.monthsApplied} mo.) — ${order.organization.name} (VÖEN ${order.organization.taxId})`;

    await tx.subscriptionInvoice.create({
      data: {
        userId: ownerUserId,
        amount: order.amountAzn,
        status: SubscriptionInvoiceStatus.PAID,
        date: dateOnly,
        periodStart,
        periodEnd,
        paymentOrderId: order.id,
        items: {
          create: [
            {
              organizationId: order.organizationId,
              description: desc,
              amount: order.amountAzn,
            },
          ],
        },
      },
    });
  }

  private async assertOwnerHasPortfolio(userId: string): Promise<
    Array<{
      id: string;
      name: string;
      taxId: string;
      ownerId: string | null;
    }>
  > {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId, role: UserRole.OWNER },
      include: {
        organization: {
          select: { id: true, name: true, taxId: true, ownerId: true },
        },
      },
    });

    const orgs = memberships
      .map((m) => m.organization)
      .filter((o) => o.ownerId == null || o.ownerId === userId);

    if (orgs.length === 0) {
      throw new ForbiddenException({
        code: "BILLING_OWNER_ONLY",
        message: "Only organization owners can access billing portfolio.",
      });
    }

    return orgs;
  }

  async getSummary(userId: string) {
    const orgs = await this.assertOwnerHasPortfolio(userId);

    let estimatedTotal = 0;
    const rows: Array<{
      organizationId: string;
      name: string;
      taxId: string;
      tier: SubscriptionTier;
      ownerIdMatches: boolean;
      monthlyEstimateAzn: string;
      activeModules: string[];
    }> = [];

    const catalog = await this.pricing.getConstructorData();

    for (const o of orgs) {
      const snap = await this.subscriptionAccess.getOrganizationSnapshot(o.id);
      const active = snap.activeModules;
      const isEnterprise = snap.tier === SubscriptionTier.ENTERPRISE;

      let monthly = catalog.basePrice;
      for (const m of catalog.modules) {
        const on = isEnterprise || isModuleActiveInSubscription(active, m.key);
        if (on) monthly += Number(m.pricePerMonth);
      }

      estimatedTotal += monthly;
      rows.push({
        organizationId: o.id,
        name: o.name,
        taxId: o.taxId,
        tier: snap.tier,
        ownerIdMatches: o.ownerId === userId,
        monthlyEstimateAzn: monthly.toFixed(2),
        activeModules: [...active],
      });
    }

    const total = estimatedTotal.toFixed(2);
    return {
      currency: "AZN" as const,
      organizations: rows,
      /** Суммарная оценка портфеля (все организации владельца), AZN/мес. */
      totalMonthlyEstimateAzn: total,
      estimatedNextPaymentAzn: total,
    };
  }

  /**
   * Оценка помесячной суммы по одной организации (Foundation + модули из каталога).
   */
  async estimateMonthlyAznForOrganization(
    organizationId: string,
  ): Promise<number> {
    const snap = await this.subscriptionAccess.getOrganizationSnapshot(
      organizationId,
    );
    const catalog = await this.pricing.getConstructorData();
    const active = snap.activeModules;
    const isEnterprise = snap.tier === SubscriptionTier.ENTERPRISE;
    let monthly = catalog.basePrice;
    for (const m of catalog.modules) {
      const on = isEnterprise || isModuleActiveInSubscription(active, m.key);
      if (on) monthly += Number(m.pricePerMonth);
    }
    return monthly;
  }

  async listInvoices(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<{
    items: Array<{
      id: string;
      amount: string;
      status: SubscriptionInvoiceStatus;
      date: string;
      periodStart: string | null;
      periodEnd: string | null;
      pdfUrl: string;
      paymentOrderId: string | null;
      lines: Array<{
        organizationId: string;
        organizationName: string;
        organizationTaxId: string;
        description: string;
        amount: string;
      }>;
      createdAt: string;
    }>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    await this.assertOwnerHasPortfolio(userId);

    const skip = (page - 1) * pageSize;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.subscriptionInvoice.findMany({
        where: { userId },
        include: {
          items: {
            include: {
              organization: {
                select: { id: true, name: true, taxId: true },
              },
            },
          },
          paymentOrder: { select: { id: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      this.prisma.subscriptionInvoice.count({ where: { userId } }),
    ]);

    return {
      items: rows.map((inv) => ({
        id: inv.id,
        amount: inv.amount.toString(),
        status: inv.status,
        date: inv.date.toISOString().slice(0, 10),
        periodStart: inv.periodStart?.toISOString() ?? null,
        periodEnd: inv.periodEnd?.toISOString() ?? null,
        pdfUrl: `/api/billing/invoices/${inv.id}/pdf`,
        paymentOrderId: inv.paymentOrderId,
        lines: inv.items.map((it) => ({
          organizationId: it.organizationId,
          organizationName: it.organization.name,
          organizationTaxId: it.organization.taxId,
          description: it.description,
          amount: it.amount.toString(),
        })),
        createdAt: inv.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  async assertUserCanAccessInvoice(userId: string, invoiceId: string) {
    const invoice = await this.prisma.subscriptionInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: { include: { organization: true } },
      },
    });
    if (!invoice) {
      throw new NotFoundException("Subscription invoice not found");
    }
    if (invoice.userId !== userId) {
      throw new ForbiddenException({
        code: "BILLING_INVOICE_ACCESS",
        message: "This invoice belongs to another account.",
      });
    }
    return { invoice };
  }

  async buildSubscriptionInvoicePdfBuffer(
    invoiceId: string,
    userId: string,
  ): Promise<Buffer> {
    const { invoice } = await this.assertUserCanAccessInvoice(userId, invoiceId);

    const charged = Number.parseFloat(invoice.amount.toString());

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: "A4",
        margin: 48,
        info: { Title: "Platform subscription invoice" },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => {
        chunks.push(c);
      });
      doc.on("end", () => {
        resolve(Buffer.concat(chunks));
      });
      doc.on("error", reject);

      doc
        .fontSize(18)
        .fillColor("#34495E")
        .text("DayDay ERP — Platform invoice (subscription)", { align: "left" });
      doc.moveDown(0.5);
      doc
        .fontSize(10)
        .fillColor("#7F8C8D")
        .text(
          "Aggregated platform billing to the owner account; line items reference organizations (VÖEN).",
          { align: "left" },
        );
      doc.moveDown(1);

      doc.fontSize(11).fillColor("#34495E").text(`Invoice ID: ${invoice.id}`);
      doc.text(`Status: ${invoice.status}`);
      doc.text(`Date: ${invoice.date.toISOString().slice(0, 10)}`);
      if (invoice.periodStart && invoice.periodEnd) {
        doc.text(
          `Period: ${invoice.periodStart.toISOString().slice(0, 10)} — ${invoice.periodEnd.toISOString().slice(0, 10)}`,
        );
      }
      if (invoice.paymentOrderId) {
        doc.text(`Payment order: ${invoice.paymentOrderId}`);
      }
      doc.moveDown(1);

      doc
        .fontSize(12)
        .fillColor("#34495E")
        .text("Line items / Təşkilat sətirləri", { underline: true });
      doc.moveDown(0.5);

      doc.fontSize(10).fillColor("#34495E");
      for (const it of invoice.items) {
        doc.text(
          `${it.organization.name} (VÖEN ${it.organization.taxId}) — ${it.description}`,
        );
        doc.text(`… ${Number.parseFloat(it.amount.toString()).toFixed(2)} AZN`);
        doc.moveDown(0.35);
      }

      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .fillColor("#2980B9")
        .text(`Total: ${charged.toFixed(2)} AZN`);

      doc.moveDown(1.5);
      doc
        .fontSize(9)
        .fillColor("#7F8C8D")
        .text(
          "Technical document for platform billing. Not a fiscal sales invoice.",
          { align: "left" },
        );

      doc.end();
    });
  }
}
