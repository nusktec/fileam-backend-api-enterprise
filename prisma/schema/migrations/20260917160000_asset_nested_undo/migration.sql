-- User-added cash undo
ALTER TABLE "cash_balances" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'live';
ALTER TABLE "cash_balances" ADD COLUMN IF NOT EXISTS "undo_at" TIMESTAMP(3);
ALTER TABLE "cash_balances" ADD COLUMN IF NOT EXISTS "undo_reason" TEXT;
ALTER TABLE "cash_balances" ADD COLUMN IF NOT EXISTS "reversing_entry_id" TEXT;
ALTER TABLE "cash_balances" ADD COLUMN IF NOT EXISTS "reversing_entry_date" DATE;
CREATE INDEX IF NOT EXISTS "cash_balances_user_id_status_idx" ON "cash_balances"("user_id", "status");

-- User-added bank undo
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'live';
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "undo_at" TIMESTAMP(3);
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "undo_reason" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "reversing_entry_id" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "reversing_entry_date" DATE;
CREATE INDEX IF NOT EXISTS "bank_accounts_user_id_status_idx" ON "bank_accounts"("user_id", "status");

-- User-added receivable undo (settlement stays on status)
ALTER TABLE "receivables" ADD COLUMN IF NOT EXISTS "record_status" TEXT NOT NULL DEFAULT 'live';
ALTER TABLE "receivables" ADD COLUMN IF NOT EXISTS "undo_at" TIMESTAMP(3);
ALTER TABLE "receivables" ADD COLUMN IF NOT EXISTS "undo_reason" TEXT;
ALTER TABLE "receivables" ADD COLUMN IF NOT EXISTS "reversing_entry_id" TEXT;
ALTER TABLE "receivables" ADD COLUMN IF NOT EXISTS "reversing_entry_date" DATE;
CREATE INDEX IF NOT EXISTS "receivables_user_id_record_status_idx" ON "receivables"("user_id", "record_status");

-- Unit attribution link undo
ALTER TABLE "unit_attributions" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'live';
ALTER TABLE "unit_attributions" ADD COLUMN IF NOT EXISTS "undo_at" TIMESTAMP(3);
ALTER TABLE "unit_attributions" ADD COLUMN IF NOT EXISTS "undo_reason" TEXT;
ALTER TABLE "unit_attributions" ADD COLUMN IF NOT EXISTS "reversing_entry_id" TEXT;
ALTER TABLE "unit_attributions" ADD COLUMN IF NOT EXISTS "reversing_entry_date" DATE;
CREATE INDEX IF NOT EXISTS "unit_attributions_user_id_status_idx" ON "unit_attributions"("user_id", "status");

-- Production record undo
ALTER TABLE "unit_attribution_production_records" ADD COLUMN IF NOT EXISTS "undo_at" TIMESTAMP(3);
ALTER TABLE "unit_attribution_production_records" ADD COLUMN IF NOT EXISTS "undo_reason" TEXT;
ALTER TABLE "unit_attribution_production_records" ADD COLUMN IF NOT EXISTS "reversing_entry_id" TEXT;
ALTER TABLE "unit_attribution_production_records" ADD COLUMN IF NOT EXISTS "reversing_entry_date" DATE;
