-- Sale undo fields
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "inventory_sale_id" TEXT;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "undo_at" TIMESTAMP(3);
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "undo_reason" TEXT;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "reversing_entry_id" TEXT;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "reversing_entry_date" DATE;
CREATE UNIQUE INDEX IF NOT EXISTS "sales_inventory_sale_id_key" ON "sales"("inventory_sale_id");

-- Expense undo fields
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "converted_to_asset_id" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "undo_at" TIMESTAMP(3);
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "undo_reason" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "reversing_entry_id" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "reversing_entry_date" DATE;

-- Inventory sale undo
ALTER TABLE "inventory_sales" ADD COLUMN IF NOT EXISTS "linked_sale_id" TEXT;
ALTER TABLE "inventory_sales" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'live';
ALTER TABLE "inventory_sales" ADD COLUMN IF NOT EXISTS "undo_at" TIMESTAMP(3);
ALTER TABLE "inventory_sales" ADD COLUMN IF NOT EXISTS "undo_reason" TEXT;
ALTER TABLE "inventory_sales" ADD COLUMN IF NOT EXISTS "reversing_entry_id" TEXT;
ALTER TABLE "inventory_sales" ADD COLUMN IF NOT EXISTS "reversing_entry_date" DATE;
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_sales_linked_sale_id_key" ON "inventory_sales"("linked_sale_id");
CREATE INDEX IF NOT EXISTS "inventory_sales_user_id_status_idx" ON "inventory_sales"("user_id", "status");

-- Liability undo
ALTER TABLE "registered_liabilities" ADD COLUMN IF NOT EXISTS "record_status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "registered_liabilities" ADD COLUMN IF NOT EXISTS "undo_at" TIMESTAMP(3);
ALTER TABLE "registered_liabilities" ADD COLUMN IF NOT EXISTS "undo_reason" TEXT;
ALTER TABLE "registered_liabilities" ADD COLUMN IF NOT EXISTS "reversing_entry_id" TEXT;
ALTER TABLE "registered_liabilities" ADD COLUMN IF NOT EXISTS "reversing_entry_date" DATE;

ALTER TABLE "liability_repayments" ADD COLUMN IF NOT EXISTS "record_status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "liability_repayments" ADD COLUMN IF NOT EXISTS "undo_at" TIMESTAMP(3);
ALTER TABLE "liability_repayments" ADD COLUMN IF NOT EXISTS "undo_reason" TEXT;
ALTER TABLE "liability_repayments" ADD COLUMN IF NOT EXISTS "reversing_entry_id" TEXT;
ALTER TABLE "liability_repayments" ADD COLUMN IF NOT EXISTS "reversing_entry_date" DATE;

-- Payer / beneficiary undo
ALTER TABLE "payers" ADD COLUMN IF NOT EXISTS "voided" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "payers" ADD COLUMN IF NOT EXISTS "undo_at" TIMESTAMP(3);
ALTER TABLE "payers" ADD COLUMN IF NOT EXISTS "undo_reason" TEXT;

ALTER TABLE "payer_transactions" ADD COLUMN IF NOT EXISTS "undo_at" TIMESTAMP(3);
ALTER TABLE "payer_transactions" ADD COLUMN IF NOT EXISTS "undo_reason" TEXT;
ALTER TABLE "payer_transactions" ADD COLUMN IF NOT EXISTS "reversing_entry_id" TEXT;
ALTER TABLE "payer_transactions" ADD COLUMN IF NOT EXISTS "reversing_entry_date" DATE;

ALTER TABLE "beneficiaries" ADD COLUMN IF NOT EXISTS "voided" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "beneficiaries" ADD COLUMN IF NOT EXISTS "undo_at" TIMESTAMP(3);
ALTER TABLE "beneficiaries" ADD COLUMN IF NOT EXISTS "undo_reason" TEXT;

ALTER TABLE "beneficiary_transactions" ADD COLUMN IF NOT EXISTS "undo_at" TIMESTAMP(3);
ALTER TABLE "beneficiary_transactions" ADD COLUMN IF NOT EXISTS "undo_reason" TEXT;
ALTER TABLE "beneficiary_transactions" ADD COLUMN IF NOT EXISTS "reversing_entry_id" TEXT;
ALTER TABLE "beneficiary_transactions" ADD COLUMN IF NOT EXISTS "reversing_entry_date" DATE;

-- Asset undo
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "undo_at" TIMESTAMP(3);
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "undo_reason" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "reversing_entry_id" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "reversing_entry_date" DATE;

ALTER TABLE "asset_sales" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'live';
ALTER TABLE "asset_sales" ADD COLUMN IF NOT EXISTS "undo_at" TIMESTAMP(3);
ALTER TABLE "asset_sales" ADD COLUMN IF NOT EXISTS "undo_reason" TEXT;
ALTER TABLE "asset_sales" ADD COLUMN IF NOT EXISTS "reversing_entry_id" TEXT;
ALTER TABLE "asset_sales" ADD COLUMN IF NOT EXISTS "reversing_entry_date" DATE;

