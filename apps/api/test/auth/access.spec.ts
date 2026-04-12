import {
  mergeWhere,
  mergeWhereForUnique,
} from "../../src/prisma/prisma-tenant.extension";

describe("Tenant isolation (Prisma extension)", () => {
  const orgA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  describe("mergeWhere (findMany / count / …)", () => {
    it("условие по id оборачивается в AND с organizationId тенанта", () => {
      expect(mergeWhere({ id: "inv-1" }, orgA)).toEqual({
        AND: [{ organizationId: orgA }, { id: "inv-1" }],
      });
    });

    it("пустой where становится фильтром только по organizationId", () => {
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

  describe("mergeWhereForUnique (findUnique / findFirst / update / …)", () => {
    it("плоский merge: id + organizationId тенанта", () => {
      expect(mergeWhereForUnique({ id: "inv-1" }, orgA)).toEqual({
        id: "inv-1",
        organizationId: orgA,
      });
    });

    it("organizationId в where перезаписывается тенантом", () => {
      expect(
        mergeWhereForUnique(
          { organizationId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" },
          orgA,
        ),
      ).toEqual({ organizationId: orgA });
    });

    it("составной уникальный ключ: organizationId только внутри объекта", () => {
      expect(
        mergeWhereForUnique(
          {
            organizationId_moduleKey: {
              organizationId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
              moduleKey: "kassa_pro",
            },
          },
          orgA,
        ),
      ).toEqual({
        organizationId_moduleKey: {
          organizationId: orgA,
          moduleKey: "kassa_pro",
        },
      });
    });
  });
});
