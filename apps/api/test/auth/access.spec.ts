import { mergeWhere } from "../../src/prisma/prisma-tenant.extension";

describe("Tenant isolation (Prisma extension)", () => {
  const orgA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  it("findUnique: условие по id дополняется organizationId текущего тенанта", () => {
    expect(mergeWhere({ id: "inv-1" }, orgA)).toEqual({
      AND: [{ organizationId: orgA }, { id: "inv-1" }],
    });
  });

  it("findMany: пустой where становится фильтром только по organizationId", () => {
    expect(mergeWhere(undefined, orgA)).toEqual({ organizationId: orgA });
  });

  it("другой organizationId в запросе не отменяет принудительный тенант (AND)", () => {
    const w = mergeWhere(
      { id: "x", organizationId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" },
      orgA,
    );
    expect(w).toEqual({
      AND: [
        { organizationId: orgA },
        { id: "x", organizationId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" },
      ],
    });
  });
});
