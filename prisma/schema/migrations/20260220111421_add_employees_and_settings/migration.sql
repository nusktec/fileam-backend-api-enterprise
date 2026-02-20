-- AlterTable
ALTER TABLE "User" ADD COLUMN     "compliance_updates_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "filing_reminders_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "payers_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "bank_account" TEXT,
ADD COLUMN     "business_type" TEXT,
ADD COLUMN     "rc_number" TEXT,
ADD COLUMN     "sector" TEXT;

-- AlterTable
ALTER TABLE "consultant_connections" ADD COLUMN     "consultant_display_name" TEXT,
ADD COLUMN     "managing_tax_forms" TEXT;

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "job_title" TEXT NOT NULL,
    "employment_type" TEXT NOT NULL,
    "basic_salary" DECIMAL(14,2) NOT NULL,
    "housing_allowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transport_allowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "meal_allowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other_allowances" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "state_of_residence" TEXT,
    "tin" TEXT,
    "pension_rsa" TEXT,
    "start_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_id_key" ON "employees"("employee_id");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
