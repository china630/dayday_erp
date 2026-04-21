import { Injectable } from "@nestjs/common";
import {
  InventoryValuationMethod,
  Prisma,
  StockMovementType,
} from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";

type Tx = Prisma.TransactionClient;

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async getValuationMethod(
    tx: Tx | PrismaService,
    organizationId: string,
  ): Promise<InventoryValuationMethod> {
    const org = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { valuationMethod: true },
    });
    return org?.valuationMethod ?? InventoryValuationMethod.AVCO;
  }

  /**
   * Unit cost for issuing `need` units (COGS line): AVCO uses stock snapshot; FIFO replays movements.
   */
  async computeIssueUnitCost(
    tx: Tx,
    organizationId: string,
    warehouseId: string,
    productId: string,
    need: Decimal,
    stockAverageCost: Decimal,
    fallbackUnitPrice: Decimal,
  ): Promise<Decimal> {
    const method = await this.getValuationMethod(tx, organizationId);
    if (method !== InventoryValuationMethod.FIFO) {
      const avg = stockAverageCost.gt(0) ? stockAverageCost : fallbackUnitPrice;
      return avg.gt(0) ? avg : fallbackUnitPrice;
    }
    return this.fifoIssueUnitCost(
      tx,
      organizationId,
      warehouseId,
      productId,
      need,
      stockAverageCost.gt(0) ? stockAverageCost : fallbackUnitPrice,
    );
  }

  private async fifoIssueUnitCost(
    tx: Tx,
    organizationId: string,
    warehouseId: string,
    productId: string,
    need: Decimal,
    fallback: Decimal,
  ): Promise<Decimal> {
    if (need.lte(0)) {
      return fallback;
    }

    const movements = await tx.stockMovement.findMany({
      where: { organizationId, warehouseId, productId },
      orderBy: [{ documentDate: "asc" }, { createdAt: "asc" }],
      select: { type: true, quantity: true, price: true },
    });

    type Layer = { qty: Decimal; price: Decimal };
    const layers: Layer[] = [];

    for (const m of movements) {
      const q = new Decimal(m.quantity);
      const p = new Decimal(m.price);
      if (m.type === StockMovementType.IN) {
        layers.push({ qty: q, price: p });
      } else {
        let rem = q;
        while (rem.gt(0) && layers.length > 0) {
          const top = layers[0];
          const take = Decimal.min(rem, top.qty);
          top.qty = top.qty.sub(take);
          rem = rem.sub(take);
          if (top.qty.lte(0)) {
            layers.shift();
          }
        }
      }
    }

    let remNeed = need;
    let totalCost = new Decimal(0);
    const consumable = layers.map((l) => ({ qty: l.qty, price: l.price }));
    while (remNeed.gt(0) && consumable.length > 0) {
      const top = consumable[0];
      const take = Decimal.min(remNeed, top.qty);
      totalCost = totalCost.add(take.mul(top.price));
      top.qty = top.qty.sub(take);
      remNeed = remNeed.sub(take);
      if (top.qty.lte(0)) {
        consumable.shift();
      }
    }
    if (remNeed.gt(0)) {
      totalCost = totalCost.add(remNeed.mul(fallback));
    }
    return need.gt(0) ? totalCost.div(need) : fallback;
  }
}
