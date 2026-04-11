-- CreateTable
CREATE TABLE "organization_modules" (
    "organization_id" UUID NOT NULL,
    "module_key" TEXT NOT NULL,
    "price_snapshot" DECIMAL(12,2) NOT NULL,
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),
    "access_until" TIMESTAMPTZ(6),

    CONSTRAINT "organization_modules_pkey" PRIMARY KEY ("organization_id","module_key")
);

ALTER TABLE "organization_modules" ADD CONSTRAINT "organization_modules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
