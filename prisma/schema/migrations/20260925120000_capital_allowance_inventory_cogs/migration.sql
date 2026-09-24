-- Asset capital-allowance fields
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "expenditure_type" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "business_use_percent" DECIMAL(5, 2);

-- Inventory inbound receipt extra cost
ALTER TABLE "inventory_movements" ADD COLUMN IF NOT EXISTS "acquisition_cost" DECIMAL(14, 2) NOT NULL DEFAULT 0;

-- Effective-dated capital allowance config (NTA 2025 Table I)
CREATE TABLE IF NOT EXISTS "capital_allowance_config" (
  "id" TEXT NOT NULL,
  "regime_id" TEXT NOT NULL,
  "tax_jurisdiction" TEXT NOT NULL,
  "tax_law" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "short_name" TEXT NOT NULL,
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "capital_allowance_class" TEXT NOT NULL,
  "expenditure_type" TEXT NOT NULL,
  "expenditure_type_label" TEXT NOT NULL,
  "annual_rate" DECIMAL(8, 4) NOT NULL,
  "calculation_method" TEXT NOT NULL,
  "initial_allowance_applicable" BOOLEAN NOT NULL,
  "initial_rate" DECIMAL(8, 4) NOT NULL,
  "residual_rate" DECIMAL(8, 4) NOT NULL,
  "qualifying" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "capital_allowance_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "capital_allowance_config_expenditure_type_effective_from_key"
  ON "capital_allowance_config"("expenditure_type", "effective_from");
CREATE INDEX IF NOT EXISTS "capital_allowance_config_status_effective_from_idx"
  ON "capital_allowance_config"("status", "effective_from");

INSERT INTO "capital_allowance_config" (
  "id", "regime_id", "tax_jurisdiction", "tax_law", "name", "short_name",
  "effective_from", "effective_to", "capital_allowance_class", "expenditure_type",
  "expenditure_type_label", "annual_rate", "calculation_method",
  "initial_allowance_applicable", "initial_rate", "residual_rate", "qualifying",
  "status", "created_at", "updated_at"
) VALUES
  ('ca-nta-2025-BUILDING', 'nta-2025', 'Nigeria', 'Nigeria Tax Act 2025', 'Nigeria Tax Act 2025', 'NTA 2025', '2026-01-01', NULL, 'CLASS_1', 'BUILDING', 'Building expenditure', 0.10, 'STRAIGHT_LINE', false, 0, 0.01, true, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ca-nta-2025-AGRICULTURAL', 'nta-2025', 'Nigeria', 'Nigeria Tax Act 2025', 'Nigeria Tax Act 2025', 'NTA 2025', '2026-01-01', NULL, 'CLASS_1', 'AGRICULTURAL', 'Agricultural expenditure', 0.10, 'STRAIGHT_LINE', false, 0, 0.01, true, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ca-nta-2025-MAST', 'nta-2025', 'Nigeria', 'Nigeria Tax Act 2025', 'Nigeria Tax Act 2025', 'NTA 2025', '2026-01-01', NULL, 'CLASS_1', 'MAST', 'Mast expenditure', 0.10, 'STRAIGHT_LINE', false, 0, 0.01, true, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ca-nta-2025-INTANGIBLE_ASSETS', 'nta-2025', 'Nigeria', 'Nigeria Tax Act 2025', 'Nigeria Tax Act 2025', 'NTA 2025', '2026-01-01', NULL, 'CLASS_1', 'INTANGIBLE_ASSETS', 'Intangible assets expenditure', 0.10, 'STRAIGHT_LINE', false, 0, 0.01, true, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ca-nta-2025-HEAVY_TRANSPORTATION', 'nta-2025', 'Nigeria', 'Nigeria Tax Act 2025', 'Nigeria Tax Act 2025', 'NTA 2025', '2026-01-01', NULL, 'CLASS_1', 'HEAVY_TRANSPORTATION', 'Heavy transportation expenditure', 0.10, 'STRAIGHT_LINE', false, 0, 0.01, true, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ca-nta-2025-PLANT', 'nta-2025', 'Nigeria', 'Nigeria Tax Act 2025', 'Nigeria Tax Act 2025', 'NTA 2025', '2026-01-01', NULL, 'CLASS_2', 'PLANT', 'Plant expenditure', 0.20, 'STRAIGHT_LINE', false, 0, 0.01, true, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ca-nta-2025-AGRICULTURAL_EQUIPMENT', 'nta-2025', 'Nigeria', 'Nigeria Tax Act 2025', 'Nigeria Tax Act 2025', 'NTA 2025', '2026-01-01', NULL, 'CLASS_2', 'AGRICULTURAL_EQUIPMENT', 'Agricultural equipment expenditure', 0.20, 'STRAIGHT_LINE', false, 0, 0.01, true, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ca-nta-2025-FURNITURE_FITTINGS', 'nta-2025', 'Nigeria', 'Nigeria Tax Act 2025', 'Nigeria Tax Act 2025', 'NTA 2025', '2026-01-01', NULL, 'CLASS_2', 'FURNITURE_FITTINGS', 'Furniture & fittings expenditure', 0.20, 'STRAIGHT_LINE', false, 0, 0.01, true, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ca-nta-2025-MINING', 'nta-2025', 'Nigeria', 'Nigeria Tax Act 2025', 'Nigeria Tax Act 2025', 'NTA 2025', '2026-01-01', NULL, 'CLASS_2', 'MINING', 'Mining expenditure', 0.20, 'STRAIGHT_LINE', false, 0, 0.01, true, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ca-nta-2025-OTHER_EQUIPMENT', 'nta-2025', 'Nigeria', 'Nigeria Tax Act 2025', 'Nigeria Tax Act 2025', 'NTA 2025', '2026-01-01', NULL, 'CLASS_2', 'OTHER_EQUIPMENT', 'Other equipment expenditure', 0.20, 'STRAIGHT_LINE', false, 0, 0.01, true, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ca-nta-2025-MOTOR_VEHICLE', 'nta-2025', 'Nigeria', 'Nigeria Tax Act 2025', 'Nigeria Tax Act 2025', 'NTA 2025', '2026-01-01', NULL, 'CLASS_3', 'MOTOR_VEHICLE', 'Motor vehicle expenditure', 0.25, 'STRAIGHT_LINE', false, 0, 0.01, true, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ca-nta-2025-SOFTWARE', 'nta-2025', 'Nigeria', 'Nigeria Tax Act 2025', 'Nigeria Tax Act 2025', 'NTA 2025', '2026-01-01', NULL, 'CLASS_3', 'SOFTWARE', 'Software expenditure', 0.25, 'STRAIGHT_LINE', false, 0, 0.01, true, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ca-nta-2025-OTHER_CAPITAL', 'nta-2025', 'Nigeria', 'Nigeria Tax Act 2025', 'Nigeria Tax Act 2025', 'NTA 2025', '2026-01-01', NULL, 'CLASS_3', 'OTHER_CAPITAL', 'Other capital expenditure', 0.25, 'STRAIGHT_LINE', false, 0, 0.01, true, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("expenditure_type", "effective_from") DO NOTHING;
