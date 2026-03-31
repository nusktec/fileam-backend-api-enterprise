-- AlterTable
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "supplier_name" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "supplier_id" TEXT;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "customer_id" TEXT;
