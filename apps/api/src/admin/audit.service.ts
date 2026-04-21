import { Injectable } from "@nestjs/common";
import type { Prisma } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";

export type SemanticAuditAction = "CREATE" | "UPDATE" | "DELETE" | "OTHER";

export function httpMethodToSemanticAction(method: string): SemanticAuditAction {
  switch (method) {
    case "POST":
      return "CREATE";
    case "PATCH":
    case "PUT":
      return "UPDATE";
    case "DELETE":
      return "DELETE";
    default:
      return "OTHER";
  }
}

function userDisplayName(u: {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const fn = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  if (fn) {
    return fn;
  }
  if (u.fullName?.trim()) {
    return u.fullName.trim();
  }
  return u.email;
}

@Injectable()
export class AdminAuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAuditLogs(
    organizationId: string,
    query: {
      userId?: string;
      entityName?: string;
      entityId?: string;
      from?: string;
      to?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<{
    items: Array<{
      id: string;
      userId: string | null;
      actorDisplayName: string | null;
      entityType: string;
      entityId: string;
      action: string;
      semanticAction: SemanticAuditAction;
      createdAt: Date;
      oldValues: unknown;
      newValues: unknown;
      objectLabel: string;
      invoiceNumber: string | null;
      employeeDisplayName: string | null;
    }>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    const where: Prisma.AuditLogWhereInput = { organizationId };
    if (query.userId) {
      where.userId = query.userId;
    }
    if (query.entityName) {
      where.entityType = query.entityName;
    }
    if (query.entityId) {
      where.entityId = query.entityId;
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        where.createdAt.gte = new Date(query.from);
      }
      if (query.to) {
        where.createdAt.lte = new Date(query.to);
      }
    }

    const skip = (query.page - 1) * query.pageSize;

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: query.pageSize,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
    ]);

    const invoiceIds = new Set<string>();
    const employeeIds = new Set<string>();
    for (const r of rows) {
      if (r.entityType === "Invoice") {
        invoiceIds.add(r.entityId);
      } else if (r.entityType === "Employee") {
        employeeIds.add(r.entityId);
      }
    }

    const [invoices, employees] = await Promise.all([
      invoiceIds.size
        ? this.prisma.invoice.findMany({
            where: { organizationId, id: { in: [...invoiceIds] } },
            select: { id: true, number: true },
          })
        : Promise.resolve([]),
      employeeIds.size
        ? this.prisma.employee.findMany({
            where: { organizationId, id: { in: [...employeeIds] } },
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
    ]);

    const invMap = new Map(invoices.map((x) => [x.id, x.number]));
    const empMap = new Map(
      employees.map((e) => [
        e.id,
        [e.firstName, e.lastName].filter(Boolean).join(" ").trim() || e.id,
      ]),
    );

    const items = rows.map((r) => {
      let objectLabel = `${r.entityType} ${r.entityId}`;
      let invoiceNumber: string | null = null;
      let employeeDisplayName: string | null = null;
      if (r.entityType === "Invoice") {
        const num = invMap.get(r.entityId);
        invoiceNumber = num ?? null;
        objectLabel = num ? `Invoice #${num}` : `Invoice ${r.entityId}`;
      } else if (r.entityType === "Employee") {
        const name = empMap.get(r.entityId);
        employeeDisplayName = name ?? null;
        objectLabel = name ? `Employee: ${name}` : `Employee ${r.entityId}`;
      } else if (r.entityType === "Product") {
        objectLabel = `Product ${r.entityId}`;
      } else if (r.entityType === "JournalEntry") {
        objectLabel = `JournalEntry ${r.entityId}`;
      }

      return {
        id: r.id,
        userId: r.userId,
        actorDisplayName: r.user ? userDisplayName(r.user) : null,
        entityType: r.entityType,
        entityId: r.entityId,
        action: r.action,
        semanticAction: httpMethodToSemanticAction(r.action),
        createdAt: r.createdAt,
        oldValues: r.oldValues,
        newValues: r.newValues,
        objectLabel,
        invoiceNumber,
        employeeDisplayName,
      };
    });

    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
