import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "node:crypto";
import {
  DigitalSignatureStatus,
  InvoiceStatus,
  SignatureProvider,
  SignedDocumentKind,
} from "@dayday/database";
import { parseSignerDisplayName } from "../common/certificate-subject.util";
import { PrismaService } from "../prisma/prisma.service";

const MOCK_DELAY_MS = 2000;

/** Payload для QR SİMA (biometrik təsdiq); real inteqrasiyada şlüzün verdiyi URL ilə əvəz olunur. */
function buildSimQrPayload(signatureLogId: string): string {
  return JSON.stringify({
    v: 1,
    provider: "SIMA",
    signatureLogId,
    ts: Date.now(),
  });
}

@Injectable()
export class SignatureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** 1 — имитация Mobile ID (по умолчанию); 0 — только ожидание внешнего шлюза (без авто-завершения). */
  isGatewayMock(): boolean {
    return this.config.get<string>("SIGNATURE_GATEWAY_MOCK", "1") !== "0";
  }

  /**
   * ASAN İmza — mobil təsdiq (SMS/push).
   * SİMA — biometrik imza; istifadəçi SİMA tətbiqi ilə QR skan edir (payload burada mock/real şlüzdən).
   */

  async initiateInvoiceSignature(
    organizationId: string,
    invoiceId: string,
    provider: SignatureProvider,
  ) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
    });
    if (!inv) throw new NotFoundException("Invoice not found");
    if (inv.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException("Cancelled invoice cannot be signed");
    }
    if (inv.status === InvoiceStatus.LOCKED_BY_SIGNATURE) {
      throw new BadRequestException("Invoice is already locked by signature");
    }

    const completed = await this.prisma.digitalSignatureLog.findFirst({
      where: {
        organizationId,
        documentId: invoiceId,
        documentKind: SignedDocumentKind.INVOICE,
        status: DigitalSignatureStatus.COMPLETED,
      },
    });
    if (completed) {
      throw new BadRequestException("Invoice already has a completed signature");
    }

    await this.prisma.digitalSignatureLog.deleteMany({
      where: {
        organizationId,
        documentId: invoiceId,
        documentKind: SignedDocumentKind.INVOICE,
        status: DigitalSignatureStatus.PENDING_MOBILE,
      },
    });

    const started = new Date();
    const log = await this.prisma.digitalSignatureLog.create({
      data: {
        organizationId,
        documentId: invoiceId,
        documentKind: SignedDocumentKind.INVOICE,
        provider,
        status: DigitalSignatureStatus.PENDING_MOBILE,
        pendingStartedAt: started,
      },
    });

    const message =
      provider === SignatureProvider.ASAN_IMZA
        ? "Mobil telefonunuzda ASAN İmza təsdiqi gözlənilir."
        : "SİMA tətbiqi ilə QR kodu skan edin; biometrik təsdiq gözlənilir.";

    const base = {
      signatureLogId: log.id,
      status: "AWAITING_MOBILE_CONFIRMATION" as const,
      message,
      provider,
    };

    if (provider === SignatureProvider.SIMA) {
      const gatewayUrl = this.config
        .get<string>("SIMA_QR_PAYLOAD_URL")
        ?.trim();
      return {
        ...base,
        simQrPayload: gatewayUrl ?? buildSimQrPayload(log.id),
        simQrHintAz:
          "SİMA mobil tətbiqini açın və bu QR kodu skan edin (biometrik imza).",
      };
    }

    return base;
  }

  async getInvoiceSignatureStatus(
    organizationId: string,
    invoiceId: string,
    logId: string,
  ) {
    const log = await this.prisma.digitalSignatureLog.findFirst({
      where: {
        id: logId,
        organizationId,
        documentId: invoiceId,
        documentKind: SignedDocumentKind.INVOICE,
      },
    });
    if (!log) throw new NotFoundException("Signature session not found");

    if (
      log.status === DigitalSignatureStatus.PENDING_MOBILE &&
      this.isGatewayMock()
    ) {
      const t0 = log.pendingStartedAt?.getTime() ?? log.createdAt.getTime();
      if (Date.now() - t0 >= MOCK_DELAY_MS) {
        const freshCompletion = await this.tryFinalizeMockSignature(
          organizationId,
          invoiceId,
          log.id,
          log.provider,
        );
        const refreshed = await this.prisma.digitalSignatureLog.findFirst({
          where: { id: logId },
        });
        if (!refreshed) throw new NotFoundException("Signature session not found");
        return {
          ...this.toStatusPayload(refreshed),
          freshCompletion,
        };
      }
    }

    const rest = { ...this.toStatusPayload(log), freshCompletion: false };
    if (
      log.status === DigitalSignatureStatus.PENDING_MOBILE &&
      log.provider === SignatureProvider.SIMA
    ) {
      const gatewayUrl = this.config
        .get<string>("SIMA_QR_PAYLOAD_URL")
        ?.trim();
      return {
        ...rest,
        simQrPayload: gatewayUrl ?? buildSimQrPayload(log.id),
        simQrHintAz:
          "SİMA mobil tətbiqini açın və bu QR kodu skan edin (biometrik imza).",
      };
    }
    return rest;
  }

  private async tryFinalizeMockSignature(
    organizationId: string,
    invoiceId: string,
    logId: string,
    provider: SignatureProvider,
  ): Promise<boolean> {
    const thumb = `MOCK-${randomBytes(16).toString("hex")}`;
    const issuer =
      provider === SignatureProvider.ASAN_IMZA
        ? "CN=DayDay Mock ASAN İmza CA"
        : "CN=DayDay Mock SİMA Biometric CA";
    let completed = false;
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.digitalSignatureLog.updateMany({
        where: {
          id: logId,
          organizationId,
          documentId: invoiceId,
          documentKind: SignedDocumentKind.INVOICE,
          status: DigitalSignatureStatus.PENDING_MOBILE,
        },
        data: {
          status: DigitalSignatureStatus.COMPLETED,
          signedAt: new Date(),
          certificateThumbprint: thumb,
          certificateSubject: "CN=Demo İmzalayan (MOCK)",
          certificateIssuer: issuer,
        },
      });
      if (done.count === 0) return;

      completed = true;
      await tx.invoice.updateMany({
        where: { id: invoiceId, organizationId },
        data: { status: InvoiceStatus.LOCKED_BY_SIGNATURE },
      });
    });
    return completed;
  }

  private toStatusPayload(log: {
    id: string;
    status: DigitalSignatureStatus;
    provider: SignatureProvider;
    signedAt: Date | null;
    certificateSubject: string | null;
    certificateIssuer: string | null;
    certificateThumbprint: string | null;
  }) {
    if (log.status === DigitalSignatureStatus.PENDING_MOBILE) {
      return {
        signatureLogId: log.id,
        status: "AWAITING_MOBILE_CONFIRMATION" as const,
        provider: log.provider,
      };
    }
    if (log.status === DigitalSignatureStatus.COMPLETED) {
      return {
        signatureLogId: log.id,
        status: "COMPLETED" as const,
        provider: log.provider,
        signedAt: log.signedAt?.toISOString() ?? null,
        certificateSubject: log.certificateSubject,
        certificateIssuer: log.certificateIssuer,
        certificateThumbprint: log.certificateThumbprint,
      };
    }
    return {
      signatureLogId: log.id,
      status: "FAILED" as const,
      provider: log.provider,
    };
  }

  /**
   * Только публичные поля: без organizationId, documentId, thumbprint, сумм счёта.
   */
  async getPublicVerification(logId: string) {
    const log = await this.prisma.digitalSignatureLog.findFirst({
      where: {
        id: logId,
        status: DigitalSignatureStatus.COMPLETED,
      },
      include: {
        organization: { select: { name: true, taxId: true } },
      },
    });
    if (!log) return null;

    const signerName = parseSignerDisplayName(log.certificateSubject);

    if (log.documentKind === SignedDocumentKind.INVOICE) {
      const invoice = await this.prisma.invoice.findFirst({
        where: {
          id: log.documentId,
          organizationId: log.organizationId,
        },
        select: { number: true, createdAt: true },
      });
      if (!invoice) return null;

      return {
        verified: true as const,
        signedAt: log.signedAt?.toISOString() ?? null,
        signerName,
        organization: {
          name: log.organization.name,
          taxId: log.organization.taxId,
        },
        documentHashSha256: log.contentHashSha256,
        documentKind: log.documentKind,
        provider: log.provider,
        certificate: {
          subject: log.certificateSubject,
          issuer: log.certificateIssuer,
        },
        invoice: {
          number: invoice.number,
          issuedAt: invoice.createdAt.toISOString(),
        },
      };
    }

    return {
      verified: true as const,
      signedAt: log.signedAt?.toISOString() ?? null,
      signerName,
      organization: {
        name: log.organization.name,
        taxId: log.organization.taxId,
      },
      documentHashSha256: log.contentHashSha256,
      documentKind: log.documentKind,
      provider: log.provider,
      certificate: {
        subject: log.certificateSubject,
        issuer: log.certificateIssuer,
      },
    };
  }
}
