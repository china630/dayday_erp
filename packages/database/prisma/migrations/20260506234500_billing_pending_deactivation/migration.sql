ALTER TABLE "organization_modules"
ADD COLUMN "pending_deactivation" BOOLEAN NOT NULL DEFAULT false;
