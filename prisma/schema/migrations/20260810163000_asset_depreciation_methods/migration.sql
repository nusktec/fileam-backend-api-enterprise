-- Multi-method asset depreciation fields + rename legacy method values

ALTER TABLE "assets"
  ADD COLUMN IF NOT EXISTS "depreciation_rate" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "total_estimated_unit" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "unit_produced" DECIMAL(14,2);

UPDATE "assets"
SET "depreciation_method" = 'REDUCING_BALANCE'
WHERE "depreciation_method" = 'DECLINING_BALANCE';

UPDATE "assets"
SET "depreciation_method" = 'UNIT_OF_PRODUCTION'
WHERE "depreciation_method" = 'UNITS_OF_PRODUCTION';
