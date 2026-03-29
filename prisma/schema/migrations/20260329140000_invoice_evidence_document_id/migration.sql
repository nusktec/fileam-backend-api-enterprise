-- AlterTable
ALTER TABLE "enterprise_invoices" ADD COLUMN "evidence_document_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_invoices_evidence_document_id_key" ON "enterprise_invoices"("evidence_document_id");

-- AddForeignKey
ALTER TABLE "enterprise_invoices" ADD CONSTRAINT "enterprise_invoices_evidence_document_id_fkey" FOREIGN KEY ("evidence_document_id") REFERENCES "enterprise_evidence_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
