import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { connectionFromRedisUrl } from "../queue/bullmq.config";

export const INVOICE_PDF_QUEUE = "invoice-pdf";

export type InvoicePdfJobPayload = {
  invoiceId: string;
  organizationId: string;
};

@Injectable()
export class InvoicePdfQueueService implements OnModuleDestroy {
  private readonly queue: Queue<InvoicePdfJobPayload>;

  constructor(config: ConfigService) {
    const connection = connectionFromRedisUrl(
      config.get<string>("REDIS_URL", "redis://127.0.0.1:6379"),
    );
    this.queue = new Queue<InvoicePdfJobPayload>(INVOICE_PDF_QUEUE, {
      connection,
    });
  }

  async enqueue(payload: InvoicePdfJobPayload): Promise<void> {
    await this.queue.add("generate", payload, {
      removeOnComplete: true,
      attempts: 3,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
