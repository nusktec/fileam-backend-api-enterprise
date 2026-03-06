-- Run this manually if "companies.owner_id does not exist" and migrate deploy is not an option.
-- Adds the link between the user who created a company and the company (owner).

-- 1) Add the column (ignore error if it already exists)
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "owner_id" TEXT;

-- 2) Add the foreign key (run only once; skip if you get "constraint already exists")
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_fkey" 
  FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
