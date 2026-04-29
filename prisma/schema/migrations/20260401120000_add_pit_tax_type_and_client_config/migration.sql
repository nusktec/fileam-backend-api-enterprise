-- PIT filing type + optional client toggle (Personal Income Tax)

ALTER TABLE "client_tax_configurations" ADD COLUMN IF NOT EXISTS "pit" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "filing_tax_type_options" ("id", "code", "label", "sort_order", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid()::text,
       'PIT',
       'Personal Income Tax',
       5,
       true,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "filing_tax_type_options" WHERE "code" = 'PIT');
