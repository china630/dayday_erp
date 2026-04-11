import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import {
  computeAuditHash,
  type AuditHashPayload,
  verifyAuditHash,
} from "./audit-hash";
import { serializeForAudit } from "./audit-serialize";

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export type EntitySnapshot = {
  entityType: string;
  entityId: string;
  oldValues: unknown;
};

type RequestLike = {
  method: string;
  path?: string;
  url?: string;
  body?: unknown;
  params?: Record<string, string>;
  user?: AuthUser;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get hashSecret(): string {
    return (
      this.config.get<string>("AUDIT_HASH_SECRET") ??
      this.config.get<string>("JWT_SECRET") ??
      "audit-hash-dev-only"
    );
  }

  normalizeApiPath(path: string): string {
    const q = path.split("?")[0] ?? "";
    if (q.startsWith("/api")) {
      return q.slice(4) || "/";
    }
    return q.startsWith("/") ? q : `/${q}`;
  }

  extractClientIp(req: RequestLike): string | null {
    const xf = req.headers["x-forwarded-for"];
    const fromXf =
      typeof xf === "string"
        ? xf.split(",")[0]?.trim()
        : Array.isArray(xf)
          ? xf[0]?.trim()
          : null;
    if (fromXf) {
      return fromXf;
    }
    if (req.ip) {
      return req.ip;
    }
    return null;
  }

  extractUserAgent(req: RequestLike): string | null {
    const ua = req.headers["user-agent"];
    return typeof ua === "string" ? ua : null;
  }

  redactSecrets(body: unknown): unknown {
    if (body == null || typeof body !== "object" || Array.isArray(body)) {
      return body;
    }
    const o = { ...(body as Record<string, unknown>) };
    for (const k of [
      "password",
      "adminPassword",
      "passwordHash",
      "currentPassword",
      "refresh_token",
    ]) {
      if (k in o) {
        o[k] = "[REDACTED]";
      }
    }
    return o;
  }

  sanitizeBody(req: RequestLike): unknown {
    const ct = String(req.headers["content-type"] ?? "");
    if (ct.includes("multipart/form-data")) {
      return { _note: "multipart body omitted" };
    }
    return this.redactSecrets(req.body);
  }

  async loadOldSnapshot(req: RequestLike): Promise<EntitySnapshot | null> {
    const orgId = req.user?.organizationId ?? null;
    const method = req.method;
    if (!orgId || !MUTATION_METHODS.has(method)) {
      return null;
    }
    const path = this.normalizeApiPath(req.path ?? req.url ?? "");

    if (path === "/invoices" && method === "POST") {
      return null;
    }

    const invoiceMatch = /^\/invoices\/([^/]+)/.exec(path);
    if (invoiceMatch) {
      const invoiceId = invoiceMatch[1];
      const inv = await this.prisma.invoice.findFirst({
        where: { id: invoiceId, organizationId: orgId },
        include: { items: true, payments: true },
      });
      if (!inv) {
        return null;
      }
      return {
        entityType: "Invoice",
        entityId: invoiceId,
        oldValues: serializeForAudit(inv),
      };
    }

    const productMatch = /^\/products\/([^/]+)$/.exec(path);
    if (productMatch && method === "PATCH") {
      const id = productMatch[1];
      const row = await this.prisma.product.findFirst({
        where: { id, organizationId: orgId },
      });
      if (!row) {
        return null;
      }
      return {
        entityType: "Product",
        entityId: id,
        oldValues: serializeForAudit(row),
      };
    }

    const empMatch = /^\/hr\/employees\/([^/]+)$/.exec(path);
    if (empMatch && (method === "PATCH" || method === "DELETE")) {
      const id = empMatch[1];
      const row = await this.prisma.employee.findFirst({
        where: { id, organizationId: orgId },
        include: {
          jobPosition: {
            include: { department: { select: { id: true, name: true } } },
          },
        },
      });
      if (!row) {
        return null;
      }
      return {
        entityType: "Employee",
        entityId: id,
        oldValues: serializeForAudit(row),
      };
    }

    return null;
  }

  async resolveNewValues(
    req: RequestLike,
    responseBody: unknown,
    oldSnapshot: EntitySnapshot | null,
    organizationId: string | null,
  ): Promise<unknown> {
    const path = this.normalizeApiPath(req.path ?? req.url ?? "");
    const method = req.method;

    if (path === "/accounting/quick-expense" && method === "POST" && organizationId) {
      const rid = (responseBody as { transactionId?: string } | null)?.transactionId;
      if (!rid) {
        return serializeForAudit(responseBody);
      }
      const tx = await this.prisma.transaction.findFirst({
        where: { id: rid, organizationId },
        include: {
          journalEntries: {
            include: {
              account: { select: { code: true, name: true } },
            },
          },
        },
      });
      return serializeForAudit({
        transactionId: rid,
        transaction: tx,
        journalEntries: tx?.journalEntries ?? [],
      });
    }

    if (path === "/hr/employees" && method === "POST" && organizationId) {
      const id = (responseBody as { id?: string } | null)?.id;
      if (id) {
        const row = await this.prisma.employee.findFirst({
          where: { id, organizationId },
          include: {
            jobPosition: {
              include: { department: { select: { id: true, name: true } } },
            },
          },
        });
        return row ? serializeForAudit(row) : serializeForAudit(responseBody);
      }
    }

    if (path === "/products" && method === "POST" && organizationId) {
      const id = (responseBody as { id?: string } | null)?.id;
      if (id) {
        const row = await this.prisma.product.findFirst({
          where: { id, organizationId },
        });
        return row ? serializeForAudit(row) : serializeForAudit(responseBody);
      }
    }

    if (oldSnapshot?.entityType === "Invoice" && organizationId) {
      const inv = await this.prisma.invoice.findFirst({
        where: { id: oldSnapshot.entityId, organizationId },
        include: { items: true, payments: true },
      });
      return inv ? serializeForAudit(inv) : serializeForAudit(responseBody);
    }

    if (oldSnapshot?.entityType === "Product" && organizationId) {
      const row = await this.prisma.product.findFirst({
        where: { id: oldSnapshot.entityId, organizationId },
      });
      return row ? serializeForAudit(row) : serializeForAudit(responseBody);
    }

    if (oldSnapshot?.entityType === "Employee" && method !== "DELETE" && organizationId) {
      const row = await this.prisma.employee.findFirst({
        where: { id: oldSnapshot.entityId, organizationId },
        include: {
          jobPosition: {
            include: { department: { select: { id: true, name: true } } },
          },
        },
      });
      return row ? serializeForAudit(row) : serializeForAudit(responseBody);
    }

    if (oldSnapshot?.entityType === "Employee" && method === "DELETE") {
      return { deleted: true };
    }

    if (path === "/invoices" && method === "POST" && responseBody && organizationId) {
      const id = (responseBody as { id?: string }).id;
      if (id) {
        const inv = await this.prisma.invoice.findFirst({
          where: { id, organizationId },
          include: { items: true, payments: true },
        });
        return inv ? serializeForAudit(inv) : serializeForAudit(responseBody);
      }
    }

    return serializeForAudit(responseBody);
  }

  async persistAfterMutation(params: {
    req: RequestLike;
    responseBody: unknown;
    oldSnapshot: EntitySnapshot | null;
  }): Promise<void> {
    const { req, responseBody, oldSnapshot } = params;
    const method = req.method;
    if (!MUTATION_METHODS.has(method)) {
      return;
    }

    const pathRaw = req.path ?? req.url ?? "";
    const path = this.normalizeApiPath(pathRaw);

    if (
      pathRaw.includes("/auth/login") ||
      pathRaw.includes("/auth/register-user") ||
      pathRaw.includes("/auth/register") ||
      pathRaw.includes("/auth/refresh")
    ) {
      return;
    }

    if (pathRaw.includes("/audit/")) {
      return;
    }

    const user = req.user;
    const orgId = user?.organizationId ?? null;
    const userId = user?.userId ?? null;

    const clientIp = this.extractClientIp(req);
    const userAgent = this.extractUserAgent(req);
    const bodySnapshot = this.sanitizeBody(req);

    let entityType = "HTTP_MUTATION";
    let entityId = `${method} ${path}`.slice(0, 255);
    let oldValues: unknown = null;
    let newValues: unknown = null;

    if (path === "/accounting/quick-expense" && method === "POST") {
      entityType = "JournalEntry";
      const rid = (responseBody as { transactionId?: string } | null)?.transactionId;
      entityId = rid ?? entityId;
    } else if (oldSnapshot) {
      entityType = oldSnapshot.entityType;
      entityId = oldSnapshot.entityId;
      oldValues = oldSnapshot.oldValues;
    } else if (path === "/invoices" && method === "POST") {
      entityType = "Invoice";
      const nid = (responseBody as { id?: string } | null)?.id;
      entityId = nid ?? entityId;
    } else if (path.startsWith("/products") && method === "POST") {
      entityType = "Product";
      const nid = (responseBody as { id?: string } | null)?.id;
      entityId = nid ?? entityId;
    } else if (path === "/hr/employees" && method === "POST") {
      entityType = "Employee";
      const nid = (responseBody as { id?: string } | null)?.id;
      entityId = nid ?? entityId;
    }

    try {
      newValues = await this.resolveNewValues(
        req,
        responseBody,
        oldSnapshot,
        orgId,
      );
    } catch (e) {
      this.logger.warn(
        `resolveNewValues fallback: ${e instanceof Error ? e.message : String(e)}`,
      );
      newValues = serializeForAudit(responseBody);
    }

    const changes = {
      path: pathRaw,
      body: bodySnapshot,
    };

    const createdAt = new Date();

    const hashPayload: AuditHashPayload = {
      organizationId: orgId,
      userId,
      entityType,
      entityId,
      action: method,
      oldValues,
      newValues,
      changes,
      clientIp,
      userAgent,
      createdAt,
    };

    const hash = computeAuditHash(hashPayload, this.hashSecret);

    await this.prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId,
        entityType,
        entityId,
        action: method,
        changes: changes as object,
        oldValues:
          oldValues === null || oldValues === undefined
            ? undefined
            : (oldValues as object),
        newValues:
          newValues === null || newValues === undefined
            ? undefined
            : (newValues as object),
        clientIp,
        userAgent,
        hash,
        createdAt,
      },
    });
  }

  verifyStoredLog(log: {
    organizationId: string | null;
    userId: string | null;
    entityType: string;
    entityId: string;
    action: string;
    oldValues: unknown;
    newValues: unknown;
    changes: unknown;
    clientIp: string | null;
    userAgent: string | null;
    hash: string | null;
    createdAt: Date;
  }): boolean {
    const payload: AuditHashPayload = {
      organizationId: log.organizationId,
      userId: log.userId,
      entityType: log.entityType,
      entityId: log.entityId,
      action: log.action,
      oldValues: log.oldValues,
      newValues: log.newValues,
      changes: log.changes,
      clientIp: log.clientIp,
      userAgent: log.userAgent,
      createdAt: log.createdAt,
    };
    return verifyAuditHash(payload, this.hashSecret, log.hash);
  }

  async verifyOrganizationLogs(organizationId: string): Promise<{
    total: number;
    legacyWithoutHash: number;
    invalidCount: number;
    invalidIds: string[];
  }> {
    const logs = await this.prisma.auditLog.findMany({
      where: { organizationId },
      select: {
        id: true,
        organizationId: true,
        userId: true,
        entityType: true,
        entityId: true,
        action: true,
        oldValues: true,
        newValues: true,
        changes: true,
        clientIp: true,
        userAgent: true,
        hash: true,
        createdAt: true,
      },
    });
    const invalidIds: string[] = [];
    let legacyWithoutHash = 0;
    for (const log of logs) {
      if (!log.hash) {
        legacyWithoutHash++;
        continue;
      }
      if (!this.verifyStoredLog(log)) {
        invalidIds.push(log.id);
      }
    }
    return {
      total: logs.length,
      legacyWithoutHash,
      invalidCount: invalidIds.length,
      invalidIds,
    };
  }
}