ALTER TABLE "asset_disposals" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'live';
ALTER TABLE "asset_disposals" ADD COLUMN IF NOT EXISTS "undo_at" TIMESTAMP(3);
ALTER TABLE "asset_disposals" ADD COLUMN IF NOT EXISTS "undo_reason" TEXT;
ALTER TABLE "asset_disposals" ADD COLUMN IF NOT EXISTS "reversing_entry_id" TEXT;
ALTER TABLE "asset_disposals" ADD COLUMN IF NOT EXISTS "reversing_entry_date" DATE;

ALTER TABLE "asset_transfers" ADD COLUMN IF NOT EXISTS "undo_at" TIMESTAMP(3);
ALTER TABLE "asset_transfers" ADD COLUMN IF NOT EXISTS "undo_reason" TEXT;
ALTER TABLE "asset_transfers" ADD COLUMN IF NOT EXISTS "reversing_entry_id" TEXT;
ALTER TABLE "asset_transfers" ADD COLUMN IF NOT EXISTS "reversing_entry_date" DATE;

-- Employer income history freeze
ALTER TABLE "employer_income_history" ADD COLUMN IF NOT EXISTS "is_projection" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "employer_income_history" ADD COLUMN IF NOT EXISTS "frozen_at" TIMESTAMP(3);

-- Employee / employer terms history
CREATE TABLE IF NOT EXISTS "employee_terms" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "effective_from" TEXT NOT NULL,
    "basic_salary" DECIMAL(14,2) NOT NULL,
    "housing_allowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transport_allowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "meal_allowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other_allowances" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "state_of_residence" TEXT,
    "employment_type" TEXT NOT NULL,
    "annual_house_rent" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "nhf" BOOLEAN NOT NULL DEFAULT true,
    "nhis_health_insurance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "life_assurance_premium" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "mortgage_interest" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_terms_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "employee_terms_employee_id_effective_from_key" ON "employee_terms"("employee_id", "effective_from");
CREATE INDEX IF NOT EXISTS "employee_terms_employee_id_effective_from_idx" ON "employee_terms"("employee_id", "effective_from");
ALTER TABLE "employee_terms" DROP CONSTRAINT IF EXISTS "employee_terms_employee_id_fkey";
ALTER TABLE "employee_terms" ADD CONSTRAINT "employee_terms_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "payroll_period_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "gross" DECIMAL(14,2) NOT NULL,
    "paye" DECIMAL(14,2) NOT NULL,
    "pension_employee" DECIMAL(14,2) NOT NULL,
    "pension_employer" DECIMAL(14,2) NOT NULL,
    "nhf" DECIMAL(14,2) NOT NULL,
    "net_pay" DECIMAL(14,2) NOT NULL,
    "frozen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payroll_period_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_period_snapshots_employee_id_period_key_key" ON "payroll_period_snapshots"("employee_id", "period_key");
CREATE INDEX IF NOT EXISTS "payroll_period_snapshots_user_id_period_key_idx" ON "payroll_period_snapshots"("user_id", "period_key");
ALTER TABLE "payroll_period_snapshots" DROP CONSTRAINT IF EXISTS "payroll_period_snapshots_user_id_fkey";
ALTER TABLE "payroll_period_snapshots" ADD CONSTRAINT "payroll_period_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_period_snapshots" DROP CONSTRAINT IF EXISTS "payroll_period_snapshots_employee_id_fkey";
ALTER TABLE "payroll_period_snapshots" ADD CONSTRAINT "payroll_period_snapshots_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "employer_terms" (
    "id" TEXT NOT NULL,
    "employer_id" TEXT NOT NULL,
    "effective_from" TEXT NOT NULL,
    "employer_type" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "payment_method" TEXT NOT NULL,
    "payment_frequency" TEXT NOT NULL,
    "basic_salary" DECIMAL(14,2) NOT NULL,
    "housing_allowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transport_allowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other_allowances" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bonuses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "commissions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "has_pension" BOOLEAN NOT NULL DEFAULT false,
    "pension_status" TEXT,
    "employee_rate" DECIMAL(5,2),
    "employer_rate" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employer_terms_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "employer_terms_employer_id_effective_from_key" ON "employer_terms"("employer_id", "effective_from");
CREATE INDEX IF NOT EXISTS "employer_terms_employer_id_effective_from_idx" ON "employer_terms"("employer_id", "effective_from");
ALTER TABLE "employer_terms" DROP CONSTRAINT IF EXISTS "employer_terms_employer_id_fkey";
ALTER TABLE "employer_terms" ADD CONSTRAINT "employer_terms_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "employers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
