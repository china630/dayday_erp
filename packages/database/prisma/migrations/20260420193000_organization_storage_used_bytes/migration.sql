-- Quota STORAGE: tracked object bytes per organization (v23.0).
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "storage_used_bytes" BIGINT NOT NULL DEFAULT 0;
