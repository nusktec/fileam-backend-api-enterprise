-- Remove company from invitation and consultant connection flow.
-- Consultant and client are linked directly by user IDs.

-- 1) Add consultant_user_id to invitations
ALTER TABLE "invitations" ADD COLUMN "consultant_user_id" TEXT;

-- 2) Add consultant_user_id to consultant_connections
ALTER TABLE "consultant_connections" ADD COLUMN "consultant_user_id" TEXT;

-- 3) Backfill: invitations.consultant_user_id = company.owner_id
UPDATE "invitations" i
SET consultant_user_id = c.owner_id
FROM "companies" c
WHERE i.company_id = c.id AND c.owner_id IS NOT NULL;

-- 4) Backfill: consultant_connections.consultant_user_id = company.owner_id
UPDATE "consultant_connections" cc
SET consultant_user_id = c.owner_id
FROM "companies" c
WHERE cc.company_id = c.id AND c.owner_id IS NOT NULL;

-- 5) Update client companies: set owner_id = consultant, managed_by_company_id = null
UPDATE "companies" client
SET owner_id = c.owner_id,
    managed_by_company_id = NULL
FROM "consultant_connections" cc
JOIN "companies" c ON c.id = cc.company_id
WHERE cc.client_company_id = client.id AND client.linked_user_id IS NOT NULL;

-- 6) Drop old FKs
ALTER TABLE "invitations" DROP CONSTRAINT IF EXISTS "invitations_company_id_fkey";
ALTER TABLE "consultant_connections" DROP CONSTRAINT IF EXISTS "consultant_connections_company_id_fkey";
ALTER TABLE "consultant_connections" DROP CONSTRAINT IF EXISTS "consultant_connections_client_company_id_fkey";

-- 7) Drop old columns
ALTER TABLE "invitations" DROP COLUMN IF EXISTS "company_id";
ALTER TABLE "consultant_connections" DROP COLUMN IF EXISTS "company_id";
ALTER TABLE "consultant_connections" DROP COLUMN IF EXISTS "client_company_id";

-- 8) Delete consultant companies (no linked user = consultant firm, not client workspace)
DELETE FROM "companies"
WHERE linked_user_id IS NULL;

-- 9) Set NOT NULL and add FK for invitations (rows without consultant_user_id are dropped by cascade or we set a placeholder)
-- For any remaining invitations without consultant_user_id, delete them (orphaned)
DELETE FROM "invitations" WHERE consultant_user_id IS NULL;
ALTER TABLE "invitations" ALTER COLUMN "consultant_user_id" SET NOT NULL;

-- 10) Set NOT NULL and add FK for consultant_connections
DELETE FROM "consultant_connections" WHERE consultant_user_id IS NULL;
ALTER TABLE "consultant_connections" ALTER COLUMN "consultant_user_id" SET NOT NULL;

-- 11) Add FKs
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_consultant_user_id_fkey"
  FOREIGN KEY ("consultant_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "consultant_connections" ADD CONSTRAINT "consultant_connections_consultant_user_id_fkey"
  FOREIGN KEY ("consultant_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
