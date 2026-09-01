-- Soft-delete inventory items so deleted products no longer count in current assets.
ALTER TABLE "inventory_items" ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "inventory_items_user_id_deleted_at_idx" ON "inventory_items"("user_id", "deleted_at");
