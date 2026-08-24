-- Beneficiaries module (outbound payees / WHT ledger)

CREATE TABLE "beneficiaries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "beneficiary_type" TEXT NOT NULL,
    "vendor_category" TEXT,
    "party_type" TEXT,
    "entity_type" TEXT NOT NULL,
    "residency" TEXT NOT NULL,
    "tin" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "bank_name" TEXT,
    "account_name" TEXT,
    "account_number" TEXT,
    "vat_applicable" BOOLEAN NOT NULL DEFAULT false,
    "wht_applicable" BOOLEAN NOT NULL DEFAULT false,
    "total_wht" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "outstanding" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remitted" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "last_transaction_date" TEXT,
    "wht_due_date" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beneficiaries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "beneficiary_transactions" (
    "id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "entry_type" TEXT NOT NULL,
    "invoice_number" TEXT,
    "invoice_id" TEXT,
    "invoice_status" TEXT,
    "wht_class" TEXT NOT NULL,
    "statutory_wht_rate" DECIMAL(5,2) NOT NULL,
    "wht_rate_override" BOOLEAN NOT NULL DEFAULT false,
    "wht_override_reason" TEXT,
    "gross_amount" DECIMAL(14,2) NOT NULL,
    "wht_rate" DECIMAL(5,2) NOT NULL,
    "wht_amount" DECIMAL(14,2) NOT NULL,
    "net_payable" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beneficiary_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "beneficiary_documents" (
    "id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "category_label" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "linked" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beneficiary_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "beneficiaries_user_id_idx" ON "beneficiaries"("user_id");
CREATE INDEX "beneficiary_transactions_beneficiary_id_date_idx" ON "beneficiary_transactions"("beneficiary_id", "date");
CREATE INDEX "beneficiary_transactions_beneficiary_id_entry_type_idx" ON "beneficiary_transactions"("beneficiary_id", "entry_type");
CREATE UNIQUE INDEX "beneficiary_transactions_beneficiary_id_reference_key" ON "beneficiary_transactions"("beneficiary_id", "reference");
CREATE INDEX "beneficiary_documents_beneficiary_id_idx" ON "beneficiary_documents"("beneficiary_id");

ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "beneficiary_transactions" ADD CONSTRAINT "beneficiary_transactions_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "beneficiary_documents" ADD CONSTRAINT "beneficiary_documents_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
