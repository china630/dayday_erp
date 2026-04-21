-- template_ifrs_mappings may have been created earlier without a DB default on updated_at
-- (CREATE TABLE IF NOT EXISTS skipped in align migration). Prisma @updatedAt expects a default for drift-free migrate dev.
ALTER TABLE "template_ifrs_mappings"
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
