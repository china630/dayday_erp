import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@dayday/database";
import { PrismaService } from "./prisma.service";

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Wrapper for `$queryRaw` / `$executeRaw` that always requires an `organizationId`
 * at the call site. SQL must still bind or reference that id (e.g. via `Prisma.sql`).
 */
@Injectable()
export class TenantPrismaRawService {
  constructor(private readonly prisma: PrismaService) {}

  private assertOrganizationId(organizationId: string): void {
    if (!organizationId?.trim()) {
      throw new BadRequestException(
        "organizationId is required for tenant-scoped raw SQL",
      );
    }
  }

  $queryRaw<T = unknown>(organizationId: string, query: Prisma.Sql): Promise<T> {
    this.assertOrganizationId(organizationId);
    return this.prisma.$queryRaw<T>(query);
  }

  $executeRaw(organizationId: string, query: Prisma.Sql): Promise<number> {
    this.assertOrganizationId(organizationId);
    return this.prisma.$executeRaw(query);
  }

  $queryRawTx<T = unknown>(
    db: Db,
    organizationId: string,
    query: Prisma.Sql,
  ): Promise<T> {
    this.assertOrganizationId(organizationId);
    return db.$queryRaw<T>(query);
  }

  $executeRawTx(db: Db, organizationId: string, query: Prisma.Sql): Promise<number> {
    this.assertOrganizationId(organizationId);
    return db.$executeRaw(query);
  }
}
