import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma, StockMovementType } from "@dayday/database";
import { OpeningBalancesService } from "../../src/migration/opening-balances.service";
import type { AccountingService, PostTransactionLine } from "../../src/accounting/accounting.service";
import type { PrismaService } from "../../src/prisma/prisma.service";

describe("OpeningBalancesService (inventory import)", () => {
  const organizationId = "00000000-0000-0000-0000-000000000001";
  const productId = "10000000-0000-0000-0000-000000000001";
  const warehouseId = "20000000-0000-0000-0000-000000000001";

  it("successful import posts Dr 201/204 -> Cr 000 and creates StockMovement IN", async () => {
    const openingAccount = {
      id: "acc-000",
      code: "000",
      nameAz: "İlkin",
      nameRu: "Opening",
      nameEn: "Opening",
      updatedAt: new Date("2026-04-27T00:00:00.000Z"),
    };
    const createdMoves: unknown[] = [];
    const postedLines: PostTransactionLine[][] = [];

    const tx = {
      account: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.code === "000") return openingAccount;
          return null;
        }),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({
          id: warehouseId,
          name: "Main WH",
          inventoryAccountCode: "201",
        }),
      },
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: productId,
          name: "Widget",
        }),
      },
      stockItem: {
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
      },
      stockMovement: {
        create: jest.fn().mockImplementation(({ data }) => {
          createdMoves.push(data);
          return data;
        }),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (trx: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;
    const accounting = {
      validateBalance: jest.fn(),
      postJournalInTransaction: jest
        .fn()
        .mockImplementation(async (_tx, params: { lines: PostTransactionLine[] }) => {
          postedLines.push(params.lines);
          return { transactionId: "tx-1" };
        }),
    } as unknown as AccountingService;

    const service = new OpeningBalancesService(prisma, accounting);
    const out = await service.importInventory(organizationId, [
      {
        productId,
        warehouseId,
        quantity: 10,
        costPrice: 25,
      },
    ]);

    expect(out.created).toBe(1);
    expect(out.transactionIds).toEqual(["tx-1"]);
    expect(accounting.validateBalance).toHaveBeenCalledTimes(1);
    expect(postedLines[0]).toEqual([
      { accountCode: "201", debit: "250", credit: 0 },
      { accountCode: "000", debit: 0, credit: "250" },
    ]);
    expect(createdMoves).toHaveLength(1);
    expect((createdMoves[0] as { type: StockMovementType }).type).toBe(StockMovementType.IN);
  });

  it("optimistic locking conflict returns 409 Conflict", async () => {
    const openingAccount = {
      id: "acc-000",
      code: "000",
      nameAz: "İlkin",
      nameRu: "Opening",
      nameEn: "Opening",
      updatedAt: new Date("2026-04-27T00:00:00.000Z"),
    };
    const tx = {
      account: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.code === "000") return openingAccount;
          return null;
        }),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({
          id: warehouseId,
          name: "Main WH",
          inventoryAccountCode: "201",
        }),
      },
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: productId,
          name: "Widget",
        }),
      },
      stockItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: "si-1",
          quantity: new Prisma.Decimal(1),
          averageCost: new Prisma.Decimal(10),
          updatedAt: new Date("2026-04-27T00:00:00.000Z"),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn(),
      },
      stockMovement: {
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (trx: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;
    const accounting = {
      validateBalance: jest.fn(),
      postJournalInTransaction: jest.fn(),
    } as unknown as AccountingService;

    const service = new OpeningBalancesService(prisma, accounting);
    await expect(
      service.importInventory(organizationId, [
        {
          productId,
          warehouseId,
          quantity: 10,
          costPrice: 25,
        },
      ]),
    ).rejects.toThrow(ConflictException);
    expect(accounting.postJournalInTransaction).not.toHaveBeenCalled();
  });

  it("validateBalance blocks transaction on math imbalance", async () => {
    const openingAccount = {
      id: "acc-000",
      code: "000",
      nameAz: "İlkin",
      nameRu: "Opening",
      nameEn: "Opening",
      updatedAt: new Date("2026-04-27T00:00:00.000Z"),
    };
    const tx = {
      account: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.code === "000") return openingAccount;
          return null;
        }),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({
          id: warehouseId,
          name: "Main WH",
          inventoryAccountCode: "201",
        }),
      },
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: productId,
          name: "Widget",
        }),
      },
      stockItem: {
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
      },
      stockMovement: {
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (trx: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;
    const accounting = {
      validateBalance: jest.fn().mockImplementation(() => {
        throw new BadRequestException("Unbalanced transaction");
      }),
      postJournalInTransaction: jest.fn(),
    } as unknown as AccountingService;

    const service = new OpeningBalancesService(prisma, accounting);
    await expect(
      service.importInventory(organizationId, [
        {
          productId,
          warehouseId,
          quantity: 10,
          costPrice: 25,
        },
      ]),
    ).rejects.toThrow(BadRequestException);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(accounting.postJournalInTransaction).not.toHaveBeenCalled();
  });
});
