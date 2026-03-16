-- Add documentUrl and evidenceVaultId to sales for auto-generated invoice PDFs
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "document_url" TEXT;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "evidence_vault_id" TEXT;
