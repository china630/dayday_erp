import { Test } from "@nestjs/testing";
import {
  Decimal,
  StockMovementReason,
  StockMovementType,
} from "@dayday/database";
import { AccountingService } from "../../src/accounting/accounting.service";
import { ManufacturingService } from "../../src/manufacturing/manufacturing.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { StockService } from "../../src/stock/stock.service";

describe("ManufacturingService.releaseProduction (M9 stress: 18 components)", () => {
  it("performs 18 component OUT movements inside a single $transaction", async () => {
    const lines = Array.from({ length: 18 }, (_, i) => ({
      componentProductId: `comp-${i}`,
      quantityPerUnit: new Decimal(1),
      wasteFactor: new Decimal(0),
    }));

    const outCreates: { type: StockMovementType; productId: string }[] = [];

    const tx = {
      stockItem: {
        findUnique: jest.fn().mockResolvedValue({
          quantity: new Decimal(1_000_000),
          averageCost: new Decimal(1),
        }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      stockMovement: {
        create: jest.fn(async ({ data }: { data: { type: StockMovementType; productId: string } }) => {
          outCreates.push({ type: data.type, productId: data.productId });
          return { id: `mov-${outCreates.length}` };
        }),
      },
    };

    const prisma = {
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({ id: "wh-1" }),
      },
      productRecipe: {
        findFirst: jest.fn().mockResolvedValue({
          id: "recipe-1",
          organizationId: "org-1",
          finishedProductId: "fin-1",
          lines,
          byproducts: [],
          finishedProduct: { name: "Finished Good" },
        }),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;

    const stock = {
      computeIssueUnitCost: jest.fn().mockResolvedValue(new Decimal(1)),
    } as unknown as StockService;

    const accounting = {
      postJournalInTransaction: jest.fn().mockResolvedValue(undefined),
    } as unknown as AccountingService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ManufacturingService,
        { provide: PrismaService, useValue: prisma },
        { provide: StockService, useValue: stock },
        { provide: AccountingService, useValue: accounting },
      ],
    }).compile();

    const mfg = moduleRef.get(ManufacturingService);

    await mfg.releaseProduction("org-1", {
      recipeId: "recipe-1",
      quantity: 1,
      warehouseId: "wh-1",
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const outs = outCreates.filter((x) => x.type === StockMovementType.OUT);
    expect(outs).toHaveLength(18);
    expect(new Set(outs.map((x) => x.productId)).size).toBe(18);
    const ins = outCreates.filter((x) => x.type === StockMovementType.IN);
    expect(ins).toHaveLength(1);
    expect(ins[0].productId).toBe("fin-1");
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: StockMovementType.OUT,
          reason: StockMovementReason.MANUFACTURING,
        }),
      }),
    );
    expect(accounting.postJournalInTransaction).toHaveBeenCalledTimes(1);
  });
});
