-- Asset Reviews: evidenceUrls[], assigned consultant, unified history
-- Note: User model maps to table "User" (not "users").

ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "evidence_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "assigned_consultant_id" TEXT;

-- Backfill evidence_urls from legacy evidence_url
UPDATE "assets"
SET "evidence_urls" = ARRAY["evidence_url"]
WHERE "evidence_url" IS NOT NULL
  AND "evidence_url" <> ''
  AND (cardinality("evidence_urls") = 0 OR "evidence_urls" IS NULL);

CREATE INDEX IF NOT EXISTS "assets_user_id_assign_to_consultant_idx" ON "assets"("user_id", "assign_to_consultant");
CREATE INDEX IF NOT EXISTS "assets_assigned_consultant_id_idx" ON "assets"("assigned_consultant_id");

ALTER TABLE "assets"
  DROP CONSTRAINT IF EXISTS "assets_assigned_consultant_id_fkey";
ALTER TABLE "assets"
  ADD CONSTRAINT "assets_assigned_consultant_id_fkey"
  FOREIGN KEY ("assigned_consultant_id") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "asset_histories" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "event_date" DATE NOT NULL,
  "details" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_histories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "asset_histories_user_id_event_date_idx" ON "asset_histories"("user_id", "event_date");
CREATE INDEX IF NOT EXISTS "asset_histories_user_id_type_idx" ON "asset_histories"("user_id", "type");
CREATE INDEX IF NOT EXISTS "asset_histories_asset_id_event_date_idx" ON "asset_histories"("asset_id", "event_date");

ALTER TABLE "asset_histories"
  DROP CONSTRAINT IF EXISTS "asset_histories_user_id_fkey";
ALTER TABLE "asset_histories"
  ADD CONSTRAINT "asset_histories_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "asset_histories"
  DROP CONSTRAINT IF EXISTS "asset_histories_asset_id_fkey";
ALTER TABLE "asset_histories"
  ADD CONSTRAINT "asset_histories_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "assets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed ASSET_ACQUIRED history for existing assets that have none
INSERT INTO "asset_histories" ("id", "user_id", "asset_id", "type", "event_date", "details", "created_at")
SELECT
  gen_random_uuid()::text,
  a."user_id",
  a."id",
  'ASSET_ACQUIRED',
  a."purchase_date",
  jsonb_build_object(
    'assetName', a."asset_name",
    'vendor', COALESCE(a."vendor", ''),
    'purchaseCost', a."purchase_cost",
    'assignedEmployee', NULL
  ),
  NOW()
FROM "assets" a
WHERE NOT EXISTS (
  SELECT 1 FROM "asset_histories" h
  WHERE h."asset_id" = a."id" AND h."type" = 'ASSET_ACQUIRED'
);
