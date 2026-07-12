-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "asset_code" TEXT NOT NULL,
    "asset_type" TEXT NOT NULL,
    "asset_name" TEXT NOT NULL,
    "purchase_date" DATE NOT NULL,
    "purchase_cost" DECIMAL(14,2) NOT NULL,
    "vendor" TEXT,
    "evidence_url" TEXT,
    "depreciation_method" TEXT,
    "useful_life" INTEGER,
    "residual_value" DECIMAL(14,2),
    "serial_number" TEXT,
    "asset_location" TEXT,
    "additional_note" TEXT,
    "assign_to_consultant" BOOLEAN NOT NULL DEFAULT false,
    "consultant_review_status" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_transfers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "transfer_code" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "transfer_type" TEXT NOT NULL,
    "from_location" TEXT NOT NULL,
    "to_location" TEXT NOT NULL,
    "transfer_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_sales" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sale_code" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "sale_date" DATE NOT NULL,
    "sale_price" DECIMAL(14,2) NOT NULL,
    "buyer" TEXT NOT NULL,
    "book_value_at_sale" DECIMAL(14,2) NOT NULL,
    "gain_loss_type" TEXT NOT NULL,
    "gain_loss_amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_disposals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "disposal_code" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "disposal_reason" TEXT NOT NULL,
    "disposal_date" DATE NOT NULL,
    "note" TEXT NOT NULL,
    "evidence_url" TEXT,
    "book_value_at_disposal" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_disposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assets_asset_code_key" ON "assets"("asset_code");

-- CreateIndex
CREATE INDEX "assets_user_id_idx" ON "assets"("user_id");

-- CreateIndex
CREATE INDEX "assets_user_id_status_idx" ON "assets"("user_id", "status");

-- CreateIndex
CREATE INDEX "assets_user_id_asset_type_idx" ON "assets"("user_id", "asset_type");

-- CreateIndex
CREATE UNIQUE INDEX "asset_transfers_transfer_code_key" ON "asset_transfers"("transfer_code");

-- CreateIndex
CREATE INDEX "asset_transfers_user_id_idx" ON "asset_transfers"("user_id");

-- CreateIndex
CREATE INDEX "asset_transfers_user_id_status_idx" ON "asset_transfers"("user_id", "status");

-- CreateIndex
CREATE INDEX "asset_transfers_asset_id_idx" ON "asset_transfers"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_sales_sale_code_key" ON "asset_sales"("sale_code");

-- CreateIndex
CREATE INDEX "asset_sales_user_id_idx" ON "asset_sales"("user_id");

-- CreateIndex
CREATE INDEX "asset_sales_asset_id_idx" ON "asset_sales"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_disposals_disposal_code_key" ON "asset_disposals"("disposal_code");

-- CreateIndex
CREATE INDEX "asset_disposals_user_id_idx" ON "asset_disposals"("user_id");

-- CreateIndex
CREATE INDEX "asset_disposals_asset_id_idx" ON "asset_disposals"("asset_id");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_transfers" ADD CONSTRAINT "asset_transfers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_transfers" ADD CONSTRAINT "asset_transfers_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_sales" ADD CONSTRAINT "asset_sales_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_sales" ADD CONSTRAINT "asset_sales_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_disposals" ADD CONSTRAINT "asset_disposals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_disposals" ADD CONSTRAINT "asset_disposals_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
