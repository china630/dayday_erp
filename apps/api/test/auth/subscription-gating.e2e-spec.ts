import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { SubscriptionReadOnlyGuard } from "../../src/subscription/subscription-read-only.guard";
import { PrismaService } from "../../src/prisma/prisma.service";

function mockExecutionContext(
  method: string,
  path: string,
  user?: { organizationId?: string; isSuperAdmin?: boolean },
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        path,
        originalUrl: path,
        user,
      }),
    }),
    getHandler: () => () => undefined,
    getClass: () => class TestController {},
  } as unknown as ExecutionContext;
}

describe("SubscriptionReadOnlyGuard (RC1)", () => {
  let guard: SubscriptionReadOnlyGuard;
  let prisma: {
    organizationSubscription: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      organizationSubscription: { findUnique: jest.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SubscriptionReadOnlyGuard,
        { provide: PrismaService, useValue: prisma },
        Reflector,
      ],
    }).compile();
    guard = moduleRef.get(SubscriptionReadOnlyGuard);
  });

  it("GET проходит при истёкшей подписке", async () => {
    prisma.organizationSubscription.findUnique.mockResolvedValue({
      expiresAt: new Date(0),
      isBlocked: false,
    });
    const ctx = mockExecutionContext("GET", "/api/products", {
      organizationId: "00000000-0000-0000-0000-000000000001",
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it("POST при истёкшем expiresAt → 403 SUBSCRIPTION_READ_ONLY", async () => {
    prisma.organizationSubscription.findUnique.mockResolvedValue({
      expiresAt: new Date(0),
      isBlocked: false,
    });
    const ctx = mockExecutionContext("POST", "/api/products", {
      organizationId: "00000000-0000-0000-0000-000000000001",
    });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "SUBSCRIPTION_READ_ONLY",
      }),
    });
  });

  it("POST при активном expiresAt разрешён", async () => {
    const future = new Date(Date.now() + 30 * 86400_000);
    prisma.organizationSubscription.findUnique.mockResolvedValue({
      expiresAt: future,
      isBlocked: false,
    });
    const ctx = mockExecutionContext("POST", "/api/products", {
      organizationId: "00000000-0000-0000-0000-000000000001",
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});

describe("Регистрация: демо 14 дней (логика как в AuthService.register)", () => {
  it("setUTCDate(+14) от фиксированной даты даёт +14 календарных дней", () => {
    const base = new Date(Date.UTC(2026, 3, 3, 12, 0, 0));
    const demoExpiresAt = new Date(base);
    demoExpiresAt.setUTCDate(demoExpiresAt.getUTCDate() + 14);
    expect(demoExpiresAt.toISOString().slice(0, 10)).toBe("2026-04-17");
  });
});
