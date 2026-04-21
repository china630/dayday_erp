import { createHmac, randomUUID } from "node:crypto";

/**
 * Opaque guest link token: UUID v4 + "." + HMAC-SHA256(secret, `${invoiceId}:${uuid}`) (base64url).
 * Stored verbatim on `Invoice.publicToken`; unguessable without server secret.
 */
export function generateInvoicePublicToken(
  invoiceId: string,
  secret: string,
): string {
  const id = randomUUID();
  const sig = createHmac("sha256", secret)
    .update(`${invoiceId}:${id}`)
    .digest("base64url");
  return `${id}.${sig}`;
}
