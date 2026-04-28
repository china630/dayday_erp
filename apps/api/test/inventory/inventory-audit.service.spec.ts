import { BadRequestException, ForbiddenException } from "@nestjs/common";
import {
  Decimal,
  InventoryAuditStatus,
  UserRole,
} from "@dayday/database";
import { InventoryAuditService } from "../../src/inventory/inventory-audit.service";
import type { AccountingService } from "../../src/accounting/accounting.service";
import type { PrismaService } from "../../src/prisma/prisma.service";
import type { AccessControlService } from "../../src/access/access-control.service";

describe("InventoryAuditService", () => {
  const orgId = "00000000-0000-0000-0000-000000000001";
  const wh1 = "10000000-0000-0000-0000-000000000001";
  const p1 = "20000000-0000-0000-0000-000000000001";

  const draftDto = {
    date: "2026-04-03",
    warehouseId: wh1,
    status: InventoryAuditStatus.DRAFT,
  };

  it("DRAFT: создаёт опись и строки по складским остаткам (без услуг)", async () => {
    const mockTx = {
      inventoryAudit: {
        create: jest.fn().mockResolvedValue({ id: "audit-1" }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "audit-1",
          lines: [],
          warehouse: {},
        }),
      },
      stockItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            productId: p1,
            quantity: new Decimal(3),
            averageCost: new Decimal("2.5"),
            product: { id: p1, isService: false },
          },
        ]),
      },
      inventoryAuditLine: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const prisma = {
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({ id: wh1 }),
      },
      $transaction: jest.fn(async (fn: (t: typeof mockTx) => Promise<unknown>) =>
        fn(mockTx),
      ),
    } as unknown as PrismaService;

    const accounting = {
      postJournalInTransaction: jest.fn(),
    } as unknown as AccountingService;
    const access = {
      assertMayPostAccounting: jest.fn(),
    } as unknown as AccessControlService;

    const svc = new InventoryAuditService(prisma, accounting, access);

    await svc.create(orgId, draftDto, UserRole.USER);

    expect(prisma.warehouse.findFirst).toHaveBeenCalledWith({
      where: { id: wh1, organizationId: orgId },
      select: { id: true },
    });
    expect(mockTx.inventoryAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: orgId,
          warehouseId: wh1,
          status: InventoryAuditStatus.DRAFT,
        }),
      }),
    );
    expect(mockTx.inventoryAuditLine.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          organizationId: orgId,
          inventoryAuditId: "audit-1",
          productId: p1,
          systemQty: new Decimal(3),
          factQty: new Decimal(3),
          costPrice: new Decimal("2.5"),
        }),
      ],
    });
    expect(accounting.postJournalInTransaction).not.toHaveBeenCalled();
  });

  it("create: статус APPROVED запрещён — нужен черновик и approveDraft", async () => {
    const prisma = {
      warehouse: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    } as unknown as PrismaService;

    const accounting = {
      postJournalInTransaction: jest.fn(),
    } as unknown as AccountingService;
    const access = {
      assertMayPostAccounting: jest.fn(),
    } as unknown as AccessControlService;

    const svc = new InventoryAuditService(prisma, accounting, access);

    await expect(
      svc.create(
        orgId,
        {
          ...draftDto,
          status: InventoryAuditStatus.APPROVED,
        },
        UserRole.ACCOUNTANT,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("approveDraft: роль USER не может провести опись", async () => {
    const prisma = {
      inventoryAudit: {
        findFirst: jest.fn().mockResolvedValue({
          id: "a1",
          date: new Date("2026-04-03"),
          warehouseId: wh1,
          warehouse: { inventoryAccountCode: "201", name: "WH" },
          lines: [],
        }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ settings: {} }),
      },
      $transaction: jest.fn(),
    } as unknown as PrismaService;

    const accounting = {
      postJournalInTransaction: jest.fn(),
    } as unknown as AccountingService;
    const access = {
      assertMayPostAccounting: jest.fn(),
    } as unknown as AccessControlService;

    const svc = new InventoryAuditService(prisma, accounting, access);

    await expect(
      svc.approveDraft(
        orgId,
        "a1",
        "30000000-0000-0000-0000-000000000001",
        UserRole.USER,
      ),
    ).rejects.toThrow(
      ForbiddenException,
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("approveDraft: период закрыт — проведение отклоняется до транзакции", async () => {
    const prisma = {
      inventoryAudit: {
        findFirst: jest.fn().mockResolvedValue({
          id: "a1",
          date: new Date("2026-04-03T12:00:00.000Z"),
          warehouseId: wh1,
          warehouse: { inventoryAccountCode: "201", name: "WH" },
          lines: [],
        }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          settings: {
            reporting: { closedPeriods: ["2026-04"] },
          },
        }),
      },
      $transaction: jest.fn(),
    } as unknown as PrismaService;

    const accounting = {
      postJournalInTransaction: jest.fn(),
    } as unknown as AccountingService;
    const access = {
      assertMayPostAccounting: jest.fn().mockResolvedValue(undefined),
    } as unknown as AccessControlService;

    const svc = new InventoryAuditService(prisma, accounting, access);

    await expect(
      svc.approveDraft(
        orgId,
        "a1",
        "30000000-0000-0000-0000-000000000001",
        UserRole.ACCOUNTANT,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(accounting.postJournalInTransaction).not.toHaveBeenCalled();
  });

  it("approveDraft: PROCUREMENT получает 403 (AccessControlService)", async () => {
    const prisma = {
      inventoryAudit: {
        findFirst: jest.fn().mockResolvedValue({
          id: "a1",
          date: new Date("2026-04-03T12:00:00.000Z"),
          warehouseId: wh1,
          warehouse: { inventoryAccountCode: "201", name: "WH" },
          lines: [],
        }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ settings: {} }),
      },
      $transaction: jest.fn(),
    } as unknown as PrismaService;

    const accounting = {
      postJournalInTransaction: jest.fn(),
    } as unknown as AccountingService;
    const access = {
      assertMayPostAccounting: jest
        .fn()
        .mockRejectedValue(new ForbiddenException("ACCOUNTING_ROLE_REQUIRED")),
    } as unknown as AccessControlService;

    const svc = new InventoryAuditService(prisma, accounting, access);

    await expect(
      svc.approveDraft(
        orgId,
        "a1",
        "30000000-0000-0000-0000-000000000001",
        UserRole.PROCUREMENT,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
