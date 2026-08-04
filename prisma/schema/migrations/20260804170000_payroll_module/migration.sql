-- AlterTable
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "pfa" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "payroll_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "is_nhf_applicable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payroll_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "payroll_obligations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "due_date" DATE NOT NULL,
    "collecting_authority" TEXT,
    "evidence_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assigned_consultant_id" TEXT,
    "payment_link" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payroll_obligations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_settings_user_id_key" ON "payroll_settings"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_obligations_user_id_type_period_key" ON "payroll_obligations"("user_id", "type", "period");
CREATE INDEX IF NOT EXISTS "payroll_obligations_user_id_type_idx" ON "payroll_obligations"("user_id", "type");

DO $$ BEGIN
 ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "payroll_obligations" ADD CONSTRAINT "payroll_obligations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
