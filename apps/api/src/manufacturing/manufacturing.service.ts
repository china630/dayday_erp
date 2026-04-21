import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Decimal,
  StockMovementReason,
  StockMovementType,
} from "@dayday/database";
import { AccountingService } from "../accounting/accounting.service";
import {
  FINISHED_GOODS_ACCOUNT_CODE,
  INVENTORY_GOODS_ACCOUNT_CODE,
} from "../ledger.constants";
import { PrismaService } from "../prisma/prisma.service";
import { parseInventorySettings } from "../inventory/inventory-settings";
import { StockService } from "../stock/stock.service";
import { ReleaseProductionDto } from "./dto/release-production.dto";
import { UpsertRecipeDto } from "./dto/upsert-recipe.dto";
import { roundMoney2 } from "../fixed-assets/decimal-round";

@Injectable()
export class ManufacturingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly stock: StockService,
  ) {}

  listRecipes(organizationId: string) {
    return this.prisma.productRecipe.findMany({
      where: { organizationId },
      include: {
        finishedProduct: true,
        lines: { include: { component: true } },
      },
      orderBy: { finishedProduct: { name: "asc" } },
    });
  }

  async getRecipeByFinishedProduct(organizationId: string, finishedProductId: string) {
    const r = await this.prisma.productRecipe.findFirst({
      where: { organizationId, finishedProductId },
      include: { lines: { include: { component: true } }, finishedProduct: true },
    });
    if (!r) throw new NotFoundException("Recipe not found");
    return r;
  }

  async upsertRecipe(organizationId: string, dto: UpsertRecipeDto) {
    const finished = await this.prisma.product.findFirst({
      where: { id: dto.finishedProductId, organizationId },
    });
    if (!finished) throw new NotFoundException("Finished product not found");

    for (const line of dto.lines) {
      if (line.componentProductId === dto.finishedProductId) {
        throw new BadRequestException("Готовая продукция не может быть своим компонентом");
      }
      const c = await this.prisma.product.findFirst({
        where: { id: line.componentProductId, organizationId },
      });
      if (!c) {
        throw new NotFoundException(`Component product ${line.componentProductId} not found`);
      }
    }

    const unique = new Set(dto.lines.map((l) => l.componentProductId));
    if (unique.size !== dto.lines.length) {
      throw new BadRequestException("Дублирующийся компонент в рецепте");
    }

    return this.prisma.$transaction(async (tx) => {
      const recipe = await tx.productRecipe.upsert({
        where: { finishedProductId: dto.finishedProductId },
        create: {
          organizationId,
          finishedProductId: dto.finishedProductId,
        },
        update: {},
      });

      await tx.productRecipeLine.deleteMany({ where: { recipeId: recipe.id } });
      for (const line of dto.lines) {
        const wf =
          line.wasteFactor != null && Number.isFinite(line.wasteFactor)
            ? new Decimal(line.wasteFactor)
            : new Decimal(0);
        if (wf.lt(0) || wf.gt(2)) {
          throw new BadRequestException("wasteFactor must be between 0 and 2");
        }
        await tx.productRecipeLine.create({
          data: {
            recipeId: recipe.id,
            componentProductId: line.componentProductId,
            quantityPerUnit: new Decimal(line.quantityPerUnit),
            wasteFactor: wf,
          },
        });
      }

      return tx.productRecipe.findFirstOrThrow({
        where: { id: recipe.id },
        include: { lines: { include: { component: true } }, finishedProduct: true },
      });
    });
  }

  async deleteRecipe(organizationId: string, finishedProductId: string) {
    const r = await this.prisma.productRecipe.findFirst({
      where: { organizationId, finishedProductId },
    });
    if (!r) throw new NotFoundException("Recipe not found");
    await this.prisma.productRecipe.delete({ where: { id: r.id } });
  }

  async releaseProduction(organizationId: string, dto: ReleaseProductionDto) {
    const wh = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, organizationId },
    });
    if (!wh) throw new NotFoundException("Warehouse not found");

    const recipe = await this.prisma.productRecipe.findFirst({
      where: {
        organizationId,
        finishedProductId: dto.finishedProductId,
      },
      include: { lines: true },
    });
    if (!recipe || recipe.lines.length === 0) {
      throw new BadRequestException("Спецификация для готовой продукции не найдена");
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    const allowNeg = !!parseInventorySettings(org?.settings).allowNegativeStock;

    const batchQty = new Decimal(dto.quantity);

    return this.prisma.$transaction(async (tx) => {
      const documentDate = new Date();
      let totalMaterial = new Decimal(0);

      for (const line of recipe.lines) {
        const wf = line.wasteFactor != null ? new Decimal(line.wasteFactor) : new Decimal(0);
        const need = new Decimal(line.quantityPerUnit)
          .mul(new Decimal(1).add(wf))
          .mul(batchQty);
        const si = await tx.stockItem.findUnique({
          where: {
            organizationId_warehouseId_productId: {
              organizationId,
              warehouseId: dto.warehouseId,
              productId: line.componentProductId,
            },
          },
        });
        const avail = si?.quantity ?? new Decimal(0);
        const avg = si?.averageCost ?? new Decimal(0);
        if (avail.lt(need) && !allowNeg) {
          throw new BadRequestException(
            `Недостаточно компонента ${line.componentProductId} на складе`,
          );
        }
        const unit = await this.stock.computeIssueUnitCost(
          tx,
          organizationId,
          dto.warehouseId,
          line.componentProductId,
          need,
          avg,
          avg,
        );
        const lineCost = need.mul(unit);
        totalMaterial = totalMaterial.add(lineCost);
        const newQty = avail.sub(need);

        await tx.stockItem.upsert({
          where: {
            organizationId_warehouseId_productId: {
              organizationId,
              warehouseId: dto.warehouseId,
              productId: line.componentProductId,
            },
          },
          create: {
            organizationId,
            warehouseId: dto.warehouseId,
            productId: line.componentProductId,
            quantity: newQty,
            averageCost: avg,
          },
          update: { quantity: newQty },
        });

        await tx.stockMovement.create({
          data: {
            organizationId,
            warehouseId: dto.warehouseId,
            productId: line.componentProductId,
            type: StockMovementType.OUT,
            reason: StockMovementReason.MANUFACTURING,
            quantity: need,
            price: unit,
            note: `MFG_OUT ${dto.finishedProductId}`,
            documentDate,
          },
        });
      }

      totalMaterial = roundMoney2(totalMaterial);
      const unitCost =
        batchQty.gt(0) ? roundMoney2(totalMaterial.div(batchQty)) : new Decimal(0);

      const finSi = await tx.stockItem.findUnique({
        where: {
          organizationId_warehouseId_productId: {
            organizationId,
            warehouseId: dto.warehouseId,
            productId: dto.finishedProductId,
          },
        },
      });
      const q0 = finSi?.quantity ?? new Decimal(0);
      const c0 = finSi?.averageCost ?? new Decimal(0);
      const q1 = q0.add(batchQty);
      const c1 =
        q1.lte(0)
          ? new Decimal(0)
          : q0.lte(0)
            ? unitCost
            : roundMoney2(q0.mul(c0).add(batchQty.mul(unitCost)).div(q1));

      await tx.stockItem.upsert({
        where: {
          organizationId_warehouseId_productId: {
            organizationId,
            warehouseId: dto.warehouseId,
            productId: dto.finishedProductId,
          },
        },
        create: {
          organizationId,
          warehouseId: dto.warehouseId,
          productId: dto.finishedProductId,
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
          productId: dto.finishedProductId,
          type: StockMovementType.IN,
          reason: StockMovementReason.MANUFACTURING,
          quantity: batchQty,
          price: unitCost,
          note: "MFG_IN",
          documentDate,
        },
      });

      // Дт 204 / Кт 201; IFRS — через translateToIFRS при маппингах 204 и 201.
      await this.accounting.postJournalInTransaction(tx, {
        organizationId,
        date: documentDate,
        reference: `MFG-${dto.finishedProductId.slice(0, 8)}`,
        description: `Выпуск готовой продукции, ${batchQty.toString()} ед.`,
        isFinal: true,
        lines: [
          {
            accountCode: FINISHED_GOODS_ACCOUNT_CODE,
            debit: totalMaterial.toString(),
            credit: 0,
          },
          {
            accountCode: INVENTORY_GOODS_ACCOUNT_CODE,
            debit: 0,
            credit: totalMaterial.toString(),
          },
        ],
      });

      return {
        totalMaterialCost: totalMaterial.toString(),
        unitCost: unitCost.toString(),
        quantity: batchQty.toString(),
      };
    });
  }
}
