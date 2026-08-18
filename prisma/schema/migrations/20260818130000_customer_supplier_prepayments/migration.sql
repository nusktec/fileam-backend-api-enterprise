-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "customer_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "business_name" TEXT,
    "email" TEXT,
    "tin" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_documents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "supplier_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "business_name" TEXT,
    "email" TEXT,
    "contact_person" TEXT,
    "tin" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_documents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prepayments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "prepayment_code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "original_amount" DECIMAL(14,2) NOT NULL,
    "amount_recognized" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remaining_balance" DECIMAL(14,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "service_start_date" DATE NOT NULL,
    "service_end_date" DATE NOT NULL,
    "recognition_frequency" TEXT NOT NULL,
    "expense_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "next_recognition_date" DATE,
    "consultant_id" TEXT,
    "consultant_name" TEXT,
    "evidence_urls" JSONB NOT NULL DEFAULT '[]',
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prepayments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prepayment_schedule_items" (
    "id" TEXT NOT NULL,
    "prepayment_id" TEXT NOT NULL,
    "schedule_code" TEXT NOT NULL,
    "recognition_date" DATE NOT NULL,
    "recognition_period" TEXT NOT NULL,
    "amount_deducted" DECIMAL(14,2) NOT NULL,
    "amount_added_to_expense" DECIMAL(14,2) NOT NULL,
    "balance_before" DECIMAL(14,2) NOT NULL,
    "balance_after" DECIMAL(14,2) NOT NULL,
    "expense_type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "expense_id" TEXT,
    "recognized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prepayment_schedule_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customers_user_id_customer_code_key" ON "customers"("user_id", "customer_code");
CREATE INDEX "customers_user_id_status_idx" ON "customers"("user_id", "status");
CREATE INDEX "customer_documents_customer_id_idx" ON "customer_documents"("customer_id");
CREATE INDEX "customer_documents_user_id_sale_id_idx" ON "customer_documents"("user_id", "sale_id");

CREATE UNIQUE INDEX "suppliers_user_id_supplier_code_key" ON "suppliers"("user_id", "supplier_code");
CREATE INDEX "suppliers_user_id_status_idx" ON "suppliers"("user_id", "status");
CREATE INDEX "supplier_documents_supplier_id_idx" ON "supplier_documents"("supplier_id");
CREATE INDEX "supplier_documents_user_id_expense_id_idx" ON "supplier_documents"("user_id", "expense_id");

CREATE UNIQUE INDEX "prepayments_user_id_prepayment_code_key" ON "prepayments"("user_id", "prepayment_code");
CREATE INDEX "prepayments_user_id_status_idx" ON "prepayments"("user_id", "status");
CREATE UNIQUE INDEX "prepayment_schedule_items_prepayment_id_schedule_code_key" ON "prepayment_schedule_items"("prepayment_id", "schedule_code");
CREATE INDEX "prepayment_schedule_items_prepayment_id_recognition_date_idx" ON "prepayment_schedule_items"("prepayment_id", "recognition_date");

ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_documents" ADD CONSTRAINT "supplier_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_documents" ADD CONSTRAINT "supplier_documents_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prepayments" ADD CONSTRAINT "prepayments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prepayment_schedule_items" ADD CONSTRAINT "prepayment_schedule_items_prepayment_id_fkey" FOREIGN KEY ("prepayment_id") REFERENCES "prepayments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
