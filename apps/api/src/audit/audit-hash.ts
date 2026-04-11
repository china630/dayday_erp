import { createHash } from "crypto";

export type AuditHashPayload = {
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
  createdAt: Date;
};

export function canonicalAuditJsonString(p: AuditHashPayload): string {
  return JSON.stringify({
    organizationId: p.organizationId,
    userId: p.userId,
    entityType: p.entityType,
    entityId: p.entityId,
    action: p.action,
    oldValues: p.oldValues,
    newValues: p.newValues,
    changes: p.changes,
    clientIp: p.clientIp,
    userAgent: p.userAgent,
    createdAt: p.createdAt.toISOString(),
  });
}

export function computeAuditHash(p: AuditHashPayload, secret: string): string {
  return createHash("sha256")
    .update(canonicalAuditJsonString(p) + secret, "utf8")
    .digest("hex");
}

export function verifyAuditHash(
  p: AuditHashPayload,
  secret: string,
  hash: string | null | undefined,
): boolean {
  if (!hash) {
    return false;
  }
  return computeAuditHash(p, secret) === hash;
}
