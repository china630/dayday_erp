import { Prisma } from "@dayday/database";
import { OpeningBalancesService } from "../../src/migration/opening-balances.service";
import type { PrismaService } from "../../src/prisma/prisma.service";
import type { AccountingService, PostTransactionLine } from "../../src/accounting/accounting.service";

describe("OpeningBalancesService (finance import)", () => {
  it("posts opening balances and keeps technical account 000 balanced", async () => {
    const organizationId = "00000000-0000-0000-0000-000000000001";
    const openingAccountId = "acc-000";

    const accountByCode = new Map([
      [
        "101",
        {
          id: "acc-101",
          code: "101",
          nameAz: "Nağd",
          nameRu: "Cash",
          nameEn: "Cash",
          updatedAt: new Date("2026-04-27T00:00:00.000Z"),
        },
      ],
      [
        "221",
        {
          id: "acc-221",
          code: "221",
          nameAz: "Bank",
          nameRu: "Bank",
          nameEn: "Bank",
          updatedAt: new Date("2026-04-27T00:00:00.000Z"),
        },
      ],
      [
        "531",
        {
          id: "acc-531",
          code: "531",
          nameAz: "AP",
          nameRu: "AP",
          nameEn: "AP",
          updatedAt: new Date("2026-04-27T00:00:00.000Z"),
        },
      ],
      [
        "000",
        {
          id: openingAccountId,
          code: "000",
          nameAz: "İlkin",
          nameRu: "Opening",
          nameEn: "Opening",
          updatedAt: new Date("2026-04-27T00:00:00.000Z"),
        },
      ],
    ]);

    const postedBatches: PostTransactionLine[][] = [];
    const tx = {
      account: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const code = String(where.code);
          return accountByCode.get(code) ?? null;
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const created = {
            id: openingAccountId,
            code: data.code,
            nameAz: data.nameAz,
            nameRu: data.nameRu,
            nameEn: data.nameEn,
            updatedAt: new Date("2026-04-27T00:00:00.000Z"),
          };
          accountByCode.set("000", created);
          return created;
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (trx: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    } as unknown as PrismaService;

    const accounting = {
      validateBalance: jest.fn(),
      postJournalInTransaction: jest
        .fn()
        .mockImplementation(
          async (_trx, params: { lines: PostTransactionLine[] }) => {
            postedBatches.push(params.lines);
            return { transactionId: `tx-${postedBatches.length}` };
          },
        ),
    } as unknown as AccountingService;

    const service = new OpeningBalancesService(prisma, accounting);
    const result = await service.importFinance(organizationId, [
      {
        accountCode: "101",
        amount: 10_000,
        currency: "AZN",
        date: "2026-04-27",
        description: "Opening cash",
      },
      {
        accountCode: "221",
        amount: 50_000,
        currency: "AZN",
        date: "2026-04-27",
        description: "Opening bank",
      },
      {
        accountCode: "531",
        amount: 15_000,
        currency: "AZN",
        date: "2026-04-27",
        description: "Opening supplier debt",
      },
    ]);

    expect(result.created).toBe(3);
    expect(result.transactionIds).toEqual(["tx-1", "tx-2", "tx-3"]);
    expect(accounting.validateBalance).toHaveBeenCalledTimes(3);

    const techTotals = postedBatches.reduce(
      (acc, lines) => {
        for (const line of lines) {
          if (line.accountCode === "000") {
            acc.debit = acc.debit.add(new Prisma.Decimal(line.debit ?? 0));
            acc.credit = acc.credit.add(new Prisma.Decimal(line.credit ?? 0));
          }
        }
        return acc;
      },
      { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) },
    );

    expect(techTotals.credit.toString()).toBe("60000");
    expect(techTotals.debit.toString()).toBe("15000");

    const grand = postedBatches.reduce(
      (acc, lines) => {
        for (const line of lines) {
          acc.debit = acc.debit.add(new Prisma.Decimal(line.debit ?? 0));
          acc.credit = acc.credit.add(new Prisma.Decimal(line.credit ?? 0));
        }
        return acc;
      },
      { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) },
    );
    expect(grand.debit.equals(grand.credit)).toBe(true);
  });
});
