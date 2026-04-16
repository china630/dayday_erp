import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Decimal,
  Prisma,
  StockMovementReason,
  StockMovementType,
  UserRole,
} from "@dayday/database";
import { assertMayPostManualJournal } from "../auth/policies/invoice-finance.policy";
import { randomUUID } from "node:crypto";
import { AccountingService } from "../accounting/accounting.service";
import {
  COGS_ACCOUNT_CODE,
  FINISHED_GOODS_ACCOUNT_CODE,
  INVENTORY_GOODS_ACCOUNT_CODE,
  INVENTORY_SURPLUS_INCOME_ACCOUNT_CODE,
  MISC_OPERATING_EXPENSE_ACCOUNT_CODE,
  PAYABLE_SUPPLIERS_ACCOUNT_CODE,
} from "../ledger.constants";
import { PrismaService } from "../prisma/prisma.service";
import type { PurchaseStockDto } from "./dto/purchase-stock.dto";
import type { TransferStockDto } from "./dto/transfer-stock.dto";
import {
  mergeInventorySettings,
  parseInventorySettings,
  type OrgInventorySettings,
} from "./inventory-settings";
import type { PatchInventorySettingsDto } from "./dto/patch-inventory-settings.dto";
import type { AdjustStockDto } from "./dto/adjust-stock.dto";
import type { CreateWarehouseDto } from "./dto/create-warehouse.dto";

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  async getInventorySettings(organizationId: string): Promise<
    OrgInventorySettings & { defaultWarehouseResolvedId: string | null }
  > {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    const parsed = parseInventorySettings(org?.settings);
    const resolved = await this.resolveDefaultWarehouseId(
      organizationId,
      parsed,
    );
    return { ...parsed, defaultWarehouseResolvedId: resolved };
  }

  async patchInventorySettings(
    organizationId: string,
    dto: PatchInventorySettingsDto,
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) throw new NotFoundException("Organization not found");
    const next = mergeInventorySettings(org.settings, {
      allowNegativeStock: dto.allowNegativeStock,
      defaultWarehouseId: dto.defaultWarehouseId,
    });
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { settings: next as object },
    });
    return this.getInventorySettings(organizationId);
  }

  async resolveDefaultWarehouseId(
    organizationId: string,
    parsed?: OrgInventorySettings,
  ): Promise<string | null> {
    const p = parsed ?? parseInventorySettings(
      (
        await this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: { settings: true },
        })
      )?.settings,
    );
    if (p.defaultWarehouseId) {
      const w = await this.prisma.warehouse.findFirst({
        where: { id: p.defaultWarehouseId, organizationId },
      });
      if (w) return w.id;
    }
    const first = await this.prisma.warehouse.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });
    return first?.id ?? null;
  }

  /**
   * Предупреждения при создании инвойса (продажа): остаток < потребности по строкам с productId.
   */
  async checkSaleAvailability(
    organizationId: string,
    warehouseId: string | null,
    lines: Array<{ productId: string | null; quantity: Decimal }>,
  ): Promise<string[]> {
    const warnings: string[] = [];
    if (!warehouseId) return warnings;

    const byProduct = new Map<string, Decimal>();
    for (const row of lines) {
      if (!row.productId) continue;
      const k = row.productId;
      byProduct.set(k, (byProduct.get(k) ?? new Decimal(0)).add(row.quantity));
    }

    for (const [productId, need] of byProduct) {
      const product = await this.prisma.product.findFirst({
        where: { id: productId, organizationId },
        select: { isService: true, name: true },
      });
      if (product?.isService) continue;

      const si = await this.prisma.stockItem.findUnique({
        where: {
          organizationId_warehouseId_productId: {
            organizationId,
            warehouseId,
            productId,
          },
        },
        include: { product: true },
      });
      const avail = si?.quantity ?? new Decimal(0);
      if (avail.lt(need)) {
        const name = si?.product?.name ?? product?.name ?? productId;
        warnings.push(
          `Недостаточно «${name}»: требуется ${need.toString()}, на складе ${avail.toString()}`,
        );
      }
    }
    return warnings;
  }

  listWarehouses(organizationId: string) {
    return this.prisma.warehouse.findMany({
      where: { organizationId },
      select: { id: true, name: true, inventoryAccountCode: true },
      orderBy: { name: "asc" },
    });
  }

  async createWarehouse(organizationId: string, dto: CreateWarehouseDto) {
    return this.prisma.warehouse.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        location: (dto.location ?? "").trim(),
      },
    });
  }

  async listStock(organizationId: string, warehouseId?: string) {
    return this.prisma.stockItem.findMany({
      where: {
        organizationId,
        ...(warehouseId ? { warehouseId } : {}),
      },
      include: { product: true, warehouse: true },
      orderBy: [{ warehouseId: "asc" }, { product: { name: "asc" } }],
    });
  }

  listMovements(
    organizationId: string,
    filters?: { warehouseId?: string; productId?: string; take?: number },
  ) {
    return this.prisma.stockMovement.findMany({
      where: {
        organizationId,
        ...(filters?.warehouseId ? { warehouseId: filters.warehouseId } : {}),
        ...(filters?.productId ? { productId: filters.productId } : {}),
      },
      include: { product: true, warehouse: true, invoice: { select: { number: true, id: true } } },
      orderBy: { createdAt: "desc" },
      take: filters?.take ?? 200,
    });
  }

  async recordPurchase(organizationId: string, dto: PurchaseStockDto) {
    const wh = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, organizationId },
    });
    if (!wh) throw new NotFoundException("Warehouse not found");

    return this.prisma.$transaction(async (tx) => {
      let total = new Decimal(0);

      for (const line of dto.lines) {
        const p = await tx.product.findFirst({
          where: { id: line.productId, organizationId },
        });
        if (!p) {
          throw new NotFoundException(`Product ${line.productId} not found`);
        }
        const qty = new Decimal(line.quantity);
        const unit = new Decimal(line.unitPrice);
        const lineAmt = qty.mul(unit);
        total = total.add(lineAmt);

        const existing = await tx.stockItem.findUnique({
          where: {
            organizationId_warehouseId_productId: {
              organizationId,
              warehouseId: dto.warehouseId,
              productId: line.productId,
            },
          },
        });

        let newQty: Decimal;
        let newAvg: Decimal;
        if (!existing || existing.quantity.lte(0)) {
          newQty = qty;
          newAvg = unit;
        } else {
          const q0 = existing.quantity;
          const c0 = existing.averageCost;
          const sumCost = q0.mul(c0).add(qty.mul(unit));
          newQty = q0.add(qty);
          newAvg = sumCost.div(newQty);
        }

        await tx.stockItem.upsert({
          where: {
            organizationId_warehouseId_productId: {
              organizationId,
              warehouseId: dto.warehouseId,
              productId: line.productId,
            },
          },
          create: {
            organizationId,
            warehouseId: dto.warehouseId,
            productId: line.productId,
            quantity: newQty,
            averageCost: newAvg,
          },
          update: {
            quantity: newQty,
            averageCost: newAvg,
          },
        });

        await tx.stockMovement.create({
          data: {
            organizationId,
            warehouseId: dto.warehouseId,
            productId: line.productId,
            type: StockMovementType.IN,
            reason: StockMovementReason.PURCHASE,
            quantity: qty,
            price: unit,
            note: dto.reference ?? null,
          },
        });
      }

      await this.accounting.postJournalInTransaction(tx, {
        organizationId,
        date: new Date(),
        reference: dto.reference ?? "PURCHASE",
        description: "Закупка товара на склад",
        counterpartyId: dto.counterpartyId ?? null,
        lines: [
          {
            accountCode: INVENTORY_GOODS_ACCOUNT_CODE,
            debit: total.toString(),
            credit: 0,
          },
          {
            accountCode: PAYABLE_SUPPLIERS_ACCOUNT_CODE,
            debit: 0,
            credit: total.toString(),
          },
        ],
      });

      return { totalAmount: total.toString(), lines: dto.lines.length };
    });
  }

  async transferStock(organizationId: string, dto: TransferStockDto) {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException("Склады должны различаться");
    }
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) throw new NotFoundException("Organization not found");
    const allowNeg = !!parseInventorySettings(org.settings).allowNegativeStock;

    const fromW = await this.prisma.warehouse.findFirst({
      where: { id: dto.fromWarehouseId, organizationId },
    });
    const toW = await this.prisma.warehouse.findFirst({
      where: { id: dto.toWarehouseId, organizationId },
    });
    if (!fromW || !toW) throw new NotFoundException("Warehouse not found");

    const qty = new Decimal(dto.quantity);
    const batch = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const src = await tx.stockItem.findUnique({
        where: {
          organizationId_warehouseId_productId: {
            organizationId,
            warehouseId: dto.fromWarehouseId,
            productId: dto.productId,
          },
        },
      });
      const avail = src?.quantity ?? new Decimal(0);
      const avgFrom = src?.averageCost ?? new Decimal(0);
      if (avail.lt(qty) && !allowNeg) {
        throw new BadRequestException("Недостаточно товара для перемещения");
      }

      const qSrcNew = avail.sub(qty);
      await tx.stockItem.upsert({
        where: {
          organizationId_warehouseId_productId: {
            organizationId,
            warehouseId: dto.fromWarehouseId,
            productId: dto.productId,
          },
        },
        create: {
          organizationId,
          warehouseId: dto.fromWarehouseId,
          productId: dto.productId,
          quantity: qSrcNew,
          averageCost: avgFrom,
        },
        update: {
          quantity: qSrcNew,
        },
      });

      const dst = await tx.stockItem.findUnique({
        where: {
          organizationId_warehouseId_productId: {
            organizationId,
            warehouseId: dto.toWarehouseId,
            productId: dto.productId,
          },
        },
      });
      const qDst0 = dst?.quantity ?? new Decimal(0);
      const cDst0 = dst?.averageCost ?? new Decimal(0);
      const qDst1 = qDst0.add(qty);
      const cDst1 =
        qDst1.lte(0) ? new Decimal(0) : qDst0.lte(0)
          ? avgFrom
          : qDst0.mul(cDst0).add(qty.mul(avgFrom)).div(qDst1);

      await tx.stockItem.upsert({
        where: {
          organizationId_warehouseId_productId: {
            organizationId,
            warehouseId: dto.toWarehouseId,
            productId: dto.productId,
          },
        },
        create: {
          organizationId,
          warehouseId: dto.toWarehouseId,
          productId: dto.productId,
          quantity: qDst1,
          averageCost: cDst1,
        },
        update: {
          quantity: qDst1,
          averageCost: cDst1,
        },
      });

      await tx.stockMovement.create({
        data: {
          organizationId,
          warehouseId: dto.fromWarehouseId,
          productId: dto.productId,
          type: StockMovementType.OUT,
          reason: StockMovementReason.ADJUSTMENT,
          quantity: qty,
          price: avgFrom,
          transferBatchId: batch,
          note: "TRANSFER_OUT",
        },
      });
      await tx.stockMovement.create({
        data: {
          organizationId,
          warehouseId: dto.toWarehouseId,
          productId: dto.productId,
          type: StockMovementType.IN,
          reason: StockMovementReason.ADJUSTMENT,
          quantity: qty,
          price: avgFrom,
          transferBatchId: batch,
          note: "TRANSFER_IN",
        },
      });

      return { transferBatchId: batch };
    });
  }

  /**
   * Списание по продаже + Дт 701 Кт 201 в той же транзакции, что и признание выручки (отгрузка / оплата).
   */
  async postSaleInventoryInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    invoiceId: string,
  ): Promise<void> {
    const inv = await tx.invoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: { items: true },
    });
    if (!inv) throw new NotFoundException("Invoice not found");
    if (inv.inventorySettled) return;

    const org = await tx.organization.findUnique({
      where: { id: organizationId },
    });
    const allowNeg = !!parseInventorySettings(org?.settings).allowNegativeStock;

    const lines = inv.items.filter((i) => i.productId != null);
    if (lines.length === 0) {
      await tx.invoice.update({
        where: { id: inv.id },
        data: { inventorySettled: true },
      });
      return;
    }

    const whId =
      inv.warehouseId ??
      (await this.resolveDefaultWarehouseIdInTx(tx, organizationId));
    if (!whId) {
      await tx.invoice.update({
        where: { id: inv.id },
        data: { inventorySettled: true },
      });
      return;
    }

    let totalCogs = new Decimal(0);

    for (const line of lines) {
      const pid = line.productId as string;
      const need = line.quantity;

      const si = await tx.stockItem.findUnique({
        where: {
          organizationId_warehouseId_productId: {
            organizationId,
            warehouseId: whId,
            productId: pid,
          },
        },
      });
      const avail = si?.quantity ?? new Decimal(0);
      const avg = si?.averageCost ?? new Decimal(0);
      const unitCost = avg.gt(0) ? avg : line.unitPrice;

      if (avail.lt(need) && !allowNeg) {
        throw new BadRequestException(
          `Недостаточно товара на складе для отгрузки по счёту (product ${pid})`,
        );
      }

      const lineCogs = need.mul(unitCost);
      totalCogs = totalCogs.add(lineCogs);
      const newQty = avail.sub(need);

      await tx.stockItem.upsert({
        where: {
          organizationId_warehouseId_productId: {
            organizationId,
            warehouseId: whId,
            productId: pid,
          },
        },
        create: {
          organizationId,
          warehouseId: whId,
          productId: pid,
          quantity: newQty,
          averageCost: unitCost,
        },
        update: {
          quantity: newQty,
        },
      });

      await tx.stockMovement.create({
        data: {
          organizationId,
          warehouseId: whId,
          productId: pid,
          type: StockMovementType.OUT,
          reason: StockMovementReason.SALE,
          quantity: need,
          price: unitCost,
          invoiceId: inv.id,
        },
      });
    }

    if (totalCogs.gt(0)) {
      await this.accounting.postJournalInTransaction(tx, {
        organizationId,
        date: new Date(),
        reference: inv.number,
        description: `Себестоимость по инвойсу ${inv.number}`,
        lines: [
          {
            accountCode: COGS_ACCOUNT_CODE,
            debit: totalCogs.toString(),
            credit: 0,
          },
          {
            accountCode: INVENTORY_GOODS_ACCOUNT_CODE,
            debit: 0,
            credit: totalCogs.toString(),
          },
        ],
      });
    }

    await tx.invoice.update({
      where: { id: inv.id },
      data: { inventorySettled: true },
    });
  }

  /**
   * Корректировка остатков внутри уже открытой транзакции (инвентаризация и др.).
   */
  async adjustStockInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    dto: AdjustStockDto,
  ): Promise<{ type: "IN" | "OUT"; amount: string }> {
    const qty = new Decimal(dto.quantity);
    const wh = await tx.warehouse.findFirst({
      where: { id: dto.warehouseId, organizationId },
    });
    if (!wh) throw new NotFoundException("Warehouse not found");

    const product = await tx.product.findFirst({
      where: { id: dto.productId, organizationId },
    });
    if (!product) throw new NotFoundException("Product not found");

    const org = await tx.organization.findUnique({
      where: { id: organizationId },
    });
    const allowNeg = !!parseInventorySettings(org?.settings).allowNegativeStock;

    const invAccountCode =
      dto.inventoryAccountCode === "204"
        ? FINISHED_GOODS_ACCOUNT_CODE
        : INVENTORY_GOODS_ACCOUNT_CODE;

    const existing = await tx.stockItem.findUnique({
      where: {
        organizationId_warehouseId_productId: {
          organizationId,
          warehouseId: dto.warehouseId,
          productId: dto.productId,
        },
      },
    });

    if (dto.type === "OUT") {
      const avail = existing?.quantity ?? new Decimal(0);
      const avg = existing?.averageCost ?? new Decimal(0);
      if (avail.lt(qty) && !allowNeg) {
        throw new BadRequestException("Недостаточно товара для списания");
      }
      const amount = qty.mul(avg);
      const qNew = avail.sub(qty);

      await tx.stockItem.upsert({
        where: {
          organizationId_warehouseId_productId: {
            organizationId,
            warehouseId: dto.warehouseId,
            productId: dto.productId,
          },
        },
        create: {
          organizationId,
          warehouseId: dto.warehouseId,
          productId: dto.productId,
          quantity: qNew,
          averageCost: avg,
        },
        update: {
          quantity: qNew,
        },
      });

      await tx.stockMovement.create({
        data: {
          organizationId,
          warehouseId: dto.warehouseId,
          productId: dto.productId,
          type: StockMovementType.OUT,
          reason: StockMovementReason.ADJUSTMENT,
          quantity: qty,
          price: avg,
          note: "INV_ADJ_OUT",
        },
      });

      if (amount.gt(0)) {
        await this.accounting.postJournalInTransaction(tx, {
          organizationId,
          date: new Date(),
          reference: "INV-ADJ-OUT",
          description: `Списание запасов (${invAccountCode})`,
          isFinal: true,
          lines: [
            {
              accountCode: MISC_OPERATING_EXPENSE_ACCOUNT_CODE,
              debit: amount.toString(),
              credit: 0,
            },
            {
              accountCode: invAccountCode,
              debit: 0,
              credit: amount.toString(),
            },
          ],
        });
      }

      return { type: "OUT" as const, amount: amount.toString() };
    }

    const unit =
      dto.unitPrice != null ? new Decimal(dto.unitPrice) : new Decimal(0);
    if (unit.lt(0)) {
      throw new BadRequestException("Укажите цену за единицу (≥ 0) при оприходовании");
    }

    const q0 = existing?.quantity ?? new Decimal(0);
    const c0 = existing?.averageCost ?? new Decimal(0);
    const q1 = q0.add(qty);
    const c1 = q1.lte(0)
      ? new Decimal(0)
      : q0.lte(0)
        ? unit
        : q0.mul(c0).add(qty.mul(unit)).div(q1);

    await tx.stockItem.upsert({
      where: {
        organizationId_warehouseId_productId: {
          organizationId,
          warehouseId: dto.warehouseId,
          productId: dto.productId,
        },
      },
      create: {
        organizationId,
        warehouseId: dto.warehouseId,
        productId: dto.productId,
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
        warehouseId: dto.warehouseId,
        productId: dto.productId,
        type: StockMovementType.IN,
        reason: StockMovementReason.ADJUSTMENT,
        quantity: qty,
        price: unit,
        note: "INV_ADJ_IN",
      },
    });

    const amount = qty.mul(unit);
    if (amount.gt(0)) {
      await this.accounting.postJournalInTransaction(tx, {
        organizationId,
        date: new Date(),
        reference: "INV-ADJ-IN",
        description: `Оприходование излишков (${invAccountCode})`,
        isFinal: true,
        lines: [
          {
            accountCode: invAccountCode,
            debit: amount.toString(),
            credit: 0,
          },
          {
            accountCode: INVENTORY_SURPLUS_INCOME_ACCOUNT_CODE,
            debit: 0,
            credit: amount.toString(),
          },
        ],
      });
    }

    return { type: "IN" as const, amount: amount.toString() };
  }

  /**
   * Корректировка остатков: списание (Дт 731 — Кт 201/204) или оприходование излишков (Дт 201/204 — Кт 631).
   */
  async adjustStock(
    organizationId: string,
    dto: AdjustStockDto,
    actingUserRole?: UserRole,
  ) {
    if (actingUserRole !== undefined) {
      assertMayPostManualJournal(actingUserRole);
    }
    return this.prisma.$transaction((tx) =>
      this.adjustStockInTransaction(tx, organizationId, dto),
    );
  }

  private async resolveDefaultWarehouseIdInTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<string | null> {
    const org = await tx.organization.findUnique({
      where: { id: organizationId },
    });
    const parsed = parseInventorySettings(org?.settings);
    if (parsed.defaultWarehouseId) {
      const w = await tx.warehouse.findFirst({
        where: { id: parsed.defaultWarehouseId, organizationId },
      });
      if (w) return w.id;
    }
    const first = await tx.warehouse.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });
    return first?.id ?? null;
  }
}
