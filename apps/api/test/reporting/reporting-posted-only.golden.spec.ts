import { Prisma } from "@dayday/database";
import { LedgerType } from "@dayday/database";
import { ReportingService } from "../../src/reporting/reporting.service";
import type { PrismaService } from "../../src/prisma/prisma.service";

describe("ReportingService golden: posted-only trial balance", () => {
  it("uses only posted journal entries and keeps Dr=Cr", async () => {
    const prisma = {
      account: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "a1",
            code: "101",
            nameAz: "Nağd",
            nameRu: "Cash",
            nameEn: "Cash",
            type: "ASSET",
          },
          {
            id: "a2",
            code: "601",
            nameAz: "Gəlir",
            nameRu: "Revenue",
            nameEn: "Revenue",
            type: "REVENUE",
          },
        ]),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ settings: {} }),
      },
      journalEntry: {
        groupBy: jest
          .fn()
          .mockImplementationOnce(({ where }) => {
            expect(where.transaction).toMatchObject({ isFinal: true });
            // Golden fixture: posted-only movement Dr 100 / Cr 100.
            return Promise.resolve([
              {
                accountId: "a1",
                _sum: { debit: new Prisma.Decimal(100), credit: new Prisma.Decimal(0) },
              },
              {
                accountId: "a2",
                _sum: { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(100) },
              },
            ]);
          })
          .mockImplementationOnce(({ where }) => {
            expect(where.transaction).toMatchObject({ isFinal: true });
            return Promise.resolve([]);
          }),
      },
    } as unknown as PrismaService;

    const svc = new ReportingService(
      prisma,
      {} as never,
      { get: jest.fn() } as never,
    );

    const out = await svc.trialBalance(
      "org-1",
      "2026-04-01",
      "2026-04-30",
      LedgerType.NAS,
    );

    const rows = out.rows as Array<{ periodDebit: string; periodCredit: string }>;
    const totalPeriodDr = rows.reduce(
      (s, r) => s + Number(r.periodDebit),
      0,
    );
    const totalPeriodCr = rows.reduce(
      (s, r) => s + Number(r.periodCredit),
      0,
    );
    expect(totalPeriodDr).toBe(100);
    expect(totalPeriodCr).toBe(100);
    expect(totalPeriodDr).toBe(totalPeriodCr);
    expect(prisma.journalEntry.groupBy).toHaveBeenCalledTimes(2);
  });
});
