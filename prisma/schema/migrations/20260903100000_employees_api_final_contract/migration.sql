-- Employees API final contract: drop fields not in POST/PATCH spec.

ALTER TABLE "employees" DROP COLUMN IF EXISTS "other_taxable_income";
ALTER TABLE "employees" DROP COLUMN IF EXISTS "other_allowable_deductions";

COMMENT ON COLUMN "employees"."nhis_health_insurance" IS 'Monthly NHIS premium (annual relief = monthly × 12).';
COMMENT ON COLUMN "employees"."life_assurance_premium" IS 'Monthly life assurance premium (annual relief = monthly × 12).';
COMMENT ON COLUMN "employees"."mortgage_interest" IS 'Monthly mortgage interest (annual relief = monthly × 12).';
COMMENT ON COLUMN "employees"."annual_house_rent" IS 'Annual house rent paid (relief = MIN(20% × rent, ₦500k); do not multiply by 12).';
