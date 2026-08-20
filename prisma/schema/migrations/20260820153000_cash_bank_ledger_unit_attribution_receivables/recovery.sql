-- Recovery for failed 20260820153000_cash_bank_ledger_unit_attribution_receivables
-- Use when migrate deploy failed (e.g. 42P07 duplicate index, 42P01 wrong FK table name).
-- Safe to re-run: uses IF NOT EXISTS / DO blocks where supported.
-- Note: user FKs must reference "User" (capital U), not "users".

-- Drop truncated duplicate index if the failed CREATE INDEX left nothing,
-- or rename if the unique index was created under the truncated name.
DROP INDEX IF EXISTS "unit_attribution_production_records_unit_attribution_id_period_";

CREATE UNIQUE INDEX IF NOT EXISTS "uap_records_attribution_period_uniq"
  ON "unit_attribution_production_records"("unit_attribution_id", "period_start");

CREATE UNIQUE INDEX IF NOT EXISTS "receivables_user_id_receivable_code_key"
  ON "receivables"("user_id", "receivable_code");
CREATE INDEX IF NOT EXISTS "receivables_user_id_type_idx"
  ON "receivables"("user_id", "type");
CREATE INDEX IF NOT EXISTS "receivables_user_id_status_idx"
  ON "receivables"("user_id", "status");

DO $$ BEGIN
  ALTER TABLE "cash_balances" ADD CONSTRAINT "cash_balances_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_fkey"
    FOREIGN KEY ("transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "unit_attributions" ADD CONSTRAINT "unit_attributions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "unit_attributions" ADD CONSTRAINT "unit_attributions_asset_id_fkey"
    FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "unit_attribution_production_records" ADD CONSTRAINT "unit_attribution_production_records_unit_attribution_id_fkey"
    FOREIGN KEY ("unit_attribution_id") REFERENCES "unit_attributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "receivables" ADD CONSTRAINT "receivables_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
