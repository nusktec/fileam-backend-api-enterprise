-- AlterTable
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "payment_type" TEXT NOT NULL DEFAULT 'Transfer';
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "invoice_due_date" DATE;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "invoice_due_date" DATE;
