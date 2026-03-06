-- Add companies.owner_id: clear existing companies first (owner_id is required for new data),
-- then add column and FK. All company-related data is removed so new companies have an owner.

-- 1) Delete all companies and dependent data (invitations, consultant_connections, enterprise_*)
TRUNCATE TABLE "companies" CASCADE;

-- 2) Add owner_id column (table is empty so no nulls)
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "owner_id" TEXT;

-- 3) Add foreign key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_owner_id_fkey'
  ) THEN
    ALTER TABLE "companies"
    ADD CONSTRAINT "companies_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
