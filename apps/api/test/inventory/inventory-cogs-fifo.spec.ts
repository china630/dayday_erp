import { BadRequestException } from "@nestjs/common";
import {
  InventoryValuationMethod,
  Prisma,
  StockMovementType,
} from "@dayday/database";
import { InventoryService } from "../../src/inventory/inventory.service";
import { StockService } from "../../src/stock/stock.service";

describe("Inventory COGS / FIFO hardening", () => {
  it("FIFO: purchase layers -> partial sale -> COGS journal amount is correct", async () => {
    const tx = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: "inv-1",
          number: "INV-001",
          inventorySettled: false,
          recognizedAt: null,
          createdAt: new Date("2026-04-10T00:00:00.000Z"),
          warehouseId: "wh-1",
          items: [
            {
              productId: "p-1",
              quantity: new Prisma.Decimal(3),
              unitPrice: new Prisma.Decimal(15),
            },
          ],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          id: "org-1",
          valuationMethod: InventoryValuationMethod.FIFO,
        }),
      },
      stockItem: {
        findUnique: jest.fn().mockResolvedValue({
          quantity: new Prisma.Decimal(5),
          averageCost: new Prisma.Decimal(11),
        }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      stockMovement: {
        findMany: jest.fn().mockResolvedValue([
          {
            type: StockMovementType.IN,
            quantity: new Prisma.Decimal(2),
            price: new Prisma.Decimal(10),
          },
          {
            type: StockMovementType.IN,
            quantity: new Prisma.Decimal(3),
            price: new Prisma.Decimal(12),
          },
        ]),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      organization: { findUnique: jest.fn() },
      warehouse: { findFirst: jest.fn() },
    } as any;
    const accounting = {
      postJournalInTransaction: jest.fn().mockResolvedValue({ transactionId: "tx-1" }),
    } as any;
    const stock = new StockService(prisma);
    const access = { assertMayPostAccounting: jest.fn() } as any;
    const service = new InventoryService(prisma, accounting, stock, access);

    await service.postSaleInventoryInTransaction(tx as any, "org-1", "inv-1");

    expect(accounting.postJournalInTransaction).toHaveBeenCalled();
    const [, params] = (accounting.postJournalInTransaction as jest.Mock).mock.calls[0];
    const debit701 = Number(params.lines[0].debit);
    const credit201 = Number(params.lines[1].credit);
    expect(params.lines[0].accountCode).toBe("701");
    expect(params.lines[1].accountCode).toBe("201");
    expect(debit701).toBeCloseTo(32, 6);
    expect(credit201).toBeCloseTo(32, 6);
  });

  it("transfer blocks negative inventory strictly", async () => {
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ id: "org-1" }) },
      warehouse: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: "w1" })
          .mockResolvedValueOnce({ id: "w2" }),
      },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
        fn({
          stockItem: {
            findUnique: jest.fn().mockResolvedValue({
              quantity: new Prisma.Decimal(1),
              averageCost: new Prisma.Decimal(5),
            }),
          },
        }),
      ),
    } as any;
    const access = { assertMayPostAccounting: jest.fn() } as any;
    const service = new InventoryService(
      prisma,
      { postJournalInTransaction: jest.fn() } as any,
      { computeIssueUnitCost: jest.fn() } as any,
      access,
    );

    await expect(
      service.transferStock("org-1", {
        fromWarehouseId: "w1",
        toWarehouseId: "w2",
        productId: "p1",
        quantity: 2,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("AVCO: COGS uses weighted average stock cost", async () => {
    const tx = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: "inv-2",
          number: "INV-002",
          inventorySettled: false,
          recognizedAt: null,
          createdAt: new Date("2026-04-12T00:00:00.000Z"),
          warehouseId: "wh-1",
          items: [
            {
              productId: "p-1",
              quantity: new Prisma.Decimal(3),
              unitPrice: new Prisma.Decimal(15),
            },
          ],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          id: "org-1",
          valuationMethod: InventoryValuationMethod.AVCO,
          settings: { inventory: { inventoryValuation: "AVCO" } },
        }),
      },
      stockItem: {
        findUnique: jest.fn().mockResolvedValue({
          quantity: new Prisma.Decimal(10),
          averageCost: new Prisma.Decimal(8),
        }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      stockMovement: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      organization: { findUnique: jest.fn() },
      warehouse: { findFirst: jest.fn() },
    } as any;
    const accounting = {
      postJournalInTransaction: jest.fn().mockResolvedValue({ transactionId: "tx-2" }),
    } as any;
    const stock = new StockService(prisma);
    const access = { assertMayPostAccounting: jest.fn() } as any;
    const service = new InventoryService(prisma, accounting, stock, access);

    await service.postSaleInventoryInTransaction(tx as any, "org-1", "inv-2");

    const [, params] = (accounting.postJournalInTransaction as jest.Mock).mock.calls[0];
    const debit701 = Number(params.lines[0].debit);
    const credit201 = Number(params.lines[1].credit);
    expect(debit701).toBeCloseTo(24, 6);
    expect(credit201).toBeCloseTo(24, 6);
  });
});
