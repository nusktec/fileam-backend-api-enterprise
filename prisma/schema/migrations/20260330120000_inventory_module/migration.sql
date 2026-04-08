-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "purchase_cost" DECIMAL(14,2) NOT NULL,
    "selling_price" DECIMAL(14,2) NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL,
    "low_stock_alert_level" DECIMAL(14,2) NOT NULL,
    "supplier_name" TEXT,
    "supplier_id" TEXT,
    "last_sale_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_sales" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sold_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "customer_name" TEXT,
    "customer_id" TEXT,

    CONSTRAINT "inventory_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_sale_lines" (
    "id" TEXT NOT NULL,
    "inventory_sale_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL,
    "unit_selling_price" DECIMAL(14,2) NOT NULL,
    "unit_cost" DECIMAL(14,2) NOT NULL,
    "line_total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "inventory_sale_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity_delta" DECIMAL(14,2) NOT NULL,
    "quantity_after" DECIMAL(14,2) NOT NULL,
    "inventory_sale_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_items_user_id_idx" ON "inventory_items"("user_id");

-- CreateIndex
CREATE INDEX "inventory_items_user_id_category_idx" ON "inventory_items"("user_id", "category");

-- CreateIndex
CREATE INDEX "inventory_sales_user_id_sold_at_idx" ON "inventory_sales"("user_id", "sold_at");

-- CreateIndex
CREATE INDEX "inventory_sale_lines_inventory_sale_id_idx" ON "inventory_sale_lines"("inventory_sale_id");

-- CreateIndex
CREATE INDEX "inventory_sale_lines_inventory_item_id_idx" ON "inventory_sale_lines"("inventory_item_id");

-- CreateIndex
CREATE INDEX "inventory_movements_user_id_created_at_idx" ON "inventory_movements"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_inventory_item_id_created_at_idx" ON "inventory_movements"("inventory_item_id", "created_at");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_sales" ADD CONSTRAINT "inventory_sales_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_sale_lines" ADD CONSTRAINT "inventory_sale_lines_inventory_sale_id_fkey" FOREIGN KEY ("inventory_sale_id") REFERENCES "inventory_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_sale_lines" ADD CONSTRAINT "inventory_sale_lines_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventory_sale_id_fkey" FOREIGN KEY ("inventory_sale_id") REFERENCES "inventory_sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
