-- CreateTable
CREATE TABLE "enterprise_business_profiles" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "business_type" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "registration_date" DATE NOT NULL,
    "tin" TEXT NOT NULL,
    "business_address" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "email_address" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "subscription_plan" TEXT NOT NULL,
    "monthly_payment" DECIMAL(14,2) NOT NULL,
    "next_renewal_date" DATE NOT NULL,
    "compliance_percent" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_business_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_compliance_activities" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "event_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_compliance_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_vat_computations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "vat_type" TEXT NOT NULL,
    "vat_period" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "sales_amount_excl_vat" DECIMAL(14,2) NOT NULL,
    "purchase_amount_excl_vat" DECIMAL(14,2) NOT NULL,
    "vat_rate" DECIMAL(5,2) NOT NULL,
    "sales_vat" DECIMAL(14,2) NOT NULL,
    "purchase_vat" DECIMAL(14,2) NOT NULL,
    "net_vat_payable" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_vat_computations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_vat_monthly" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "vat_payable" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_vat_monthly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_threshold_statuses" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_threshold_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_transactions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_financial_documents" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "description" TEXT,
    "document_date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "file_url" TEXT,
    "processing_status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_financial_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_invoices" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "client_address" TEXT NOT NULL,
    "client_email" TEXT NOT NULL,
    "date_issued" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "payment_status" TEXT NOT NULL DEFAULT 'Outstanding',
    "total_amount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_invoice_line_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_evidence_documents" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "document_name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "document_date" DATE NOT NULL,
    "description" TEXT,
    "file_url" TEXT,
    "file_size_kb" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "uploader_id" TEXT,
    "approver_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "notes" TEXT,
    "last_modified" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_evidence_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_document_signatures" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "document_name" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "date_signed" TIMESTAMP(3) NOT NULL,
    "signed_by" TEXT NOT NULL,
    "signer_email" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "signature_method" TEXT NOT NULL,
    "document_hash" TEXT NOT NULL,
    "signature_data" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_document_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_document_audits" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "event" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_document_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_business_profiles_company_id_key" ON "enterprise_business_profiles"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_vat_monthly_company_id_year_month_key" ON "enterprise_vat_monthly"("company_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_threshold_statuses_company_id_key" ON "enterprise_threshold_statuses"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_invoices_company_id_invoice_number_key" ON "enterprise_invoices"("company_id", "invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_document_signatures_document_id_key" ON "enterprise_document_signatures"("document_id");

-- AddForeignKey
ALTER TABLE "enterprise_business_profiles" ADD CONSTRAINT "enterprise_business_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_compliance_activities" ADD CONSTRAINT "enterprise_compliance_activities_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "enterprise_business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_vat_computations" ADD CONSTRAINT "enterprise_vat_computations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_vat_monthly" ADD CONSTRAINT "enterprise_vat_monthly_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_threshold_statuses" ADD CONSTRAINT "enterprise_threshold_statuses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_transactions" ADD CONSTRAINT "enterprise_transactions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_financial_documents" ADD CONSTRAINT "enterprise_financial_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_invoices" ADD CONSTRAINT "enterprise_invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_invoice_line_items" ADD CONSTRAINT "enterprise_invoice_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "enterprise_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_evidence_documents" ADD CONSTRAINT "enterprise_evidence_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_document_signatures" ADD CONSTRAINT "enterprise_document_signatures_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "enterprise_evidence_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_document_audits" ADD CONSTRAINT "enterprise_document_audits_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "enterprise_evidence_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
