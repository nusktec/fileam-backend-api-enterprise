-- Registered liabilities, schedule, and immutable repayment history
-- (Liability Register API Spec Latest v2 + Repayment History Spec)

CREATE TABLE IF NOT EXISTS "registered_liabilities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "liability_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "liability_type" TEXT NOT NULL,
    "creditor" TEXT NOT NULL,
    "original_amount" DECIMAL(14,2) NOT NULL,
    "outstanding_principal" DECIMAL(14,2) NOT NULL,
    "accrued_interest" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "interest_rate" DECIMAL(8,4),
    "interest_rate_type" TEXT,
    "interest_calculation_method" TEXT,
    "repayment_frequency" TEXT NOT NULL,
    "repayment_structure" TEXT NOT NULL,
    "installment_amount" DECIMAL(14,2),
    "start_date" DATE NOT NULL,
    "maturity_date" DATE,
    "next_due_date" DATE,
    "total_principal_paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_interest_paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount_repaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payment_status" TEXT NOT NULL DEFAULT 'PENDING',
    "repayment_count" INTEGER NOT NULL DEFAULT 0,
    "last_repayment_date" DATE,
    "evidence_url" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "registered_liabilities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "registered_liabilities_user_id_liability_code_key"
  ON "registered_liabilities"("user_id", "liability_code");
CREATE INDEX IF NOT EXISTS "registered_liabilities_user_id_liability_type_idx"
  ON "registered_liabilities"("user_id", "liability_type");

CREATE TABLE IF NOT EXISTS "liability_schedule_items" (
    "id" TEXT NOT NULL,
    "liability_id" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "amount_due" DECIMAL(14,2) NOT NULL,
    "amount_paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "liability_schedule_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "liability_schedule_items_liability_id_due_date_idx"
  ON "liability_schedule_items"("liability_id", "due_date");

CREATE TABLE IF NOT EXISTS "liability_repayments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "liability_id" TEXT NOT NULL,
    "repayment_code" TEXT NOT NULL,
    "repayment_type" TEXT NOT NULL,
    "repayment_amount" DECIMAL(14,2) NOT NULL,
    "principal_amount" DECIMAL(14,2) NOT NULL,
    "interest_amount" DECIMAL(14,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "payment_source" TEXT NOT NULL,
    "balance_before_repayment" DECIMAL(14,2) NOT NULL,
    "balance_after_repayment" DECIMAL(14,2) NOT NULL,
    "payment_status" TEXT NOT NULL,
    "is_overdue" BOOLEAN NOT NULL DEFAULT false,
    "days_overdue" INTEGER NOT NULL DEFAULT 0,
    "evidence_url" TEXT,
    "note" TEXT,
    "interest_expense_id" TEXT,
    "principal_expense_id" TEXT,
    "evidence_vault_doc_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "liability_repayments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "liability_repayments_user_id_repayment_code_key"
  ON "liability_repayments"("user_id", "repayment_code");
CREATE INDEX IF NOT EXISTS "liability_repayments_user_id_payment_date_idx"
  ON "liability_repayments"("user_id", "payment_date");
CREATE INDEX IF NOT EXISTS "liability_repayments_liability_id_idx"
  ON "liability_repayments"("liability_id");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'registered_liabilities_user_id_fkey'
  ) THEN
    ALTER TABLE "registered_liabilities"
      ADD CONSTRAINT "registered_liabilities_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'liability_schedule_items_liability_id_fkey'
  ) THEN
    ALTER TABLE "liability_schedule_items"
      ADD CONSTRAINT "liability_schedule_items_liability_id_fkey"
      FOREIGN KEY ("liability_id") REFERENCES "registered_liabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'liability_repayments_user_id_fkey'
  ) THEN
    ALTER TABLE "liability_repayments"
      ADD CONSTRAINT "liability_repayments_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'liability_repayments_liability_id_fkey'
  ) THEN
    ALTER TABLE "liability_repayments"
      ADD CONSTRAINT "liability_repayments_liability_id_fkey"
      FOREIGN KEY ("liability_id") REFERENCES "registered_liabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Idempotent upgrade if an earlier narrower migration already created the table
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'registered_liabilities'
  ) THEN
    ALTER TABLE "registered_liabilities"
      ADD COLUMN IF NOT EXISTS "creditor" TEXT,
      ADD COLUMN IF NOT EXISTS "interest_rate" DECIMAL(8,4),
      ADD COLUMN IF NOT EXISTS "interest_rate_type" TEXT,
      ADD COLUMN IF NOT EXISTS "interest_calculation_method" TEXT,
      ADD COLUMN IF NOT EXISTS "repayment_structure" TEXT,
      ADD COLUMN IF NOT EXISTS "evidence_url" TEXT;

    -- Backfill NOT NULL columns if table existed without them
    UPDATE "registered_liabilities" SET "creditor" = COALESCE("creditor", 'Unknown') WHERE "creditor" IS NULL;
    UPDATE "registered_liabilities" SET "repayment_structure" = COALESCE("repayment_structure", 'AMORTIZED') WHERE "repayment_structure" IS NULL;

    ALTER TABLE "registered_liabilities" ALTER COLUMN "creditor" SET NOT NULL;
    ALTER TABLE "registered_liabilities" ALTER COLUMN "repayment_structure" SET NOT NULL;

    -- Drop legacy annual-only rate column if present
    ALTER TABLE "registered_liabilities" DROP COLUMN IF EXISTS "interest_rate_annual";
  END IF;
END $$;
