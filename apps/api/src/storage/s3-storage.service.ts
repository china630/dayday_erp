import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import type { StorageService, StoredObjectMeta } from "./storage.interface";

/**
 * S3-compatible (AWS S3, DigitalOcean Spaces, MinIO). Requires S3_* environment variables.
 */
@Injectable()
export class S3StorageService implements StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private client!: S3Client;
  private bucket!: string;
  private publicBaseUrl?: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const endpoint = this.config.get<string>("S3_ENDPOINT");
    const region = this.config.get<string>("S3_REGION", "us-east-1");
    this.bucket = this.config.get<string>("S3_BUCKET", "");
    this.publicBaseUrl = this.config.get<string>("S3_PUBLIC_BASE_URL");
    const accessKeyId = this.config.get<string>("S3_ACCESS_KEY_ID");
    const secretAccessKey = this.config.get<string>("S3_SECRET_ACCESS_KEY");
    if (!this.bucket || !accessKeyId || !secretAccessKey) {
      throw new Error("S3_STORAGE: set S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY");
    }
    this.client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle: !!endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
    this.logger.log(`S3 storage bucket=${this.bucket} endpoint=${endpoint ?? "default"}`);
  }

  async putObject(
    key: string,
    body: Buffer | Uint8Array | Readable,
    options?: { contentType?: string },
  ): Promise<StoredObjectMeta> {
    const bodyForSdk =
      typeof (body as Readable).pipe === "function"
        ? await streamToBuffer(body as Readable)
        : Buffer.isBuffer(body)
          ? body
          : Buffer.from(body as Uint8Array);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bodyForSdk,
        ContentType: options?.contentType,
      }),
    );
    return { key, contentType: options?.contentType, size: bodyForSdk.length };
  }

  async getObject(key: string): Promise<Buffer> {
    const out = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!out.Body) {
      throw new Error(`S3: empty body for ${key}`);
    }
    return streamToBuffer(out.Body as Readable);
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  getPublicUrl(key: string): string {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl.replace(/\/$/, "")}/${key}`;
    }
    return `s3://${this.bucket}/${key}`;
  }
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
