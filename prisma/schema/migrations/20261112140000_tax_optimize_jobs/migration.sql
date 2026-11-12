CREATE TABLE IF NOT EXISTS "enterprise_tax_optimize_jobs" (
    "id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "enterprise_tax_optimize_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "enterprise_tax_optimize_jobs_client_user_id_created_at_idx"
  ON "enterprise_tax_optimize_jobs"("client_user_id", "created_at");
