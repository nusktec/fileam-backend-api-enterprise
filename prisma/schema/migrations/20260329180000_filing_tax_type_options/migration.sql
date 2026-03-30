-- CreateTable
CREATE TABLE "filing_tax_type_options" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "filing_tax_type_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "filing_tax_type_options_code_key" ON "filing_tax_type_options"("code");

INSERT INTO "filing_tax_type_options" ("id", "code", "label", "sort_order", "is_active", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'VAT', 'Value Added Tax', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CIT', 'Company Income Tax', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'WHT', 'Withholding Tax', 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'PAYE', 'Pay As You Earn', 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
