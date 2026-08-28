-- Filing workspace: 12-step wizard persistence on tax_payables + generated documents

ALTER TABLE "tax_payables"
  ADD COLUMN IF NOT EXISTS "current_step" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "completed_steps" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "frozen" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "frozen_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "draft_inputs" JSONB,
  ADD COLUMN IF NOT EXISTS "validation" JSONB,
  ADD COLUMN IF NOT EXISTS "acknowledged_gaps" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reviewed_document_ids" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "submission_reference" TEXT,
  ADD COLUMN IF NOT EXISTS "rrr" TEXT,
  ADD COLUMN IF NOT EXISTS "submission_proof_name" TEXT,
  ADD COLUMN IF NOT EXISTS "submission_proof_url" TEXT,
  ADD COLUMN IF NOT EXISTS "payment_receipt_name" TEXT,
  ADD COLUMN IF NOT EXISTS "payment_receipt_url" TEXT,
  ADD COLUMN IF NOT EXISTS "forms_generated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "package_url" TEXT,
  ADD COLUMN IF NOT EXISTS "package_expires_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "portal_opened_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "prior_period_carry" JSONB,
  ADD COLUMN IF NOT EXISTS "books_changed_since_freeze" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "filing_documents" (
  "id" TEXT NOT NULL,
  "tax_payable_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ready',
  "content_type" TEXT NOT NULL DEFAULT 'application/pdf',
  "file_url" TEXT,
  "file_key" TEXT,
  "file_name" TEXT,
  "bytes" INTEGER,
  "source" TEXT NOT NULL DEFAULT 'generated',
  "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  CONSTRAINT "filing_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "filing_documents_tax_payable_id_document_id_key"
  ON "filing_documents"("tax_payable_id", "document_id");

CREATE INDEX IF NOT EXISTS "filing_documents_tax_payable_id_idx"
  ON "filing_documents"("tax_payable_id");

ALTER TABLE "filing_documents"
  ADD CONSTRAINT "filing_documents_tax_payable_id_fkey"
  FOREIGN KEY ("tax_payable_id") REFERENCES "tax_payables"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
