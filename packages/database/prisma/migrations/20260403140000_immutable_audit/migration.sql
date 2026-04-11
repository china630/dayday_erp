-- Immutable audit v5.3: snapshots, IP/UA, hash, archive table

ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "old_values" JSONB;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "new_values" JSONB;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "client_ip" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "user_agent" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "hash" TEXT;

CREATE TABLE IF NOT EXISTS "audit_log_archives" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID,
    "user_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "old_values" JSONB,
    "new_values" JSONB,
    "client_ip" TEXT,
    "user_agent" TEXT,
    "hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_archives_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_log_archives_organization_id_created_at_idx" ON "audit_log_archives"("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_log_archives_entity_type_entity_id_idx" ON "audit_log_archives"("entity_type", "entity_id");
