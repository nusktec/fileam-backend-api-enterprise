-- Business: add consultant-updatable fields
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "contact_email" TEXT;
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "turnover_band" TEXT;
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "vat_status" TEXT;

-- ClientTaxConfiguration
CREATE TABLE IF NOT EXISTS "client_tax_configurations" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "vat" BOOLEAN NOT NULL DEFAULT false,
  "paye" BOOLEAN NOT NULL DEFAULT false,
  "wht" BOOLEAN NOT NULL DEFAULT false,
  "cit" BOOLEAN NOT NULL DEFAULT false,
  "stamp_duties" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "client_tax_configurations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "client_tax_configurations_company_id_key" ON "client_tax_configurations"("company_id");
ALTER TABLE "client_tax_configurations" ADD CONSTRAINT "client_tax_configurations_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EnterpriseFinancialDocument: add vendor, invoice_number, format, confidence, document_status, vat fields
ALTER TABLE "enterprise_financial_documents" ADD COLUMN IF NOT EXISTS "vendor" TEXT;
ALTER TABLE "enterprise_financial_documents" ADD COLUMN IF NOT EXISTS "invoice_number" TEXT;
ALTER TABLE "enterprise_financial_documents" ADD COLUMN IF NOT EXISTS "format" TEXT;
ALTER TABLE "enterprise_financial_documents" ADD COLUMN IF NOT EXISTS "confidence" INTEGER;
ALTER TABLE "enterprise_financial_documents" ADD COLUMN IF NOT EXISTS "document_status" TEXT;
ALTER TABLE "enterprise_financial_documents" ADD COLUMN IF NOT EXISTS "sub_total_excl_vat" DECIMAL(14,2);
ALTER TABLE "enterprise_financial_documents" ADD COLUMN IF NOT EXISTS "total_with_vat" DECIMAL(14,2);
ALTER TABLE "enterprise_financial_documents" ADD COLUMN IF NOT EXISTS "vat_calculated" DECIMAL(14,2);

-- EnterpriseEvidenceDocument: add file_id
ALTER TABLE "enterprise_evidence_documents" ADD COLUMN IF NOT EXISTS "file_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "enterprise_evidence_documents_file_id_key" ON "enterprise_evidence_documents"("file_id") WHERE "file_id" IS NOT NULL;
