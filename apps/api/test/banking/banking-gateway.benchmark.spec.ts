import { BankingGatewayService } from "../../src/banking/banking-gateway.service";

describe("BankingGatewayService benchmark: circuit breaker under 100+ load", () => {
  it("opens circuit and short-circuits 120 concurrent requests", async () => {
    const adapter = {
      getBalances: jest.fn().mockRejectedValue(new Error("provider down")),
    };
    const providers = {
      getProvider: jest.fn().mockReturnValue(adapter),
    };
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          settings: {
            bankingDirect: {
              primaryProvider: "abb",
              abb: { enabled: true },
              pasha: { enabled: false },
              kapital: { enabled: false },
            },
          },
        }),
      },
    };
    const audit = { logOrganizationSystemEvent: jest.fn().mockResolvedValue(undefined) };
    const svc = new BankingGatewayService(
      prisma as any,
      providers as any,
      audit as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await svc.getBalances("org-1");
    await svc.getBalances("org-1");
    await svc.getBalances("org-1");

    const started = Date.now();
    const runs = await Promise.all(
      Array.from({ length: 120 }, () => svc.getBalances("org-1")),
    );
    const elapsedMs = Date.now() - started;

    expect(adapter.getBalances).toHaveBeenCalledTimes(3);
    expect(runs).toHaveLength(120);
    expect(runs.every((r) => r.providers[0]?.error != null)).toBe(true);
    expect(elapsedMs).toBeLessThan(2000);
  });
});
