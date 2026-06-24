-- Add expense_type to expenses (OPEX, COGS, CAPEX, Tax)
ALTER TABLE "expenses" ADD COLUMN "expense_type" TEXT NOT NULL DEFAULT 'OPEX';
