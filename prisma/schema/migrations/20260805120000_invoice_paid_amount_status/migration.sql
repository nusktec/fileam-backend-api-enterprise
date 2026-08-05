-- AlterTable sales
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "invoice_paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable expenses
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "invoice_paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'Pending';

-- Backfill sales that were already PAID / Paid as fully paid
UPDATE "sales"
SET "invoice_paid_amount" = "total_amount"
WHERE ("status" IN ('PAID', 'Paid') OR "payment_type" = 'Cash')
  AND ("invoice_paid_amount" IS NULL OR "invoice_paid_amount" = 0);
