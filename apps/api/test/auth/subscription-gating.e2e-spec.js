"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const testing_1 = require("@nestjs/testing");
const subscription_read_only_guard_1 = require("../../src/subscription/subscription-read-only.guard");
const prisma_service_1 = require("../../src/prisma/prisma.service");
function mockExecutionContext(method, path, user) {
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
        getClass: () => class TestController {
        },
    };
}
describe("SubscriptionReadOnlyGuard (RC1)", () => {
    let guard;
    let prisma;
    beforeEach(async () => {
        prisma = {
            organizationSubscription: { findUnique: jest.fn() },
        };
        const moduleRef = await testing_1.Test.createTestingModule({
            providers: [
                subscription_read_only_guard_1.SubscriptionReadOnlyGuard,
                { provide: prisma_service_1.PrismaService, useValue: prisma },
                core_1.Reflector,
            ],
        }).compile();
        guard = moduleRef.get(subscription_read_only_guard_1.SubscriptionReadOnlyGuard);
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
//# sourceMappingURL=subscription-gating.e2e-spec.js.map