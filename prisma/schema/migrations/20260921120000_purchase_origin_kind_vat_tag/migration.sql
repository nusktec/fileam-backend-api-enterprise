-- Expense purchase descriptors + VAT classification
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "purchase_origin" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "purchase_kind" TEXT NOT NULL DEFAULT 'service';
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "vat_tag" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "inventory_item_id" TEXT;
CREATE INDEX IF NOT EXISTS "expenses_inventory_item_id_idx" ON "expenses"("inventory_item_id");
CREATE INDEX IF NOT EXISTS "expenses_converted_to_asset_id_idx" ON "expenses"("converted_to_asset_id");

-- Sale VAT classification + asset-sale sync
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "vat_tag" TEXT;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "asset_sale_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "sales_asset_sale_id_key" ON "sales"("asset_sale_id");
