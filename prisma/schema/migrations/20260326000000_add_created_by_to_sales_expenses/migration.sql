-- Add created_by_id to track who created the transaction (client or consultant)

-- AlterTable sales
ALTER TABLE "sales" ADD COLUMN "created_by_id" TEXT;

-- AlterTable expenses
ALTER TABLE "expenses" ADD COLUMN "created_by_id" TEXT;

-- AddForeignKey sales
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey expenses
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
