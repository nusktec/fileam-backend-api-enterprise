-- AlterTable
ALTER TABLE "enterprise_invoices" ADD COLUMN "financial_document_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_invoices_financial_document_id_key" ON "enterprise_invoices"("financial_document_id");

-- AddForeignKey
ALTER TABLE "enterprise_invoices" ADD CONSTRAINT "enterprise_invoices_financial_document_id_fkey" FOREIGN KEY ("financial_document_id") REFERENCES "enterprise_financial_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
