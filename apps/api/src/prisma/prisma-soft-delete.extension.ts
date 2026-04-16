import { Prisma } from "@dayday/database";

function aliveWhere(where: unknown): Record<string, unknown> {
  if (where == null || typeof where !== "object") {
    return { isDeleted: false };
  }
  return { AND: [{ isDeleted: false }, where as Record<string, unknown>] };
}

/**
 * Автофильтр «живых» строк для Organization / Holding (PRD §12 / TZ §16.1).
 * Физический `delete` заменяется на `update` в сервисах (см. `HoldingsService.deleteHolding`).
 */
export const prismaSoftDeleteExtension = Prisma.defineExtension({
  name: "softDelete",
  query: {
    organization: {
      findMany({ args, query }) {
        return query({ ...args, where: aliveWhere(args.where) });
      },
      findFirst({ args, query }) {
        return query({ ...args, where: aliveWhere(args.where) });
      },
      count({ args, query }) {
        return query({ ...args, where: aliveWhere(args.where) });
      },
      aggregate({ args, query }) {
        return query({ ...args, where: aliveWhere(args.where) });
      },
      groupBy({ args, query }) {
        return query({ ...args, where: aliveWhere(args.where) });
      },
    },
    holding: {
      findMany({ args, query }) {
        return query({ ...args, where: aliveWhere(args.where) });
      },
      findFirst({ args, query }) {
        return query({ ...args, where: aliveWhere(args.where) });
      },
      count({ args, query }) {
        return query({ ...args, where: aliveWhere(args.where) });
      },
      aggregate({ args, query }) {
        return query({ ...args, where: aliveWhere(args.where) });
      },
      groupBy({ args, query }) {
        return query({ ...args, where: aliveWhere(args.where) });
      },
    },
  },
});
