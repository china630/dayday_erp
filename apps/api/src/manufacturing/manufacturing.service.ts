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
        byproducts: { include: { product: true } },
      },
      orderBy: { finishedProduct: { name: "asc" } },
    });
  }

  async getRecipeByFinishedProduct(organizationId: string, finishedProductId: string) {
    const r = await this.prisma.productRecipe.findFirst({
      where: { organizationId, finishedProductId },
      include: {
        lines: { include: { component: true } },
        byproducts: { include: { product: true } },
        finishedProduct: true,
      },
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
    if (dto.byproducts?.length) {
      const uniqueBy = new Set(dto.byproducts.map((l) => l.productId));
      if (uniqueBy.size !== dto.byproducts.length) {
        throw new BadRequestException("Дублирующийся byproduct в рецепте");
      }
      for (const b of dto.byproducts) {
        if (b.productId === dto.finishedProductId) {
          throw new BadRequestException("Byproduct не может совпадать с готовой продукцией");
        }
        const bp = await this.prisma.product.findFirst({
          where: { id: b.productId, organizationId },
        });
        if (!bp) {
          throw new NotFoundException(`Byproduct ${b.productId} not found`);
        }
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
      await tx.productRecipeByproduct.deleteMany({ where: { recipeId: recipe.id } });
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
      for (const by of dto.byproducts ?? []) {
        await tx.productRecipeByproduct.create({
          data: {
            recipeId: recipe.id,
            productId: by.productId,
            quantityPerUnit: new Decimal(by.quantityPerUnit),
            costFactor:
              by.costFactor != null && Number.isFinite(by.costFactor)
                ? new Decimal(by.costFactor)
                : new Decimal(0),
          },
        });
      }

      return tx.productRecipe.findFirstOrThrow({
        where: { id: recipe.id },
        include: {
          lines: { include: { component: true } },
          byproducts: { include: { product: true } },
          finishedProduct: true,
        },
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
    const wh = dto.warehouseId
      ? await this.prisma.warehouse.findFirst({
          where: { id: dto.warehouseId, organizationId },
        })
      : await this.prisma.warehouse.findFirst({
          where: { organizationId },
          orderBy: { createdAt: "asc" },
        });
    if (!wh) throw new NotFoundException("Warehouse not found");

    const recipe = await this.prisma.productRecipe.findFirst({
      where: {
        organizationId,
        id: dto.recipeId,
      },
      include: { lines: true, byproducts: true, finishedProduct: true },
    });
    if (!recipe || recipe.lines.length === 0) {
      throw new BadRequestException("Спецификация для готовой продукции не найдена");
    }

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
              warehouseId: wh.id,
              productId: line.componentProductId,
            },
          },
        });
        const avail = si?.quantity ?? new Decimal(0);
        const avg = si?.averageCost ?? new Decimal(0);
        if (avail.lt(need)) {
          throw new BadRequestException(
            `Недостаточно компонента ${line.componentProductId} на складе`,
          );
        }
        const unit = await this.stock.computeIssueUnitCost(
          tx,
          organizationId,
          wh.id,
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
              warehouseId: wh.id,
              productId: line.componentProductId,
            },
          },
          create: {
            organizationId,
            warehouseId: wh.id,
            productId: line.componentProductId,
            quantity: newQty,
            averageCost: avg,
          },
          update: { quantity: newQty },
        });

        await tx.stockMovement.create({
          data: {
            organizationId,
            warehouseId: wh.id,
            productId: line.componentProductId,
            type: StockMovementType.OUT,
            reason: StockMovementReason.MANUFACTURING,
            quantity: need,
            price: unit,
            note: `MFG_OUT ${recipe.finishedProductId}`,
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
            warehouseId: wh.id,
            productId: recipe.finishedProductId,
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
            warehouseId: wh.id,
            productId: recipe.finishedProductId,
          },
        },
        create: {
          organizationId,
          warehouseId: wh.id,
          productId: recipe.finishedProductId,
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
          warehouseId: wh.id,
          productId: recipe.finishedProductId,
          type: StockMovementType.IN,
          reason: StockMovementReason.MANUFACTURING,
          quantity: batchQty,
          price: unitCost,
          note: "MFG_IN",
          documentDate,
        },
      });

      for (const by of recipe.byproducts) {
        const byQty = new Decimal(by.quantityPerUnit).mul(batchQty);
        if (byQty.lte(0)) continue;
        const byCostFactor = new Decimal(by.costFactor ?? 0);
        const byTotalCost = roundMoney2(totalMaterial.mul(byCostFactor));
        const byUnitCost =
          byQty.gt(0) ? roundMoney2(byTotalCost.div(byQty)) : new Decimal(0);

        const bySi = await tx.stockItem.findUnique({
          where: {
            organizationId_warehouseId_productId: {
              organizationId,
              warehouseId: wh.id,
              productId: by.productId,
            },
          },
        });
        const bq0 = bySi?.quantity ?? new Decimal(0);
        const bc0 = bySi?.averageCost ?? new Decimal(0);
        const bq1 = bq0.add(byQty);
        const bc1 =
          bq1.lte(0)
            ? new Decimal(0)
            : bq0.lte(0)
              ? byUnitCost
              : roundMoney2(bq0.mul(bc0).add(byQty.mul(byUnitCost)).div(bq1));

        await tx.stockItem.upsert({
          where: {
            organizationId_warehouseId_productId: {
              organizationId,
              warehouseId: wh.id,
              productId: by.productId,
            },
          },
          create: {
            organizationId,
            warehouseId: wh.id,
            productId: by.productId,
            quantity: bq1,
            averageCost: bc1,
          },
          update: {
            quantity: bq1,
            averageCost: bc1,
          },
        });

        await tx.stockMovement.create({
          data: {
            organizationId,
            warehouseId: wh.id,
            productId: by.productId,
            type: StockMovementType.IN,
            reason: StockMovementReason.MANUFACTURING,
            quantity: byQty,
            price: byUnitCost,
            note: "MFG_BYPRODUCT_IN",
            documentDate,
          },
        });
      }

      // Дт 204 / Кт 201; IFRS — через translateToIFRS при маппингах 204 и 201.
      await this.accounting.postJournalInTransaction(tx, {
        organizationId,
        date: documentDate,
        reference: `MFG-${recipe.id.slice(0, 8)}`,
        description: `Выпуск готовой продукции ${recipe.finishedProduct.name}, ${batchQty.toString()} ед.`,
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
        recipeId: recipe.id,
        finishedProductId: recipe.finishedProductId,
        warehouseId: wh.id,
        totalMaterialCost: totalMaterial.toString(),
        unitCost: unitCost.toString(),
        quantity: batchQty.toString(),
        byproducts: recipe.byproducts.map((b) => ({
          productId: b.productId,
          quantity: new Decimal(b.quantityPerUnit).mul(batchQty).toString(),
          costFactor: String(b.costFactor),
        })),
      };
    });
  }
}
