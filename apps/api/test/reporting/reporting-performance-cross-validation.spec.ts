import { Prisma } from "@dayday/database";
import { LedgerType } from "@dayday/database";
import { ReportingService } from "../../src/reporting/reporting.service";

describe("ReportingService performance and cross-validation", () => {
  it("trialBalance processes 10k+ rows and keeps period balanced", async () => {
    const accounts = Array.from({ length: 10000 }, (_, i) => ({
      id: `a-${i}`,
      code: `${1000 + i}`,
      nameAz: `AZ ${i}`,
      nameRu: `RU ${i}`,
      nameEn: `EN ${i}`,
      type: i % 2 === 0 ? "ASSET" : "LIABILITY",
    }));
    const periodAgg = accounts.map((a, i) => ({
      accountId: a.id,
      _sum: {
        debit: i % 2 === 0 ? new Prisma.Decimal(1) : new Prisma.Decimal(0),
        credit: i % 2 === 0 ? new Prisma.Decimal(0) : new Prisma.Decimal(1),
      },
    }));

    const prisma = {
      account: { findMany: jest.fn().mockResolvedValue(accounts) },
      organization: { findUnique: jest.fn().mockResolvedValue({ settings: {} }) },
      journalEntry: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce(periodAgg)
          .mockResolvedValueOnce([]),
      },
    } as any;

    const svc = new ReportingService(prisma, {} as never, { get: jest.fn() } as never);
    const out = await svc.trialBalance(
      "org-1",
      "2026-01-01",
      "2026-12-31",
      LedgerType.NAS,
    );

    expect(out.rows).toHaveLength(10000);
    expect(out.totals?.balanced).toBe(true);
    expect(out.performance?.accountRows).toBe(10000);
  });

  it("profitAndLoss returns cross-validation status against trial balance proxy", async () => {
    const plAccounts = [
      { id: "a601", code: "601", type: "REVENUE", nameAz: "", nameRu: "", nameEn: "" },
      { id: "a701", code: "701", type: "EXPENSE", nameAz: "", nameRu: "", nameEn: "" },
      { id: "a721", code: "721", type: "EXPENSE", nameAz: "", nameRu: "", nameEn: "" },
      { id: "a662", code: "662", type: "REVENUE", nameAz: "", nameRu: "", nameEn: "" },
    ];

    const prisma = {
      account: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(plAccounts)
          .mockResolvedValueOnce(plAccounts),
      },
      department: { findFirst: jest.fn().mockResolvedValue(null) },
      organization: { findUnique: jest.fn().mockResolvedValue({ settings: {} }) },
      journalEntry: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([
            {
              accountId: "a601",
              _sum: { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(1000) },
            },
            {
              accountId: "a701",
              _sum: { debit: new Prisma.Decimal(200), credit: new Prisma.Decimal(0) },
            },
            {
              accountId: "a721",
              _sum: { debit: new Prisma.Decimal(300), credit: new Prisma.Decimal(0) },
            },
            {
              accountId: "a662",
              _sum: { debit: new Prisma.Decimal(50), credit: new Prisma.Decimal(0) },
            },
          ])
          .mockResolvedValueOnce([
            {
              accountId: "a601",
              _sum: { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(1000) },
            },
            {
              accountId: "a701",
              _sum: { debit: new Prisma.Decimal(200), credit: new Prisma.Decimal(0) },
            },
            {
              accountId: "a721",
              _sum: { debit: new Prisma.Decimal(300), credit: new Prisma.Decimal(0) },
            },
            {
              accountId: "a662",
              _sum: { debit: new Prisma.Decimal(50), credit: new Prisma.Decimal(0) },
            },
          ])
          .mockResolvedValueOnce([]),
      },
    } as any;

    const svc = new ReportingService(prisma, {} as never, { get: jest.fn() } as never);
    const out = await svc.profitAndLoss(
      "org-1",
      "2026-05-01",
      "2026-05-31",
      LedgerType.NAS,
    );

    expect(out.crossValidation?.ok).toBe(true);
    expect(out.crossValidation?.delta).toBe("0.0000");
  });
});
