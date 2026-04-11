"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_tenant_extension_1 = require("../../src/prisma/prisma-tenant.extension");
describe("Tenant isolation (Prisma extension)", () => {
    const orgA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    it("findUnique: условие по id дополняется organizationId текущего тенанта", () => {
        expect((0, prisma_tenant_extension_1.mergeWhere)({ id: "inv-1" }, orgA)).toEqual({
            AND: [{ organizationId: orgA }, { id: "inv-1" }],
        });
    });
    it("findMany: пустой where становится фильтром только по organizationId", () => {
        expect((0, prisma_tenant_extension_1.mergeWhere)(undefined, orgA)).toEqual({ organizationId: orgA });
    });
    it("другой organizationId в запросе не отменяет принудительный тенант (AND)", () => {
        const w = (0, prisma_tenant_extension_1.mergeWhere)({ id: "x", organizationId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }, orgA);
        expect(w).toEqual({
            AND: [
                { organizationId: orgA },
                { id: "x", organizationId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" },
            ],
        });
    });
});
//# sourceMappingURL=access.spec.js.map