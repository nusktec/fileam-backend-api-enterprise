ALTER TABLE "expenses"
  ADD COLUMN IF NOT EXISTS "expense_class" TEXT;

ALTER TABLE "expenses"
  ADD COLUMN IF NOT EXISTS "is_deductible" BOOLEAN NOT NULL DEFAULT false;

UPDATE "expenses"
SET "expense_class" = 'uncategorized'
WHERE "expense_class" IS NULL OR "expense_class" = 'ambiguous';

ALTER TABLE "expenses"
  ALTER COLUMN "expense_class" SET DEFAULT 'uncategorized';

ALTER TABLE "expenses"
  ALTER COLUMN "expense_class" SET NOT NULL;
