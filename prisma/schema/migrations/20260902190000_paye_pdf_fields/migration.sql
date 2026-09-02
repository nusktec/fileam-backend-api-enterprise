-- Align employee PAYE inputs with Universal Nigeria PAYE Formula 2026 (PDF).

ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "other_taxable_income" DECIMAL(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE "employees"
  RENAME COLUMN "qualifying_medical_expenses" TO "other_allowable_deductions";

COMMENT ON COLUMN "employees"."nhis_health_insurance" IS 'Monthly NHIS premium (annual relief = monthly × 12).';
COMMENT ON COLUMN "employees"."other_allowable_deductions" IS 'Annual other allowable deductions (PDF taxable income relief).';
