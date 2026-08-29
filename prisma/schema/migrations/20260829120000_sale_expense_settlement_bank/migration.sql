-- Per PDF: Transfer/Card confirm posts to the user's selected business bank account.
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "settlement_bank_code" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "settlement_bank_code" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "payment_confirmed_at" TIMESTAMPTZ;
