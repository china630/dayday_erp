import { ConfigService } from "@nestjs/config";
import {
  DigitalSignatureStatus,
  SignatureProvider,
  SignedDocumentKind,
} from "@dayday/database";
import { verifyQrPublicBase } from "../common/verify-public-url";
import { PrismaService } from "../prisma/prisma.service";
import type { InvoicePdfModel } from "./invoice-pdf.render";

export async function buildInvoicePdfModelFromIds(
  prisma: PrismaService,
  config: ConfigService,
  organizationId: string,
  invoiceId: string,
): Promise<InvoicePdfModel | null> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, organizationId },
    include: {
      counterparty: true,
      items: { include: { product: true } },
    },
  });
  if (!invoice) return null;

  const sig = await prisma.digitalSignatureLog.findFirst({
    where: {
      organizationId,
      documentId: invoiceId,
      documentKind: SignedDocumentKind.INVOICE,
      status: DigitalSignatureStatus.COMPLETED,
    },
    orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }],
  });

  const base = verifyQrPublicBase(config);
  const signature =
    sig?.signedAt != null
      ? {
          verifyUrl: `${base}/verify/${sig.id}`,
          signedAt: sig.signedAt,
          providerLabel:
            sig.provider === SignatureProvider.ASAN_IMZA ? "ASAN İmza" : "SİMA",
          certificateSubject: sig.certificateSubject,
        }
      : undefined;

  return {
    number: invoice.number,
    status: invoice.status,
    dueDate: invoice.dueDate,
    totalAmount: invoice.totalAmount,
    currency: invoice.currency,
    counterparty: invoice.counterparty,
    items: invoice.items,
    signature,
  };
}
