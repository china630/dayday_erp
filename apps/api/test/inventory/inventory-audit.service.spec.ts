import { ForbiddenException } from "@nestjs/common";
import {
  Decimal,
  InventoryAuditStatus,
  UserRole,
} from "@dayday/database";
import { InventoryAuditService } from "../../src/inventory/inventory-audit.service";
import type { InventoryService } from "../../src/inventory/inventory.service";
import type { PrismaService } from "../../src/prisma/prisma.service";

describe("InventoryAuditService", () => {
  const orgId = "00000000-0000-0000-0000-000000000001";
  const wh1 = "10000000-0000-0000-0000-000000000001";
  const wh2 = "10000000-0000-0000-0000-000000000002";
  const p1 = "20000000-0000-0000-0000-000000000001";
  const p2 = "20000000-0000-0000-0000-000000000002";

  const baseApprovedDto = {
    date: "2026-04-03",
    status: InventoryAuditStatus.APPROVED,
    items: [
      {
        warehouseId: wh1,
        productId: p1,
        factQty: 5,
        inventoryAccountCode: "201" as const,
      },
      {
        warehouseId: wh2,
        productId: p2,
        factQty: 5,
        inventoryAccountCode: "201" as const,
      },
    ],
  };

  it("APPROVED: проводит опись — вызывает adjustStockInTransaction по строкам с расхождениями и создаёт документ", async () => {
    const adjustStockInTransaction = jest
      .fn()
      .mockResolvedValue({ type: "OUT" as const, amount: "25" });
    const inventory = {
      adjustStockInTransaction,
    } as unknown as InventoryService;

    const mockTx = {
      stockItem: {
        findFirst: jest.fn().mockResolvedValue({
          quantity: new Decimal(10),
          averageCost: new Decimal(5),
        }),
      },
      inventoryAudit: {
        create: jest.fn().mockResolvedValue({
          id: "audit-1",
          status: InventoryAuditStatus.APPROVED,
        }),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof mockTx) => Promise<unknown>) =>
        fn(mockTx),
      ),
      inventoryAudit: {
        create: jest.fn(),
      },
    } as unknown as PrismaService;

    const svc = new InventoryAuditService(prisma, inventory);

    await svc.create(orgId, baseApprovedDto, UserRole.ACCOUNTANT);

    expect(adjustStockInTransaction).toHaveBeenCalledTimes(2);
    expect(mockTx.inventoryAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: InventoryAuditStatus.APPROVED,
          organizationId: orgId,
        }),
      }),
    );
  });

  it("APPROVED: при ошибке корректировки на второй строке откатывает транзакцию — документ не создаётся", async () => {
    const adjustStockInTransaction = jest
      .fn()
      .mockResolvedValueOnce({ type: "OUT" as const, amount: "25" })
      .mockRejectedValueOnce(new Error("stock fail"));
    const inventory = {
      adjustStockInTransaction,
    } as unknown as InventoryService;

    const mockTx = {
      stockItem: {
        findFirst: jest.fn().mockResolvedValue({
          quantity: new Decimal(10),
          averageCost: new Decimal(5),
        }),
      },
      inventoryAudit: {
        create: jest.fn().mockResolvedValue({ id: "should-not" }),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof mockTx) => Promise<unknown>) =>
        fn(mockTx),
      ),
      inventoryAudit: {
        create: jest.fn(),
      },
    } as unknown as PrismaService;

    const svc = new InventoryAuditService(prisma, inventory);

    await expect(
      svc.create(orgId, baseApprovedDto, UserRole.ACCOUNTANT),
    ).rejects.toThrow("stock fail");

    expect(adjustStockInTransaction).toHaveBeenCalledTimes(2);
    expect(mockTx.inventoryAudit.create).not.toHaveBeenCalled();
  });

  it("APPROVED: роль USER не может провести опись (assertMayPostManualJournal)", async () => {
    const adjustStockInTransaction = jest.fn();
    const inventory = {
      adjustStockInTransaction,
    } as unknown as InventoryService;

    const prisma = {
      $transaction: jest.fn(),
      inventoryAudit: { create: jest.fn() },
    } as unknown as PrismaService;

    const svc = new InventoryAuditService(prisma, inventory);

    await expect(
      svc.create(
        orgId,
        {
          date: "2026-04-03",
          status: InventoryAuditStatus.APPROVED,
          items: [],
        },
        UserRole.USER,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(adjustStockInTransaction).not.toHaveBeenCalled();
  });
});
