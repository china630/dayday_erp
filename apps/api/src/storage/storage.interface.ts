import type { Readable } from "node:stream";

export type StoredObjectMeta = {
  key: string;
  contentType?: string;
  size?: number;
};

/**
 * S3-compatible object storage port: local disk (dev) or AWS S3 / Spaces / MinIO (prod).
 * Tenant keys: `orgs/{organizationId}/…`, logos `org-logos/{organizationId}/…`.
 */
export interface StorageService {
  putObject(
    key: string,
    body: Buffer | Uint8Array | Readable,
    options?: { contentType?: string },
  ): Promise<StoredObjectMeta>;

  getObject(key: string): Promise<Buffer>;

  deleteObject(key: string): Promise<void>;

  /** Public or presigned URL — driver-specific; local driver may return an API path. */
  getPublicUrl?(key: string): string;
}

/** Alias for {@link StorageService} (object / bucket API). */
export type ObjectStoragePort = StorageService;

export const STORAGE_SERVICE = Symbol("STORAGE_SERVICE");
