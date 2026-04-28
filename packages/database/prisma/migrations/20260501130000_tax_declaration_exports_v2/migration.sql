-- e-Taxes Export v2

CREATE TYPE "TaxDeclarationType" AS ENUM ('SIMPLIFIED_TAX');
CREATE TYPE "TaxDeclarationExportStatus" AS ENUM ('GENERATED', 'UPLOADED', 'CONFIRMED_BY_TAX');

CREATE TABLE "tax_declaration_exports" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "tax_type" "TaxDeclarationType" NOT NULL,
    "period" TEXT NOT NULL,
    "generated_file_url" TEXT NOT NULL,
    "receipt_file_url" TEXT,
    "status" "TaxDeclarationExportStatus" NOT NULL DEFAULT 'GENERATED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_declaration_exports_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tax_declaration_exports"
ADD CONSTRAINT "tax_declaration_exports_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "tax_decl_org_period_idx"
ON "tax_declaration_exports"("organization_id", "period");

CREATE INDEX "tax_decl_org_status_idx"
ON "tax_declaration_exports"("organization_id", "status");
