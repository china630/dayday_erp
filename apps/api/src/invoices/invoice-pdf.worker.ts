import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { DigitalSignatureStatus, SignedDocumentKind } from "@dayday/database";
import { Job, Worker } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { QuotaService } from "../quota/quota.service";
import { connectionFromRedisUrl } from "../queue/bullmq.config";
import { STORAGE_SERVICE, type StorageService } from "../storage/storage.interface";
import {
  INVOICE_PDF_QUEUE,
  type InvoicePdfJobPayload,
} from "./invoice-pdf.queue";
import { buildInvoicePdfModelFromIds } from "./invoice-pdf.build";
import { renderInvoicePdf } from "./invoice-pdf.render";

@Injectable()
export class InvoicePdfWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InvoicePdfWorker.name);
  private worker?: Worker;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  onModuleInit(): void {
    const connection = connectionFromRedisUrl(
      this.config.get<string>("REDIS_URL", "redis://127.0.0.1:6379"),
    );
    this.worker = new Worker<InvoicePdfJobPayload>(
      INVOICE_PDF_QUEUE,
      async (job: Job<InvoicePdfJobPayload>) => this.handle(job),
      { connection },
    );
    this.worker.on("failed", (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err?.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async handle(job: Job<InvoicePdfJobPayload>): Promise<void> {
    const { invoiceId, organizationId } = job.data;
    const model = await buildInvoicePdfModelFromIds(
      this.prisma,
      this.config,
      organizationId,
      invoiceId,
    );
    if (!model) {
      this.logger.warn(`Invoice ${invoiceId} not found`);
      return;
    }
    const pdf = await renderInvoicePdf(model);
    await this.quota.assertStorageQuota(organizationId, pdf.length);
    const key = `orgs/${organizationId}/invoices/${invoiceId}.pdf`;
    await this.storage.putObject(key, pdf, { contentType: "application/pdf" });
    await this.quota.addStorageUsage(organizationId, pdf.length);
    this.logger.log(`Stored invoice PDF: ${key}`);

    const hashHex = createHash("sha256").update(pdf).digest("hex");
    const sigLog = await this.prisma.digitalSignatureLog.findFirst({
      where: {
        organizationId,
        documentId: invoiceId,
        documentKind: SignedDocumentKind.INVOICE,
        status: DigitalSignatureStatus.COMPLETED,
      },
      orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }],
    });
    if (sigLog) {
      await this.prisma.digitalSignatureLog.update({
        where: { id: sigLog.id },
        data: { contentHashSha256: hashHex },
      });
    }
  }
}
