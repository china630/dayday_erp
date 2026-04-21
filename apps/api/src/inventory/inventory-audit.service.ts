import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  InventoryAuditStatus,
  Prisma,
  StockMovementReason,
  StockMovementType,
  UserRole,
} from "@dayday/database";
import { assertMayPostManualJournal } from "../auth/policies/invoice-finance.policy";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateInventoryAuditDto } from "./dto/create-inventory-audit.dto";
import { AccountingService } from "../accounting/accounting.service";
import { getClosedPeriodKeys, monthKeyUtc } from "../reporting/reporting-period.util";
import {
  FINISHED_GOODS_ACCOUNT_CODE,
  INVENTORY_GOODS_ACCOUNT_CODE,
  MISC_OPERATING_EXPENSE_ACCOUNT_CODE,
} from "../ledger.constants";

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

@Injectable()
export class InventoryAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  async findAll(organizationId: string) {
    return this.prisma.inventoryAudit.findMany({
      where: { organizationId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: { warehouse: { select: { id: true, name: true } } },
    });
  }

  async findOne(organizationId: string, id: string) {
    const row = await this.prisma.inventoryAudit.findFirst({
      where: { id, organizationId },
      include: {
        warehouse: { select: { id: true, name: true, inventoryAccountCode: true } },
        lines: {
          orderBy: { createdAt: "asc" },
          include: {
            product: { select: { id: true, name: true, sku: true, isService: true } },
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException("Инвентаризационная опись не найдена");
    }
    return row;
  }

  async create(
    organizationId: string,
    dto: CreateInventoryAuditDto,
    actingUserRole: UserRole,
  ) {
    if (dto.status === InventoryAuditStatus.DRAFT) {
      return this.createDraftWithLines(organizationId, dto);
    }

    if (dto.status === InventoryAuditStatus.APPROVED) {
      assertMayPostManualJournal(actingUserRole);
      throw new BadRequestException(
        "Create with status APPROVED is not supported; create DRAFT then approve",
      );
    }

    throw new BadRequestException("Unsupported inventory audit status");
  }

  /**
   * Проведение сохранённого черновика (TZ §10.1): одна транзакция, обновление той же записи.
   */
  async approveDraft(
    organizationId: string,
    id: string,
    actingUserRole: UserRole,
  ) {
    const draft = await this.prisma.inventoryAudit.findFirst({
      where: { id, organizationId, status: InventoryAuditStatus.DRAFT },
      include: {
        warehouse: { select: { id: true, name: true, inventoryAccountCode: true } },
        lines: true,
      },
    });
    if (!draft) {
      throw new NotFoundException("Инвентаризационная опись не найдена");
    }
    assertMayPostManualJournal(actingUserRole);

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const closed = getClosedPeriodKeys(org?.settings);
    const periodKey = monthKeyUtc(draft.date);
    if (closed.includes(periodKey)) {
      throw new BadRequestException(
        `Период ${periodKey} закрыт: проведение описи недоступно`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.applyApprovedAdjustmentsInTx(tx, organizationId, draft);
      await tx.inventoryAudit.update({
        where: { id },
        data: {
          status: InventoryAuditStatus.APPROVED,
        },
      });
      return this.findOneInTx(tx, organizationId, id);
    });
  }

  /**
   * Черновик описи: подтянуть systemQty (и среднюю цену для справки в costPrice) из текущих StockItem.
   */
  async syncSystemFromStock(
    organizationId: string,
    auditId: string,
    actingUserRole: UserRole,
  ) {
    assertMayPostManualJournal(actingUserRole);
    const audit = await this.prisma.inventoryAudit.findFirst({
      where: {
        id: auditId,
        organizationId,
        status: InventoryAuditStatus.DRAFT,
      },
      include: {
        lines: { select: { id: true, productId: true } },
      },
    });
    if (!audit) {
      throw new NotFoundException("Инвентаризационная опись не найдена");
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const closed = getClosedPeriodKeys(org?.settings);
    const key = monthKeyUtc(audit.date);
    if (closed.includes(key)) {
      throw new BadRequestException(
        `Период ${key} закрыт: синхронизация недоступна`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const line of audit.lines) {
        const stock = await tx.stockItem.findUnique({
          where: {
            organizationId_warehouseId_productId: {
              organizationId,
              warehouseId: audit.warehouseId,
              productId: line.productId,
            },
          },
          select: { quantity: true },
        });
        const systemQty = stock?.quantity ?? new Decimal(0);
        await tx.inventoryAuditLine.update({
          where: { id: line.id },
          data: { systemQty },
        });
      }
    });

    return this.findOne(organizationId, auditId);
  }

  private findOneInTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
  ) {
    return tx.inventoryAudit.findFirstOrThrow({
      where: { id, organizationId },
      include: {
        warehouse: { select: { id: true, name: true, inventoryAccountCode: true } },
        lines: {
          orderBy: { createdAt: "asc" },
          include: {
            product: { select: { id: true, name: true, sku: true, isService: true } },
          },
        },
      },
    });
  }

  async patchLine(
    organizationId: string,
    lineId: string,
    dto: { factQty?: number; costPrice?: number },
    actingUserRole: UserRole,
  ) {
    assertMayPostManualJournal(actingUserRole);
    const row = await this.prisma.inventoryAuditLine.findFirst({
      where: { id: lineId, organizationId },
      include: {
        inventoryAudit: {
          select: { id: true, status: true, date: true },
        },
      },
    });
    if (!row) throw new NotFoundException("Inventory audit line not found");
    if (row.inventoryAudit.status !== InventoryAuditStatus.DRAFT) {
      throw new BadRequestException("Inventory audit is not editable");
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const closed = getClosedPeriodKeys(org?.settings);
    const key = monthKeyUtc(row.inventoryAudit.date);
    if (closed.includes(key)) {
      throw new BadRequestException(
        `Период ${key} закрыт: редактирование описи недоступно`,
      );
    }

    const next: Record<string, unknown> = {};
    if (dto.factQty != null) {
      const f = new Decimal(dto.factQty);
      if (f.lt(0)) throw new BadRequestException("factQty must be >= 0");
      next.factQty = f;
    }
    if (dto.costPrice != null) {
      const c = new Decimal(dto.costPrice);
      if (c.lt(0)) throw new BadRequestException("costPrice must be >= 0");
      next.costPrice = c;
    }
    if (Object.keys(next).length === 0) return row;
    return this.prisma.inventoryAuditLine.update({
      where: { id: row.id },
      data: next,
    });
  }

  private async createDraftWithLines(
    organizationId: string,
    dto: CreateInventoryAuditDto,
  ) {
    const wh = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, organizationId },
      select: { id: true },
    });
    if (!wh) throw new NotFoundException("Warehouse not found");

    const date = new Date(dto.date);

    return this.prisma.$transaction(async (tx) => {
      const audit = await tx.inventoryAudit.create({
        data: {
          organizationId,
          warehouseId: dto.warehouseId,
          date,
          status: InventoryAuditStatus.DRAFT,
        },
      });

      const stock = await tx.stockItem.findMany({
        where: { organizationId, warehouseId: dto.warehouseId },
        include: { product: { select: { id: true, isService: true } } },
        orderBy: { createdAt: "asc" },
      });

      const lines = stock
        .filter((s) => !s.product?.isService)
        .map((s) => ({
          organizationId,
          inventoryAuditId: audit.id,
          productId: s.productId,
          systemQty: s.quantity,
          factQty: s.quantity,
          costPrice: s.averageCost,
        }));

      if (lines.length) {
        await tx.inventoryAuditLine.createMany({ data: lines });
      }

      return tx.inventoryAudit.findUniqueOrThrow({
        where: { id: audit.id },
        include: {
          warehouse: { select: { id: true, name: true, inventoryAccountCode: true } },
          lines: {
            orderBy: { createdAt: "asc" },
            include: { product: { select: { id: true, name: true, sku: true, isService: true } } },
          },
        },
      });
    });
  }

  /**
   * Только `tx` (все движения/проводки + обновление остатков).
   */
  private async applyApprovedAdjustmentsInTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    audit: {
      id: string;
      date: Date;
      warehouseId: string;
      warehouse: { inventoryAccountCode: string; name: string };
      lines: Array<{
        id: string;
        productId: string;
        systemQty: Decimal;
        factQty: Decimal;
        costPrice: Decimal;
      }>;
    },
  ): Promise<void> {
    const documentDate = new Date(
      Date.UTC(
        audit.date.getUTCFullYear(),
        audit.date.getUTCMonth(),
        audit.date.getUTCDate(),
        12,
        0,
        0,
        0,
      ),
    );
    const invAcc =
      audit.warehouse.inventoryAccountCode === "204"
        ? FINISHED_GOODS_ACCOUNT_CODE
        : INVENTORY_GOODS_ACCOUNT_CODE;

    let surplus = new Decimal(0);
    let shortage = new Decimal(0);

    for (const line of audit.lines) {
      const system = new Decimal(line.systemQty ?? 0);
      const fact = new Decimal(line.factQty ?? 0);
      const delta = fact.sub(system);
      if (delta.abs().lt(new Decimal("0.0001"))) continue;

      const unit = new Decimal(line.costPrice ?? 0);
      if (unit.lt(0)) {
        throw new BadRequestException(`Invalid costPrice for product ${line.productId}`);
      }

      const qtyAbs = delta.abs();
      const amount = qtyAbs.mul(unit);

      const existing = await tx.stockItem.findUnique({
        where: {
          organizationId_warehouseId_productId: {
            organizationId,
            warehouseId: audit.warehouseId,
            productId: line.productId,
          },
        },
      });
      const q0 = existing?.quantity ?? new Decimal(0);
      const c0 = existing?.averageCost ?? new Decimal(0);

      if (delta.gt(0)) {
        surplus = surplus.add(amount);
        const q1 = q0.add(qtyAbs);
        const c1 =
          q1.lte(0) ? new Decimal(0) : q0.lte(0) ? unit : q0.mul(c0).add(qtyAbs.mul(unit)).div(q1);
        await tx.stockItem.upsert({
          where: {
            organizationId_warehouseId_productId: {
              organizationId,
              warehouseId: audit.warehouseId,
              productId: line.productId,
            },
          },
          create: {
            organizationId,
            warehouseId: audit.warehouseId,
            productId: line.productId,
            quantity: q1,
            averageCost: c1,
          },
          update: {
            quantity: q1,
            averageCost: c1,
          },
        });
        await tx.stockMovement.create({
          data: {
            organizationId,
            warehouseId: audit.warehouseId,
            productId: line.productId,
            type: StockMovementType.IN,
            reason: StockMovementReason.ADJUSTMENT,
            quantity: qtyAbs,
            price: unit,
            note: `INV_AUDIT:${audit.id}`,
            documentDate,
          },
        });
      } else {
        shortage = shortage.add(amount);
        const q1 = q0.sub(qtyAbs);
        await tx.stockItem.upsert({
          where: {
            organizationId_warehouseId_productId: {
              organizationId,
              warehouseId: audit.warehouseId,
              productId: line.productId,
            },
          },
          create: {
            organizationId,
            warehouseId: audit.warehouseId,
            productId: line.productId,
            quantity: q1,
            averageCost: c0,
          },
          update: {
            quantity: q1,
          },
        });
        await tx.stockMovement.create({
          data: {
            organizationId,
            warehouseId: audit.warehouseId,
            productId: line.productId,
            type: StockMovementType.OUT,
            reason: StockMovementReason.ADJUSTMENT,
            quantity: qtyAbs,
            price: unit,
            note: `INV_AUDIT:${audit.id}`,
            documentDate,
          },
        });
      }
    }

    if (surplus.lte(0) && shortage.lte(0)) return;

    const lines = [
      ...(surplus.gt(0)
        ? [
            { accountCode: invAcc, debit: surplus.toString(), credit: 0 },
            { accountCode: "611", debit: 0, credit: surplus.toString() },
          ]
        : []),
      ...(shortage.gt(0)
        ? [
            { accountCode: MISC_OPERATING_EXPENSE_ACCOUNT_CODE, debit: shortage.toString(), credit: 0 },
            { accountCode: invAcc, debit: 0, credit: shortage.toString() },
          ]
        : []),
    ];

    await this.accounting.postJournalInTransaction(tx, {
      organizationId,
      date: audit.date,
      reference: `INV-AUDIT-${audit.id}`,
      description: `Инвентаризационная опись (${audit.warehouse.name})`,
      isFinal: true,
      lines,
    });
  }
}
