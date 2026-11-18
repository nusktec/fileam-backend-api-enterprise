CREATE TABLE IF NOT EXISTS "enterprise_filing_preparation_steps" (
    "id" TEXT NOT NULL,
    "filing_id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "step_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "file_url" TEXT,
    "completed_at" TIMESTAMP(3),
    "completed_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "enterprise_filing_preparation_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "enterprise_filing_preparation_steps_filing_id_step_id_key"
  ON "enterprise_filing_preparation_steps"("filing_id", "step_id");
CREATE INDEX IF NOT EXISTS "enterprise_filing_preparation_steps_client_user_id_idx"
  ON "enterprise_filing_preparation_steps"("client_user_id");
