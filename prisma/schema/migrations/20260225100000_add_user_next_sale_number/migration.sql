-- AlterTable: add next_sale_number to User (table name is "User" in this project)
ALTER TABLE "User" ADD COLUMN "next_sale_number" INTEGER NOT NULL DEFAULT 1;

-- Drop existing unique on sales.invoice_number and add composite unique (user_id, invoice_number)
DROP INDEX IF EXISTS "sales_invoice_number_key";
CREATE UNIQUE INDEX "sales_user_id_invoice_number_key" ON "sales"("user_id", "invoice_number");
