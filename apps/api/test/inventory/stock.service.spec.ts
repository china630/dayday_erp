import { Decimal } from "@dayday/database";
import {
  INVENTORY_GOODS_ACCOUNT_CODE,
  MISC_OPERATING_EXPENSE_ACCOUNT_CODE,
} from "../../src/ledger.constants";
import { InventoryService } from "../../src/inventory/inventory.service";
import type { AccountingService } from "../../src/accounting/accounting.service";
import type { PrismaService } from "../../src/prisma/prisma.service";

describe("InventoryService (stock / adjust)", () => {
  const orgId = "00000000-0000-0000-0000-000000000001";
  const whId = "00000000-0000-0000-0000-000000000002";
  const prodId = "00000000-0000-0000-0000-000000000003";

  it("списание OUT: уменьшает остаток и создаёт проводку Дт 731 — Кт 201", async () => {
    const journalCalls: Array<{
      lines: Array<{ accountCode: string; debit: unknown; credit: unknown }>;
    }> = [];

    const accounting = {
      postJournalInTransaction: jest.fn(
        async (
          _tx: unknown,
          params: {
            lines: Array<{ accountCode: string; debit: unknown; credit: unknown }>;
          },
        ) => {
          journalCalls.push({ lines: params.lines });
          return { transactionId: "txn-adj-1" };
        },
      ),
    } as unknown as AccountingService;

    const tx = {
      stockItem: {
        findUnique: jest.fn().mockResolvedValue({
          quantity: new Decimal(10),
          averageCost: new Decimal(5),
        }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      stockMovement: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({ id: whId, organizationId: orgId }),
      },
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: prodId, organizationId: orgId }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ settings: {} }),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    } as unknown as PrismaService;

    const svc = new InventoryService(prisma, accounting);

    await svc.adjustStock(orgId, {
      warehouseId: whId,
      productId: prodId,
      quantity: 2,
      type: "OUT",
      inventoryAccountCode: "201",
    });

    expect(tx.stockItem.upsert).toHaveBeenCalled();
    expect(accounting.postJournalInTransaction).toHaveBeenCalledTimes(1);

    const lines = journalCalls[0].lines;
    const dr731 = lines.find(
      (l) => l.accountCode === MISC_OPERATING_EXPENSE_ACCOUNT_CODE,
    );
    const cr201 = lines.find(
      (l) => l.accountCode === INVENTORY_GOODS_ACCOUNT_CODE,
    );
    expect(dr731).toBeDefined();
    expect(cr201).toBeDefined();
    expect(String(dr731?.debit)).toBe("10");
    expect(String(cr201?.credit)).toBe("10");
  });
});
