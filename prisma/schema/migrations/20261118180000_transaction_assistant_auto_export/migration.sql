CREATE TABLE IF NOT EXISTS "transaction_assistant_auto_exports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "auto_export_on" BOOLEAN NOT NULL DEFAULT false,
    "missing_evidence" BOOLEAN NOT NULL DEFAULT true,
    "uncategorised" BOOLEAN NOT NULL DEFAULT false,
    "unknown_counterparty" BOOLEAN NOT NULL DEFAULT false,
    "unusual_amounts" BOOLEAN NOT NULL DEFAULT true,
    "unmatched_payments" BOOLEAN NOT NULL DEFAULT false,
    "default_note" VARCHAR(500) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_assistant_auto_exports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "transaction_assistant_auto_exports_user_id_key"
  ON "transaction_assistant_auto_exports"("user_id");

DO $$ BEGIN
  ALTER TABLE "transaction_assistant_auto_exports"
    ADD CONSTRAINT "transaction_assistant_auto_exports_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
