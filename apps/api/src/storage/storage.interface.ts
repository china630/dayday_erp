import type { Readable } from "node:stream";

export type StoredObjectMeta = {
  key: string;
  contentType?: string;
  size?: number;
};

/**
 * Абстракция хранилища файлов: локальный том (MVP) или S3-compatible (Spaces, AWS S3, MinIO).
 */
export interface StorageService {
  putObject(
    key: string,
    body: Buffer | Uint8Array | Readable,
    options?: { contentType?: string },
  ): Promise<StoredObjectMeta>;

  getObject(key: string): Promise<Buffer>;

  deleteObject(key: string): Promise<void>;

  /** Публичный или presigned URL — зависит от драйвера; для локального MVP можно вернуть API path. */
  getPublicUrl?(key: string): string;
}

export const STORAGE_SERVICE = Symbol("STORAGE_SERVICE");
