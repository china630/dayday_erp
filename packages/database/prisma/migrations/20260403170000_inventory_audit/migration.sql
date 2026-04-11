-- CreateEnum
CREATE TYPE "InventoryAuditStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateTable
CREATE TABLE "inventory_audits" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "InventoryAuditStatus" NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_audits_organization_id_idx" ON "inventory_audits"("organization_id");

-- AddForeignKey
ALTER TABLE "inventory_audits" ADD CONSTRAINT "inventory_audits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
