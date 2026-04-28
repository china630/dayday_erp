import { AccountingService } from "../../src/accounting/accounting.service";

describe("AccountingService period-close checklist hardening", () => {
  function makeService(overrides?: {
    unresolvedManufacturing?: number;
    brokenJournalLinks?: number;
  }) {
    const prisma = {
      invoice: { count: jest.fn().mockResolvedValue(0) },
      stockItem: { count: jest.fn().mockResolvedValue(0) },
      account: { findMany: jest.fn().mockResolvedValue([]) },
      journalEntry: { groupBy: jest.fn().mockResolvedValue([]) },
      fixedAsset: { count: jest.fn().mockResolvedValue(0) },
      fixedAssetDepreciationMonth: { count: jest.fn().mockResolvedValue(0) },
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          { count: BigInt(overrides?.unresolvedManufacturing ?? 0) },
        ])
        .mockResolvedValueOnce([
          { count: BigInt(overrides?.brokenJournalLinks ?? 0) },
        ]),
    };
    const svc = new AccountingService(prisma as any, {} as any);
    return { svc, prisma };
  }

  it("blocks close when unfinished manufacturing cycles are detected", async () => {
    const { svc } = makeService({ unresolvedManufacturing: 2 });
    const out = await svc.getPeriodCloseChecklist("org-1", "2026-05");

    expect(out.checks.noUnfinishedManufacturingCycles.ok).toBe(false);
    expect(out.checks.noUnfinishedManufacturingCycles.unresolvedCount).toBe(2);
    expect(out.allPassed).toBe(false);
  });

  it("blocks close when broken journal links are detected", async () => {
    const { svc } = makeService({ brokenJournalLinks: 3 });
    const out = await svc.getPeriodCloseChecklist("org-1", "2026-05");

    expect(out.checks.noBrokenJournalLinks.ok).toBe(false);
    expect(out.checks.noBrokenJournalLinks.brokenLinksCount).toBe(3);
    expect(out.allPassed).toBe(false);
  });
});
