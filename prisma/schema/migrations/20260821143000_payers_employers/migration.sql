-- CreateTable
CREATE TABLE "payers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "beneficiary" TEXT,
    "contact_person" TEXT NOT NULL,
    "tin" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "bank_name" TEXT,
    "bank_account" TEXT,
    "vat_applicable" BOOLEAN NOT NULL DEFAULT false,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "wht_applicable" BOOLEAN NOT NULL DEFAULT false,
    "wht_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "wht_note" TEXT,
    "since" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payer_transactions" (
    "id" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL,
    "payment_type" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "payment_reference" TEXT,
    "notes" TEXT,
    "invoice_due_date" TEXT,
    "invoice_amount_paid" JSONB NOT NULL DEFAULT '{"total":0,"items":[]}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payer_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payer_documents" (
    "id" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "category_label" TEXT NOT NULL,
    "date" TEXT,
    "url" TEXT,
    "linked" BOOLEAN NOT NULL DEFAULT true,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payer_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "employer_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "state_of_employment" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT,
    "payment_method" TEXT NOT NULL,
    "payment_frequency" TEXT NOT NULL,
    "basic_salary" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "housing_allowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transport_allowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other_allowances" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bonuses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "commissions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "has_pension" BOOLEAN NOT NULL DEFAULT false,
    "pension_status" TEXT,
    "rsa_pin" TEXT,
    "pfa" TEXT,
    "employee_rate" DECIMAL(5,2),
    "employer_rate" DECIMAL(5,2),
    "cac_number" TEXT,
    "tin" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employer_income_history" (
    "id" TEXT NOT NULL,
    "employer_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "gross" DECIMAL(14,2) NOT NULL,
    "tax_deducted" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pension" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "includes_bonus" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employer_income_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employer_documents" (
    "id" TEXT NOT NULL,
    "employer_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "category_label" TEXT NOT NULL,
    "date" TEXT,
    "url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'MISSING',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employer_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payers_user_id_idx" ON "payers"("user_id");
CREATE INDEX "payer_transactions_payer_id_date_idx" ON "payer_transactions"("payer_id", "date");
CREATE INDEX "payer_transactions_payer_id_status_idx" ON "payer_transactions"("payer_id", "status");
CREATE INDEX "payer_documents_payer_id_idx" ON "payer_documents"("payer_id");
CREATE INDEX "employers_user_id_idx" ON "employers"("user_id");
CREATE UNIQUE INDEX "employer_income_history_employer_id_period_key" ON "employer_income_history"("employer_id", "period");
CREATE INDEX "employer_income_history_employer_id_idx" ON "employer_income_history"("employer_id");
CREATE INDEX "employer_documents_employer_id_idx" ON "employer_documents"("employer_id");

ALTER TABLE "payers" ADD CONSTRAINT "payers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payer_transactions" ADD CONSTRAINT "payer_transactions_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "payers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payer_documents" ADD CONSTRAINT "payer_documents_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "payers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employers" ADD CONSTRAINT "employers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employer_income_history" ADD CONSTRAINT "employer_income_history_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "employers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employer_documents" ADD CONSTRAINT "employer_documents_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "employers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
