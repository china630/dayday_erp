import {
  InventoryAdjustmentDocType,
  InventoryAdjustmentStatus,
  Prisma,
  UserRole,
} from "@dayday/database";
import { InventoryService } from "../../src/inventory/inventory.service";
import { MISC_OPERATING_EXPENSE_ACCOUNT_CODE } from "../../src/ledger.constants";

describe("InventoryService.postAdjustment (physical / write-off)", () => {
  it("WRITE_OFF: uses FIFO issue unit cost for shortage quantity", async () => {
    const computeIssueUnitCost = jest
      .fn()
      .mockResolvedValue(new Prisma.Decimal(8));
    const stock = { computeIssueUnitCost } as any;
    const accounting = {
      postJournalInTransaction: jest.fn().mockResolvedValue({ transactionId: "t1" }),
    } as any;
    const access = {
      assertMayPostAccounting: jest.fn().mockResolvedValue(undefined),
    } as any;

    const lineId = "line-1";
    const prodId = "p-1";
    const draft = {
      id: "adj-1",
      date: new Date("2026-04-15T00:00:00.000Z"),
      warehouseId: "wh-1",
      docType: InventoryAdjustmentDocType.WRITE_OFF,
      warehouse: { id: "wh-1", name: "Main", inventoryAccountCode: "201" },
      lines: [
        {
          id: lineId,
          productId: prodId,
          actualQuantity: new Prisma.Decimal(2),
          product: { isService: false },
        },
      ],
    };

    const existingQty = new Prisma.Decimal(5);
    const tx = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ settings: {} }),
      },
      stockItem: {
        findUnique: jest.fn().mockResolvedValue({
          quantity: existingQty,
          averageCost: new Prisma.Decimal(7),
        }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      stockMovement: { create: jest.fn().mockResolvedValue({}) },
      inventoryAdjustmentLine: { update: jest.fn().mockResolvedValue({}) },
      inventoryAdjustment: {
        update: jest.fn().mockResolvedValue({}),
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: "adj-1",
          status: InventoryAdjustmentStatus.POSTED,
        }),
      },
    };

    const prisma = {
      inventoryAdjustment: {
        findFirst: jest.fn().mockResolvedValue({
          ...draft,
          status: InventoryAdjustmentStatus.DRAFT,
        }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ settings: {} }),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    } as any;

    const service = new InventoryService(prisma, accounting, stock, access);
    await service.postAdjustment("org-1", "adj-1", "user-1", UserRole.ACCOUNTANT);

    expect(computeIssueUnitCost).toHaveBeenCalledWith(
      tx,
      "org-1",
      "wh-1",
      prodId,
      expect.any(Prisma.Decimal),
      expect.any(Prisma.Decimal),
      expect.any(Prisma.Decimal),
    );
    const qtyArg = computeIssueUnitCost.mock.calls[0][4] as Prisma.Decimal;
    expect(qtyArg.toNumber()).toBeCloseTo(3, 4);

    expect(accounting.postJournalInTransaction).toHaveBeenCalledTimes(1);
    const [, params] = (accounting.postJournalInTransaction as jest.Mock).mock.calls[0];
    const dr731 = params.lines.find(
      (l: { accountCode: string }) =>
        l.accountCode === MISC_OPERATING_EXPENSE_ACCOUNT_CODE,
    );
    expect(Number(dr731.debit)).toBeCloseTo(24, 4);
  });
});
