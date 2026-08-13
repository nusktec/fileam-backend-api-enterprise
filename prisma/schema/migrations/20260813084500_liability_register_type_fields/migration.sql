-- Type-specific registration fields (POST /mobile/liabilities spec)

ALTER TABLE "registered_liabilities"
  ADD COLUMN IF NOT EXISTS "bank_name" TEXT,
  ADD COLUMN IF NOT EXISTS "loan_purpose" TEXT,
  ADD COLUMN IF NOT EXISTS "collateral" TEXT,
  ADD COLUMN IF NOT EXISTS "property_description" TEXT,
  ADD COLUMN IF NOT EXISTS "property_value" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "equipment_name" TEXT,
  ADD COLUMN IF NOT EXISTS "equipment_value" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "serial_number" TEXT,
  ADD COLUMN IF NOT EXISTS "asset_description" TEXT,
  ADD COLUMN IF NOT EXISTS "lease_payment_amount" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "conversion_trigger" TEXT,
  ADD COLUMN IF NOT EXISTS "conversion_price" TEXT,
  ADD COLUMN IF NOT EXISTS "conversion_date" DATE;

-- Align legacy singular enum with POST spec
UPDATE "registered_liabilities"
SET "liability_type" = 'OTHER_LONG_TERM_BORROWINGS'
WHERE "liability_type" = 'OTHER_LONG_TERM_BORROWING';
