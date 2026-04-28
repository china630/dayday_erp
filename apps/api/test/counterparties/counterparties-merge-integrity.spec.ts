import { CounterpartiesService } from "../../src/counterparties/counterparties.service";

describe("CounterpartiesService.scanMergeIntegrity (M3/M4)", () => {
  function svc(prisma: object) {
    return new CounterpartiesService(
      prisma as ConstructorParameters<typeof CounterpartiesService>[0],
      {} as ConstructorParameters<typeof CounterpartiesService>[1],
      {} as ConstructorParameters<typeof CounterpartiesService>[2],
    );
  }

  it("ok when no rows reference deleted counterparty", async () => {
    const prisma = {
      invoice: { count: jest.fn().mockResolvedValue(0) },
      transaction: { count: jest.fn().mockResolvedValue(0) },
      cashOrder: { count: jest.fn().mockResolvedValue(0) },
    };
    const out = await svc(prisma).scanMergeIntegrity("org-1", "dead-cp-id");
    expect(out.ok).toBe(true);
    expect(out.counts).toEqual({ invoices: 0, transactions: 0, cashOrders: 0 });
  });

  it("not ok when dangling invoice ref remains", async () => {
    const prisma = {
      invoice: { count: jest.fn().mockResolvedValue(1) },
      transaction: { count: jest.fn().mockResolvedValue(0) },
      cashOrder: { count: jest.fn().mockResolvedValue(0) },
    };
    const out = await svc(prisma).scanMergeIntegrity("org-1", "dead-cp-id");
    expect(out.ok).toBe(false);
    expect(out.counts.invoices).toBe(1);
  });
});
