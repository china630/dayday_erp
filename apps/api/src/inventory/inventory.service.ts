import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  InventoryAdjustmentDocType,
  InventoryAdjustmentStatus,
  Prisma,
  StockMovementReason,
  StockMovementType,
  UserRole,
} from "@dayday/database";
import { assertMayPostManualJournal } from "../auth/policies/invoice-finance.policy";
import { AccessControlService } from "../access/access-control.service";
import { getClosedPeriodKeys, monthKeyUtc } from "../reporting/reporting-period.util";
import { randomUUID } from "node:crypto";
import { AccountingService } from "../accounting/accounting.service";
import {
  COGS_ACCOUNT_CODE,
  FINISHED_GOODS_ACCOUNT_CODE,
  INVENTORY_GOODS_ACCOUNT_CODE,
  INVENTORY_SURPLUS_INCOME_ACCOUNT_CODE,
  MISC_OPERATING_EXPENSE_ACCOUNT_CODE,
  PAYABLE_SUPPLIERS_ACCOUNT_CODE,
  VAT_INPUT_ACCOUNT_CODE,
} from "../ledger.constants";
import { PrismaService } from "../prisma/prisma.service";
import { StockService } from "../stock/stock.service";
import type { PurchaseStockDto } from "./dto/purchase-stock.dto";
import type { TransferStockDto } from "./dto/transfer-stock.dto";
import {
  mergeInventorySettings,
  parseInventorySettings,
  type OrgInventorySettings,
} from "./inventory-settings";
import type { PatchInventorySettingsDto } from "./dto/patch-inventory-settings.dto";
import type { AdjustStockDto } from "./dto/adjust-stock.dto";
import type { CreateInventoryAdjustmentDto } from "./dto/create-inventory-adjustment.dto";
import type { CreateWarehouseDto } from "./dto/create-warehouse.dto";
import type { CreateWarehouseBinDto } from "./dto/create-warehouse-bin.dto";

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly stock: StockService,
    private readonly access: AccessControlService,
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

  listBins(organizationId: string, warehouseId?: string) {
    return this.prisma.warehouseBin.findMany({
      where: {
        organizationId,
        ...(warehouseId ? { warehouseId } : {}),
      },
      include: { warehouse: { select: { id: true, name: true } } },
      orderBy: [{ warehouseId: "asc" }, { code: "asc" }],
    });
  }

  async createBin(organizationId: string, dto: CreateWarehouseBinDto) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, organizationId },
      select: { id: true },
    });
    if (!warehouse) throw new NotFoundException("Warehouse not found");
    return this.prisma.warehouseBin.create({
      data: {
        organizationId,
        warehouseId: dto.warehouseId,
        code: dto.code.trim(),
        barcode: dto.barcode?.trim() || null,
      },
    });
  }

  async listStock(organizationId: string, warehouseId?: string) {
    return this.prisma.stockItem.findMany({
      where: {
        organizationId,
        ...(warehouseId ? { warehouseId } : {}),
        product: { isService: false },
      },
      include: { product: true, warehouse: true, bin: true },
      orderBy: [{ warehouseId: "asc" }, { product: { name: "asc" } }],
    });
  }

  listMovements(
    organizationId: string,
    filters?: {
      warehouseId?: string;
      productId?: string;
      take?: number;
      note?: string;
      notes?: string[];
      type?: StockMovementType;
      reason?: StockMovementReason;
    },
  ) {
    const noteFilter =
      filters?.notes && filters.notes.length > 0
        ? { note: { in: filters.notes } }
        : filters?.note
          ? { note: filters.note }
          : {};
    return this.prisma.stockMovement.findMany({
      where: {
        organizationId,
        ...(filters?.warehouseId ? { warehouseId: filters.warehouseId } : {}),
        ...(filters?.productId ? { productId: filters.productId } : {}),
        ...(filters?.type ? { type: filters.type } : {}),
        ...(filters?.reason ? { reason: filters.reason } : {}),
        ...noteFilter,
        product: { isService: false },
      },
      include: {
        product: true,
        warehouse: true,
        bin: true,
        invoice: { select: { number: true, id: true } },
      },
      orderBy: [{ documentDate: "desc" }, { createdAt: "desc" }],
      take: filters?.take ?? 200,
    });
  }

  /** Цена за ед. без НДС для оценки запасов / расхода (если в форме цена с НДС). */
  private purchaseNetUnit(
    enteredUnit: Decimal,
    vatRatePct: Decimal,
    pricesIncludeVat: boolean,
  ): Decimal {
    if (!pricesIncludeVat) return enteredUnit;
    const denom = new Decimal(1).add(vatRatePct.div(100));
    return enteredUnit.div(denom);
  }

  async recordPurchase(organizationId: string, dto: PurchaseStockDto) {
    const kind = dto.kind ?? "goods";
    const pricesIncludeVat = Boolean(dto.pricesIncludeVat);
    if (kind === "services") {
      return this.recordServicePurchase(organizationId, dto, pricesIncludeVat);
    }
    if (!dto.warehouseId) {
      throw new BadRequestException(
        "Для закупки товаров укажите склад (warehouseId)",
      );
    }
    return this.recordGoodsPurchase(organizationId, dto, pricesIncludeVat);
  }

  private async recordGoodsPurchase(
    organizationId: string,
    dto: PurchaseStockDto,
    pricesIncludeVat: boolean,
  ) {
    const warehouseId = dto.warehouseId!;
    const wh = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, organizationId },
    });
    if (!wh) throw new NotFoundException("Warehouse not found");

    return this.prisma.$transaction(async (tx) => {
      const documentDate = new Date();
      let totalNet = new Decimal(0);
      let totalVat = new Decimal(0);
      let totalGross = new Decimal(0);

      for (let lineIndex = 0; lineIndex < dto.lines.length; lineIndex++) {
        const line = dto.lines[lineIndex];
        const p = await tx.product.findFirst({
          where: { id: line.productId, organizationId },
        });
        if (!p) {
          throw new NotFoundException(`Product ${line.productId} not found`);
        }
        if (p.isService) {
          throw new BadRequestException(
            `Строка ${lineIndex + 1}: услуга не может быть оприходована на склад; выберите тип закупки «Услуги»`,
          );
        }
        const qty = new Decimal(line.quantity);
        const grossUnit = new Decimal(line.unitPrice);
        const vatRate = new Decimal(p.vatRate ?? 0);
        const netUnit = this.purchaseNetUnit(grossUnit, vatRate, pricesIncludeVat);
        const lineNet = qty.mul(netUnit);
        const lineGross = pricesIncludeVat ? qty.mul(grossUnit) : lineNet;
        const lineVat = lineGross.sub(lineNet);
        totalNet = totalNet.add(lineNet);
        totalVat = totalVat.add(lineVat);
        totalGross = totalGross.add(lineGross);

        if (line.binId) {
          const bin = await tx.warehouseBin.findFirst({
            where: { id: line.binId, organizationId, warehouseId },
            select: { id: true },
          });
          if (!bin) {
            throw new BadRequestException(
              `Bin ${line.binId} not found for selected warehouse`,
            );
          }
        }

        const existing = await tx.stockItem.findUnique({
          where: {
            organizationId_warehouseId_productId: {
              organizationId,
              warehouseId,
              productId: line.productId,
            },
          },
        });

        let newQty: Decimal;
        let newAvg: Decimal;
        if (!existing || existing.quantity.lte(0)) {
          newQty = qty;
          newAvg = netUnit;
        } else {
          const q0 = existing.quantity;
          const c0 = existing.averageCost;
          const sumCost = q0.mul(c0).add(qty.mul(netUnit));
          newQty = q0.add(qty);
          newAvg = sumCost.div(newQty);
        }

        await tx.stockItem.upsert({
          where: {
            organizationId_warehouseId_productId: {
              organizationId,
              warehouseId,
              productId: line.productId,
            },
          },
          create: {
            organizationId,
            warehouseId,
            productId: line.productId,
            ...(line.binId ? { binId: line.binId } : {}),
            quantity: newQty,
            averageCost: newAvg,
          },
          update: {
            quantity: newQty,
            averageCost: newAvg,
            ...(line.binId ? { binId: line.binId } : {}),
          },
        });

        await tx.stockMovement.create({
          data: {
            organizationId,
            warehouseId,
            productId: line.productId,
            type: StockMovementType.IN,
            reason: StockMovementReason.PURCHASE,
            quantity: qty,
            price: netUnit,
            binId: line.binId ?? null,
            note: dto.reference ?? null,
            documentDate,
          },
        });
      }

      const lines =
        totalVat.gt(0) && pricesIncludeVat
          ? [
              {
                accountCode: INVENTORY_GOODS_ACCOUNT_CODE,
                debit: totalNet.toString(),
                credit: 0,
              },
              {
                accountCode: VAT_INPUT_ACCOUNT_CODE,
                debit: totalVat.toString(),
                credit: 0,
              },
              {
                accountCode: PAYABLE_SUPPLIERS_ACCOUNT_CODE,
                debit: 0,
                credit: totalGross.toString(),
              },
            ]
          : [
              {
                accountCode: INVENTORY_GOODS_ACCOUNT_CODE,
                debit: totalNet.toString(),
                credit: 0,
              },
              {
                accountCode: PAYABLE_SUPPLIERS_ACCOUNT_CODE,
                debit: 0,
                credit: totalGross.toString(),
              },
            ];

      await this.accounting.postJournalInTransaction(tx, {
        organizationId,
        date: documentDate,
        reference: dto.reference ?? "PURCHASE",
        description: pricesIncludeVat
          ? "Закупка товара на склад (цены с НДС)"
          : "Закупка товара на склад",
        counterpartyId: dto.counterpartyId ?? null,
        lines,
      });

      return {
        totalAmount: totalGross.toString(),
        netAmount: totalNet.toString(),
        vatAmount: totalVat.toString(),
        lines: dto.lines.length,
      };
    });
  }

  /** Закупка услуг: кредиторка 531, расход 731; без движений по складу. */
  private async recordServicePurchase(
    organizationId: string,
    dto: PurchaseStockDto,
    pricesIncludeVat: boolean,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const documentDate = new Date();
      let totalNet = new Decimal(0);
      let totalVat = new Decimal(0);
      let totalGross = new Decimal(0);

      for (let lineIndex = 0; lineIndex < dto.lines.length; lineIndex++) {
        const line = dto.lines[lineIndex];
        const p = await tx.product.findFirst({
          where: { id: line.productId, organizationId },
        });
        if (!p) {
          throw new NotFoundException(`Product ${line.productId} not found`);
        }
        if (!p.isService) {
          throw new BadRequestException(
            `Строка ${lineIndex + 1}: для закупки услуг выберите номенклатуру-услугу (isService)`,
          );
        }
        const qty = new Decimal(line.quantity);
        const grossUnit = new Decimal(line.unitPrice);
        const vatRate = new Decimal(p.vatRate ?? 0);
        const netUnit = this.purchaseNetUnit(grossUnit, vatRate, pricesIncludeVat);
        const lineNet = qty.mul(netUnit);
        const lineGross = pricesIncludeVat ? qty.mul(grossUnit) : lineNet;
        const lineVat = lineGross.sub(lineNet);
        totalNet = totalNet.add(lineNet);
        totalVat = totalVat.add(lineVat);
        totalGross = totalGross.add(lineGross);
      }

      const lines =
        totalVat.gt(0) && pricesIncludeVat
          ? [
              {
                accountCode: MISC_OPERATING_EXPENSE_ACCOUNT_CODE,
                debit: totalNet.toString(),
                credit: 0,
              },
              {
                accountCode: VAT_INPUT_ACCOUNT_CODE,
                debit: totalVat.toString(),
                credit: 0,
              },
              {
                accountCode: PAYABLE_SUPPLIERS_ACCOUNT_CODE,
                debit: 0,
                credit: totalGross.toString(),
              },
            ]
          : [
              {
                accountCode: MISC_OPERATING_EXPENSE_ACCOUNT_CODE,
                debit: totalNet.toString(),
                credit: 0,
              },
              {
                accountCode: PAYABLE_SUPPLIERS_ACCOUNT_CODE,
                debit: 0,
                credit: totalGross.toString(),
              },
            ];

      await this.accounting.postJournalInTransaction(tx, {
        organizationId,
        date: documentDate,
        reference: dto.reference ?? "PURCHASE_SVC",
        description: pricesIncludeVat
          ? "Закупка услуги (цены с НДС)"
          : "Закупка услуги",
        counterpartyId: dto.counterpartyId ?? null,
        lines,
      });

      return {
        totalAmount: totalGross.toString(),
        netAmount: totalNet.toString(),
        vatAmount: totalVat.toString(),
        lines: dto.lines.length,
      };
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

    const fromW = await this.prisma.warehouse.findFirst({
      where: { id: dto.fromWarehouseId, organizationId },
    });
    const toW = await this.prisma.warehouse.findFirst({
      where: { id: dto.toWarehouseId, organizationId },
    });
    if (!fromW || !toW) throw new NotFoundException("Warehouse not found");

    const prod = await this.prisma.product.findFirst({
      where: { id: dto.productId, organizationId },
      select: { isService: true },
    });
    if (!prod) throw new NotFoundException("Product not found");
    if (prod.isService) {
      throw new BadRequestException("Service products cannot be transferred on stock");
    }

    const qty = new Decimal(dto.quantity);
    const batch = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const documentDate = new Date();
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
      if (avail.lt(qty)) {
        throw new BadRequestException("Недостаточно товара для перемещения");
      }

      const unitOut = await this.stock.computeIssueUnitCost(
        tx,
        organizationId,
        dto.fromWarehouseId,
        dto.productId,
        qty,
        avgFrom,
        avgFrom,
      );

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
          ? unitOut
          : qDst0.mul(cDst0).add(qty.mul(unitOut)).div(qDst1);

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
          price: unitOut,
          transferBatchId: batch,
          note: "TRANSFER_OUT",
          documentDate,
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
          price: unitOut,
          transferBatchId: batch,
          note: "TRANSFER_IN",
          documentDate,
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

    const saleDocumentDate = inv.recognizedAt ?? inv.createdAt;

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

      const prod = await tx.product.findFirst({
        where: { id: pid, organizationId },
        select: { isService: true },
      });
      if (prod?.isService) {
        continue;
      }

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
      const fallbackPrice = new Decimal(line.unitPrice);
      const unitCost = await this.stock.computeIssueUnitCost(
        tx,
        organizationId,
        whId,
        pid,
        need,
        avg,
        fallbackPrice.gt(0) ? fallbackPrice : avg,
      );

      if (avail.lt(need)) {
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
          documentDate: saleDocumentDate,
        },
      });
    }

    if (totalCogs.gt(0)) {
      await this.accounting.postJournalInTransaction(tx, {
        organizationId,
        date: saleDocumentDate,
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
    const documentDate = new Date();
    const qty = new Decimal(dto.quantity);
    const wh = await tx.warehouse.findFirst({
      where: { id: dto.warehouseId, organizationId },
    });
    if (!wh) throw new NotFoundException("Warehouse not found");

    const product = await tx.product.findFirst({
      where: { id: dto.productId, organizationId },
    });
    if (!product) throw new NotFoundException("Product not found");
    if (product.isService) {
      throw new BadRequestException("Service products cannot be adjusted on stock");
    }

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
      const unit = await this.stock.computeIssueUnitCost(
        tx,
        organizationId,
        dto.warehouseId,
        dto.productId,
        qty,
        avg,
        avg,
      );
      const amount = qty.mul(unit);
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
          averageCost: unit,
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
          price: unit,
          note: "INV_ADJ_OUT",
          documentDate,
        },
      });

      if (amount.gt(0)) {
        await this.accounting.postJournalInTransaction(tx, {
          organizationId,
          date: documentDate,
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
        documentDate,
      },
    });

    const amount = qty.mul(unit);
    if (amount.gt(0)) {
      await this.accounting.postJournalInTransaction(tx, {
        organizationId,
        date: documentDate,
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

  async listInventoryAdjustments(
    organizationId: string,
    warehouseId?: string,
  ) {
    return this.prisma.inventoryAdjustment.findMany({
      where: {
        organizationId,
        ...(warehouseId ? { warehouseId } : {}),
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: {
        warehouse: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
    });
  }

  async getInventoryAdjustment(organizationId: string, id: string) {
    const row = await this.prisma.inventoryAdjustment.findFirst({
      where: { id, organizationId },
      include: {
        warehouse: {
          select: { id: true, name: true, inventoryAccountCode: true },
        },
        lines: {
          orderBy: { createdAt: "asc" },
          include: {
            product: { select: { id: true, name: true, sku: true, isService: true } },
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException("Inventory adjustment not found");
    }
    return row;
  }

  async createInventoryAdjustment(
    organizationId: string,
    dto: CreateInventoryAdjustmentDto,
  ) {
    const wh = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, organizationId },
      select: { id: true },
    });
    if (!wh) throw new NotFoundException("Warehouse not found");

    const productIds = dto.lines.map((l) => l.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException("Duplicate productId in lines");
    }

    const products = await this.prisma.product.findMany({
      where: { organizationId, id: { in: productIds } },
      select: { id: true, isService: true },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException("One or more products not found");
    }
    if (products.some((p) => p.isService)) {
      throw new BadRequestException("Service products cannot be adjusted on stock");
    }

    const date = new Date(dto.date);

    return this.prisma.$transaction(async (tx) => {
      const lineCreates: Prisma.InventoryAdjustmentLineCreateWithoutAdjustmentInput[] =
        [];

      for (const line of dto.lines) {
        const stock = await tx.stockItem.findUnique({
          where: {
            organizationId_warehouseId_productId: {
              organizationId,
              warehouseId: dto.warehouseId,
              productId: line.productId,
            },
          },
          select: { quantity: true },
        });
        const expected = stock?.quantity ?? new Decimal(0);
        const actual = new Decimal(line.actualQuantity);
        const delta = actual.sub(expected);
        const unitCost =
          line.unitCost != null ? new Decimal(line.unitCost) : new Decimal(0);
        if (unitCost.lt(0)) {
          throw new BadRequestException("unitCost must be >= 0");
        }
        lineCreates.push({
          product: { connect: { id: line.productId } },
          expectedQuantity: expected,
          actualQuantity: actual,
          deltaQuantity: delta,
          unitCost,
        });
      }

      return tx.inventoryAdjustment.create({
        data: {
          organization: { connect: { id: organizationId } },
          warehouse: { connect: { id: dto.warehouseId } },
          date,
          status: InventoryAdjustmentStatus.DRAFT,
          reason: dto.reason?.trim() ?? "",
          docType: dto.docType,
          lines: { create: lineCreates },
        },
        include: {
          warehouse: {
            select: { id: true, name: true, inventoryAccountCode: true },
          },
          lines: {
            orderBy: { createdAt: "asc" },
            include: {
              product: { select: { id: true, name: true, sku: true, isService: true } },
            },
          },
        },
      });
    });
  }

  /**
   * Проведение документа физической инвентаризации / списания / оприходования:
   * движения склада + одна сводная проводка (731/201 при недостаче, 201/631 при излишке).
   * Списание по FIFO: {@link StockService.computeIssueUnitCost}.
   */
  async postAdjustment(
    organizationId: string,
    id: string,
    actingUserId: string,
    actingUserRole: UserRole,
  ) {
    assertMayPostManualJournal(actingUserRole);
    await this.access.assertMayPostAccounting(actingUserId, organizationId);

    const draft = await this.prisma.inventoryAdjustment.findFirst({
      where: { id, organizationId, status: InventoryAdjustmentStatus.DRAFT },
      include: {
        warehouse: {
          select: { id: true, name: true, inventoryAccountCode: true },
        },
        lines: {
          include: {
            product: { select: { id: true, isService: true } },
          },
        },
      },
    });
    if (!draft) {
      throw new NotFoundException("Draft inventory adjustment not found");
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const closed = getClosedPeriodKeys(org?.settings);
    const periodKey = monthKeyUtc(draft.date);
    if (closed.includes(periodKey)) {
      throw new BadRequestException(
        `Период ${periodKey} закрыт: проведение документа недоступно`,
      );
    }

    return this.prisma.$transaction((tx) =>
      this.postAdjustmentInTransaction(tx, organizationId, draft),
    );
  }

  private async postAdjustmentInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    draft: {
      id: string;
      date: Date;
      warehouseId: string;
      docType: InventoryAdjustmentDocType;
      warehouse: { id: string; name: string; inventoryAccountCode: string };
      lines: Array<{
        id: string;
        productId: string;
        actualQuantity: Decimal;
        product: { isService: boolean };
      }>;
    },
  ) {
    const documentDate = new Date(
      Date.UTC(
        draft.date.getUTCFullYear(),
        draft.date.getUTCMonth(),
        draft.date.getUTCDate(),
        12,
        0,
        0,
        0,
      ),
    );

    const org = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const allowNeg = !!parseInventorySettings(org?.settings).allowNegativeStock;

    const invAcc =
      draft.warehouse.inventoryAccountCode === "204"
        ? FINISHED_GOODS_ACCOUNT_CODE
        : INVENTORY_GOODS_ACCOUNT_CODE;

    const eps = new Decimal("0.0001");
    let surplusTotal = new Decimal(0);
    let shortageTotal = new Decimal(0);

    type WorkLine = {
      lineId: string;
      productId: string;
      expected: Decimal;
      actual: Decimal;
      delta: Decimal;
    };

    const work: WorkLine[] = [];

    for (const line of draft.lines) {
      if (line.product.isService) {
        throw new BadRequestException(
          `Product ${line.productId} is a service; remove from document`,
        );
      }
      const existing = await tx.stockItem.findUnique({
        where: {
          organizationId_warehouseId_productId: {
            organizationId,
            warehouseId: draft.warehouseId,
            productId: line.productId,
          },
        },
      });
      const expected = existing?.quantity ?? new Decimal(0);
      const actual = new Decimal(line.actualQuantity ?? 0);
      if (actual.lt(0)) {
        throw new BadRequestException("actualQuantity must be >= 0");
      }
      const delta = actual.sub(expected);
      work.push({ lineId: line.id, productId: line.productId, expected, actual, delta });
    }

    if (draft.docType === InventoryAdjustmentDocType.WRITE_OFF) {
      if (work.some((w) => w.delta.gt(eps))) {
        throw new BadRequestException(
          "WRITE_OFF: все строки должны иметь разницу ≤ 0 (только недостача)",
        );
      }
    }
    if (draft.docType === InventoryAdjustmentDocType.SURPLUS) {
      if (work.some((w) => w.delta.lt(eps.neg()))) {
        throw new BadRequestException(
          "SURPLUS: все строки должны иметь разницу ≥ 0 (только излишек)",
        );
      }
    }

    for (const w of work) {
      if (w.delta.abs().lt(eps)) {
        await tx.inventoryAdjustmentLine.update({
          where: { id: w.lineId },
          data: {
            expectedQuantity: w.expected,
            actualQuantity: w.actual,
            deltaQuantity: w.delta,
            unitCost: new Decimal(0),
          },
        });
        continue;
      }

      if (w.delta.gt(0)) {
        const qtyAbs = w.delta;
        const existing = await tx.stockItem.findUnique({
          where: {
            organizationId_warehouseId_productId: {
              organizationId,
              warehouseId: draft.warehouseId,
              productId: w.productId,
            },
          },
        });
        const q0 = existing?.quantity ?? new Decimal(0);
        const c0 = existing?.averageCost ?? new Decimal(0);
        const lineRow = await tx.inventoryAdjustmentLine.findUnique({
          where: { id: w.lineId },
          select: { unitCost: true },
        });
        const inputUnit =
          lineRow?.unitCost && new Decimal(lineRow.unitCost).gt(0)
            ? new Decimal(lineRow.unitCost)
            : c0;
        const amount = qtyAbs.mul(inputUnit);
        surplusTotal = surplusTotal.add(amount);

        const q1 = q0.add(qtyAbs);
        const c1 =
          q1.lte(0)
            ? new Decimal(0)
            : q0.lte(0)
              ? inputUnit
              : q0.mul(c0).add(qtyAbs.mul(inputUnit)).div(q1);

        await tx.stockItem.upsert({
          where: {
            organizationId_warehouseId_productId: {
              organizationId,
              warehouseId: draft.warehouseId,
              productId: w.productId,
            },
          },
          create: {
            organizationId,
            warehouseId: draft.warehouseId,
            productId: w.productId,
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
            warehouseId: draft.warehouseId,
            productId: w.productId,
            type: StockMovementType.IN,
            reason: StockMovementReason.ADJUSTMENT,
            quantity: qtyAbs,
            price: inputUnit,
            note: `INV_PHYS:${draft.id}`,
            documentDate,
          },
        });

        await tx.inventoryAdjustmentLine.update({
          where: { id: w.lineId },
          data: {
            expectedQuantity: w.expected,
            actualQuantity: w.actual,
            deltaQuantity: w.delta,
            unitCost: inputUnit,
          },
        });
      } else {
        const qtyAbs = w.delta.abs();
        const existing = await tx.stockItem.findUnique({
          where: {
            organizationId_warehouseId_productId: {
              organizationId,
              warehouseId: draft.warehouseId,
              productId: w.productId,
            },
          },
        });
        const avail = existing?.quantity ?? new Decimal(0);
        const avg = existing?.averageCost ?? new Decimal(0);
        if (avail.lt(qtyAbs) && !allowNeg) {
          throw new BadRequestException(
            `Недостаточно товара для списания (product ${w.productId})`,
          );
        }
        const unit = await this.stock.computeIssueUnitCost(
          tx,
          organizationId,
          draft.warehouseId,
          w.productId,
          qtyAbs,
          avg,
          avg,
        );
        const amount = qtyAbs.mul(unit);
        shortageTotal = shortageTotal.add(amount);

        const qNew = avail.sub(qtyAbs);

        await tx.stockItem.upsert({
          where: {
            organizationId_warehouseId_productId: {
              organizationId,
              warehouseId: draft.warehouseId,
              productId: w.productId,
            },
          },
          create: {
            organizationId,
            warehouseId: draft.warehouseId,
            productId: w.productId,
            quantity: qNew,
            averageCost: unit,
          },
          update: {
            quantity: qNew,
          },
        });

        await tx.stockMovement.create({
          data: {
            organizationId,
            warehouseId: draft.warehouseId,
            productId: w.productId,
            type: StockMovementType.OUT,
            reason: StockMovementReason.ADJUSTMENT,
            quantity: qtyAbs,
            price: unit,
            note: `INV_PHYS:${draft.id}`,
            documentDate,
          },
        });

        await tx.inventoryAdjustmentLine.update({
          where: { id: w.lineId },
          data: {
            expectedQuantity: w.expected,
            actualQuantity: w.actual,
            deltaQuantity: w.delta,
            unitCost: unit,
          },
        });
      }
    }

    const glLines: Array<{
      accountCode: string;
      debit: string | number;
      credit: string | number;
    }> = [
      ...(surplusTotal.gt(0)
        ? [
            { accountCode: invAcc, debit: surplusTotal.toString(), credit: 0 },
            {
              accountCode: INVENTORY_SURPLUS_INCOME_ACCOUNT_CODE,
              debit: 0,
              credit: surplusTotal.toString(),
            },
          ]
        : []),
      ...(shortageTotal.gt(0)
        ? [
            {
              accountCode: MISC_OPERATING_EXPENSE_ACCOUNT_CODE,
              debit: shortageTotal.toString(),
              credit: 0,
            },
            { accountCode: invAcc, debit: 0, credit: shortageTotal.toString() },
          ]
        : []),
    ];

    if (glLines.length) {
      await this.accounting.postJournalInTransaction(tx, {
        organizationId,
        date: documentDate,
        reference: `INV-PHYS-${draft.id}`,
        description: `Инвентаризация / корректировка остатков (${draft.warehouse.name})`,
        isFinal: true,
        lines: glLines,
      });
    }

    await tx.inventoryAdjustment.update({
      where: { id: draft.id },
      data: { status: InventoryAdjustmentStatus.POSTED },
    });

    return tx.inventoryAdjustment.findFirstOrThrow({
      where: { id: draft.id, organizationId },
      include: {
        warehouse: {
          select: { id: true, name: true, inventoryAccountCode: true },
        },
        lines: {
          orderBy: { createdAt: "asc" },
          include: {
            product: { select: { id: true, name: true, sku: true, isService: true } },
          },
        },
      },
    });
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
