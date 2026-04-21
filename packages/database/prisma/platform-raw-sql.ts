import type { PrismaClient } from "@prisma/client";

type ExecuteRawClient = Pick<PrismaClient, "$executeRawUnsafe">;

/**
 * Platform / DDL / global maintenance SQL only (no tenant row scope).
 * Never use for queries against tenant tables — those must go through
 * tenant-scoped helpers that require `organizationId` (see API `TenantPrismaRawService`).
 */
export async function executePlatformRawUnsafe(
  prisma: ExecuteRawClient,
  query: string,
  ...values: unknown[]
): Promise<number> {
  return prisma.$executeRawUnsafe(query, ...values);
}
