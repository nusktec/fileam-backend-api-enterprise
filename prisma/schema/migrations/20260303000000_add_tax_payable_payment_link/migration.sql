-- AlterTable tax_payables: add payment_link for frontend payment URL
ALTER TABLE "tax_payables" ADD COLUMN "payment_link" TEXT;
