import { ForbiddenException } from "@nestjs/common";
import { Prisma } from "@dayday/database";
import { getTenantContext } from "./tenant-context";

/**
 * Связь пользователь ↔ организация: запросы идут по `userId` (все компании пользователя)
 * или по явному `organizationId`. Автоподмешивание JWT-организации ломает
 * `findMany({ where: { userId } })` и `create` членства для новой организации в транзакции.
 */
const EXCLUDED_FROM_TENANT_AUTO_FILTER = new Set(["OrganizationMembership"]);

/** Модели со скалярным organizationId (динамически из Prisma DMMF). */
function tenantModelNames(): Set<string> {
  const names = Prisma.dmmf.datamodel.models
    .filter((m) =>
      m.fields.some(
        (f) =>
          f.name === "organizationId" &&
          f.kind === "scalar" &&
          (f.type === "String" || f.type === "String?"),
      ),
    )
    .map((m) => m.name)
    .filter((n) => !EXCLUDED_FROM_TENANT_AUTO_FILTER.has(n));
  return new Set(names);
}

const TENANT_MODELS = tenantModelNames();

/** Экспорт для unit-тестов изоляции тенанта (см. test/auth/access.spec.ts). */
export function mergeWhere(where: unknown, orgId: string): Record<string, unknown> {
  if (where == null || typeof where !== "object") {
    return { organizationId: orgId };
  }
  const w = where as Record<string, unknown>;
  return { AND: [{ organizationId: orgId }, w] };
}

function requireOrgOrSkip(): string | null {
  const ctx = getTenantContext();
  if (!ctx) {
    return null;
  }
  if (ctx.skipTenantFilter) {
    return null;
  }
  if (!ctx.organizationId) {
    throw new ForbiddenException("Tenant context required");
  }
  return ctx.organizationId;
}

export const prismaTenantExtension = Prisma.defineExtension({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!TENANT_MODELS.has(model)) {
          return query(args);
        }
        const orgId = requireOrgOrSkip();
        if (orgId === null) {
          return query(args);
        }

        const a = (args ?? {}) as Record<string, unknown>;
        const q = query as (x: unknown) => ReturnType<typeof query>;

        switch (operation) {
          case "findMany":
          case "findFirst":
            return q({
              ...a,
              where: mergeWhere(a.where, orgId),
            });
          case "findUnique":
          case "findUniqueOrThrow":
            return q({
              ...a,
              where: mergeWhere(a.where, orgId),
            });
          case "count":
            return q({
              ...a,
              where: mergeWhere(a.where, orgId),
            });
          case "aggregate":
            return q({
              ...a,
              where: mergeWhere(a.where, orgId),
            });
          case "groupBy":
            return q({
              ...a,
              where: mergeWhere(a.where, orgId),
            });
          case "create": {
            const data = (a.data ?? {}) as Record<string, unknown>;
            const explicitOrg =
              typeof data.organizationId === "string" &&
              data.organizationId.length > 0;
            /** Транзакции (новая организация + подписка + membership) задают org явно. */
            if (explicitOrg) {
              return query(args);
            }
            return q({
              ...a,
              data: {
                ...data,
                organizationId: orgId,
              },
            });
          }
          case "createMany":
          case "createManyAndReturn": {
            const raw = a.data;
            const data = Array.isArray(raw)
              ? raw.map((row) => ({
                  ...(row as object),
                  organizationId: orgId,
                }))
              : { ...(raw as object), organizationId: orgId };
            return q({ ...a, data });
          }
          case "update":
            return q({
              ...a,
              where: mergeWhere(a.where, orgId),
            });
          case "updateMany":
            return q({
              ...a,
              where: mergeWhere(a.where, orgId),
            });
          case "delete":
            return q({
              ...a,
              where: mergeWhere(a.where, orgId),
            });
          case "deleteMany":
            return q({
              ...a,
              where: mergeWhere(a.where, orgId),
            });
          case "upsert": {
            const create = (a.create ?? {}) as Record<string, unknown>;
            const explicitOrg =
              typeof create.organizationId === "string" &&
              create.organizationId.length > 0;
            if (explicitOrg) {
              return q({
                ...a,
                where: mergeWhere(a.where, orgId),
                create: a.create,
                update: a.update,
              });
            }
            return q({
              ...a,
              where: mergeWhere(a.where, orgId),
              create: {
                ...create,
                organizationId: orgId,
              },
              update: a.update,
            });
          }
          default:
            return query(args);
        }
      },
    },
  },
});
