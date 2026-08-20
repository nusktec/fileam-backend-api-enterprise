-- Cash & bank balances, ledger, unit attribution, receivables

CREATE TABLE "cash_balances" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "cash_code" TEXT NOT NULL,
    "cash_type" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_balances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "bank_code" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,
    "account_purpose" TEXT NOT NULL,
    "source_of_opening_balance" TEXT,
    "opening_balance" DECIMAL(14,2) NOT NULL,
    "balance_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ledger_transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reference_type" TEXT NOT NULL,
    "reference_id" TEXT,
    "description" TEXT NOT NULL,
    "transaction_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "reversal_of_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "account_code" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "unit_attributions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "brand_name" TEXT,
    "sku_code" TEXT,
    "description" TEXT,
    "unit_of_measurement" TEXT NOT NULL,
    "period_type" TEXT NOT NULL,
    "administrator_name" TEXT,
    "factory_plant_name" TEXT,
    "department" TEXT,
    "branch_location" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_attributions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "unit_attribution_production_records" (
    "id" TEXT NOT NULL,
    "unit_attribution_id" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "period_label" TEXT NOT NULL,
    "units_attributed" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "unit_cost" DECIMAL(14,2),
    "batch_lot_number" TEXT,
    "production_line" TEXT,
    "shift" TEXT,
    "location_warehouse" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_attribution_production_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "receivables" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "receivable_code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "party_name" TEXT,
    "supplier_id" TEXT,
    "supplier_name" TEXT,
    "asset_id" TEXT,
    "employee_id" TEXT,
    "gross_amount" DECIMAL(14,2) NOT NULL,
    "amount_received" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "outstanding_amount" DECIMAL(14,2) NOT NULL,
    "due_date" DATE,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receivables_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cash_balances_user_id_cash_code_key" ON "cash_balances"("user_id", "cash_code");
CREATE INDEX "cash_balances_user_id_idx" ON "cash_balances"("user_id");

CREATE UNIQUE INDEX "bank_accounts_user_id_bank_code_key" ON "bank_accounts"("user_id", "bank_code");
CREATE INDEX "bank_accounts_user_id_idx" ON "bank_accounts"("user_id");

CREATE INDEX "ledger_transactions_user_id_transaction_date_idx" ON "ledger_transactions"("user_id", "transaction_date");
CREATE INDEX "ledger_transactions_user_id_reference_type_reference_id_idx" ON "ledger_transactions"("user_id", "reference_type", "reference_id");
CREATE INDEX "ledger_entries_transaction_id_idx" ON "ledger_entries"("transaction_id");
CREATE INDEX "ledger_entries_account_code_idx" ON "ledger_entries"("account_code");

CREATE UNIQUE INDEX "unit_attributions_asset_id_key" ON "unit_attributions"("asset_id");
CREATE INDEX "unit_attributions_user_id_idx" ON "unit_attributions"("user_id");

CREATE UNIQUE INDEX "unit_attribution_production_records_unit_attribution_id_period_start_key" ON "unit_attribution_production_records"("unit_attribution_id", "period_start");
CREATE INDEX "unit_attribution_production_records_unit_attribution_id_period_start_idx" ON "unit_attribution_production_records"("unit_attribution_id", "period_start");

CREATE UNIQUE INDEX "receivables_user_id_receivable_code_key" ON "receivables"("user_id", "receivable_code");
CREATE INDEX "receivables_user_id_type_idx" ON "receivables"("user_id", "type");
CREATE INDEX "receivables_user_id_status_idx" ON "receivables"("user_id", "status");

ALTER TABLE "cash_balances" ADD CONSTRAINT "cash_balances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "unit_attributions" ADD CONSTRAINT "unit_attributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "unit_attributions" ADD CONSTRAINT "unit_attributions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "unit_attribution_production_records" ADD CONSTRAINT "unit_attribution_production_records_unit_attribution_id_fkey" FOREIGN KEY ("unit_attribution_id") REFERENCES "unit_attributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
