-- CreateTable
CREATE TABLE "payment_records" (
    "id" TEXT NOT NULL,
    "tax_payable_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount_paid" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "external_reference" TEXT,
    "external_payment_id" TEXT,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paid_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_payables" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tax_type" TEXT NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "amount_due" DECIMAL(14,2) NOT NULL,
    "penalties" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_payable" DECIMAL(14,2) NOT NULL,
    "filing_due_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_payables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_payables_user_id_tax_type_period_year_period_month_key" ON "tax_payables"("user_id", "tax_type", "period_year", "period_month");

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_tax_payable_id_fkey" FOREIGN KEY ("tax_payable_id") REFERENCES "tax_payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_payables" ADD CONSTRAINT "tax_payables_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
