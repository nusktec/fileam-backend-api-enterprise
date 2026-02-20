-- AlterTable
ALTER TABLE "tax_payables" ADD COLUMN     "document_url" TEXT,
ADD COLUMN     "evidence_vault_id" TEXT,
ADD COLUMN     "receipt_url" TEXT,
ADD COLUMN     "state_of_operation" TEXT,
ADD COLUMN     "submitted_at" TIMESTAMP(3),
ADD COLUMN     "vat_registration_number" TEXT;

-- CreateTable
CREATE TABLE "filing_drafts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tax_type" TEXT NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "state_of_operation" TEXT,
    "vat_registration_number" TEXT,
    "wht_type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "filing_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filing_timeline_events" (
    "id" TEXT NOT NULL,
    "tax_payable_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "description" TEXT,
    "event_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "filing_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "report_type" TEXT NOT NULL,
    "period_label" TEXT NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'PDF',
    "document_url" TEXT,
    "evidence_vault_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'stored',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_payments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "gross_amount" DECIMAL(14,2) NOT NULL,
    "wht_rate" DECIMAL(5,2) NOT NULL,
    "wht_deducted" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wht_schedule_lines" (
    "id" TEXT NOT NULL,
    "filing_draft_id" TEXT NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "gross_amount" DECIMAL(14,2) NOT NULL,
    "wht_rate" DECIMAL(5,2) NOT NULL,
    "wht_deducted" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wht_schedule_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "filing_drafts_user_id_tax_type_period_year_period_month_key" ON "filing_drafts"("user_id", "tax_type", "period_year", "period_month");

-- AddForeignKey
ALTER TABLE "filing_drafts" ADD CONSTRAINT "filing_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "filing_timeline_events" ADD CONSTRAINT "filing_timeline_events_tax_payable_id_fkey" FOREIGN KEY ("tax_payable_id") REFERENCES "tax_payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wht_schedule_lines" ADD CONSTRAINT "wht_schedule_lines_filing_draft_id_fkey" FOREIGN KEY ("filing_draft_id") REFERENCES "filing_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
