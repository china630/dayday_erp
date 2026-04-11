import { BadRequestException } from "@nestjs/common";
import { LedgerType } from "@dayday/database";
import { AccountingService } from "../../src/accounting/accounting.service";
import type { PrismaService } from "../../src/prisma/prisma.service";

describe("AccountingService", () => {
  const orgId = "00000000-0000-0000-0000-000000000001";
  const acc101 = {
    id: "a101",
    organizationId: orgId,
    code: "101",
    ledgerType: LedgerType.NAS,
  };
  const acc201 = {
    id: "a201",
    organizationId: orgId,
    code: "201",
    ledgerType: LedgerType.NAS,
  };

  function makeTxMock(overrides?: {
    settings?: Record<string, unknown>;
  }) {
    const tx = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          settings: overrides?.settings ?? {},
        }),
      },
      account: {
        findMany: jest.fn().mockResolvedValue([acc101, acc201]),
      },
      transaction: {
        create: jest.fn().mockResolvedValue({ id: "txn-1" }),
      },
      journalEntry: {
        create: jest.fn().mockResolvedValue({}),
      },
      accountMapping: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    return tx;
  }

  it("postTransaction: создаёт сбалансированную проводку", async () => {
    const tx = makeTxMock();
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    } as unknown as PrismaService;

    const svc = new AccountingService(prisma);
    const date = new Date(Date.UTC(2025, 5, 10, 12, 0, 0, 0));

    const out = await svc.postTransaction({
      organizationId: orgId,
      date,
      reference: "T-1",
      lines: [
        { accountCode: "101", debit: "100", credit: 0 },
        { accountCode: "201", debit: 0, credit: "100" },
      ],
    });

    expect(out.transactionId).toBe("txn-1");
    expect(tx.transaction.create).toHaveBeenCalled();
    expect(tx.journalEntry.create).toHaveBeenCalledTimes(2);
  });

  it("postTransaction: отклоняет разбаланс", async () => {
    const prisma = {
      $transaction: jest.fn(async (fn: (t: object) => Promise<unknown>) =>
        fn({}),
      ),
    } as unknown as PrismaService;

    const svc = new AccountingService(prisma);
    const date = new Date(Date.UTC(2025, 5, 10, 12, 0, 0, 0));

    await expect(
      svc.postTransaction({
        organizationId: orgId,
        date,
        lines: [
          { accountCode: "101", debit: "100", credit: 0 },
          { accountCode: "201", debit: 0, credit: "50" },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("postTransaction: блокирует проводку в закрытом периоде", async () => {
    const tx = makeTxMock({
      settings: {
        reporting: { closedPeriods: ["2025-06"] },
      },
    });
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    } as unknown as PrismaService;

    const svc = new AccountingService(prisma);
    const date = new Date(Date.UTC(2025, 5, 15, 12, 0, 0, 0));

    await expect(
      svc.postTransaction({
        organizationId: orgId,
        date,
        lines: [
          { accountCode: "101", debit: "10", credit: 0 },
          { accountCode: "201", debit: 0, credit: "10" },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
