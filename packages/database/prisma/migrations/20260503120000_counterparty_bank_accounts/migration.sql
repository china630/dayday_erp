-- CreateTable
CREATE TABLE "counterparty_bank_accounts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "counterparty_id" UUID NOT NULL,
    "bank_name" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "swift" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'AZN',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counterparty_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- Migrate legacy JSON `counterparties.bank_accounts` (array of { iban?, bankName? }) into rows
INSERT INTO "counterparty_bank_accounts" (
    "id",
    "counterparty_id",
    "bank_name",
    "iban",
    "swift",
    "currency",
    "is_primary",
    "created_at",
    "updated_at"
)
SELECT DISTINCT ON (c."id", upper(trim(elem->>'iban')))
    uuid_generate_v4(),
    c."id",
    COALESCE(NULLIF(trim(elem->>'bankName'), ''), ''),
    trim(elem->>'iban'),
    NULLIF(trim(elem->>'swift'), ''),
    COALESCE(NULLIF(trim(elem->>'currency'), ''), 'AZN'),
    COALESCE((elem->>'isPrimary')::boolean, false),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "counterparties" c,
    jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(c."bank_accounts"::jsonb) = 'array' THEN c."bank_accounts"::jsonb
            ELSE '[]'::jsonb
        END
    ) AS elem
WHERE trim(COALESCE(elem->>'iban', '')) <> '';

-- AddForeignKey
ALTER TABLE "counterparty_bank_accounts" ADD CONSTRAINT "counterparty_bank_accounts_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "counterparty_bank_accounts_cp_iban_uidx" ON "counterparty_bank_accounts"("counterparty_id", "iban");

-- CreateIndex
CREATE INDEX "counterparty_bank_accounts_counterparty_id_idx" ON "counterparty_bank_accounts"("counterparty_id");

-- AlterTable (drop legacy JSON column)
ALTER TABLE "counterparties" DROP COLUMN "bank_accounts";
