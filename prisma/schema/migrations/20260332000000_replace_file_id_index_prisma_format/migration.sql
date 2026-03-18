-- Replace partial unique index with full index so Prisma recognizes it (stops migrate dev from regenerating)
DROP INDEX IF EXISTS "enterprise_evidence_documents_file_id_key";
CREATE UNIQUE INDEX "enterprise_evidence_documents_file_id_key" ON "enterprise_evidence_documents"("file_id");
