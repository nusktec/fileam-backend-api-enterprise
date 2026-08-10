-- Mobile Evidence Vault: persisted manual uploads (+ optional AUTO mirrors)

CREATE TABLE IF NOT EXISTS "evidence_vault_documents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "file_size_kb" INTEGER,
    "document_url" TEXT,
    "evidence_vault_id" TEXT,
    "linked_record" TEXT,
    "linked_record_name" TEXT,
    "linked_record_document_id" TEXT,
    "uploaded_by" TEXT,
    "uploaded_date" TIMESTAMP(3) NOT NULL,
    "linked_document_creation_date" TIMESTAMP(3),
    "dedupe_key" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_vault_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "evidence_vault_documents_user_id_dedupe_key_key"
  ON "evidence_vault_documents"("user_id", "dedupe_key");

CREATE INDEX IF NOT EXISTS "evidence_vault_documents_user_id_category_idx"
  ON "evidence_vault_documents"("user_id", "category");

CREATE INDEX IF NOT EXISTS "evidence_vault_documents_user_id_linked_record_document_id_idx"
  ON "evidence_vault_documents"("user_id", "linked_record_document_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'evidence_vault_documents_user_id_fkey'
  ) THEN
    ALTER TABLE "evidence_vault_documents"
      ADD CONSTRAINT "evidence_vault_documents_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
