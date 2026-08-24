ALTER TABLE "tax_payables" ADD COLUMN IF NOT EXISTS "tin" TEXT;
ALTER TABLE "tax_payables" ADD COLUMN IF NOT EXISTS "state_of_residence" TEXT;
ALTER TABLE "tax_payables" ADD COLUMN IF NOT EXISTS "payment_status" TEXT;
ALTER TABLE "tax_payables" ADD COLUMN IF NOT EXISTS "computation" JSONB;
